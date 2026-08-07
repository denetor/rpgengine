# BUS — EventBus

**Area:** Core · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `BUS-*`
**Spec:** [`specs/bus-event-bus.md`](../specs/bus-event-bus.md)

## Purpose

Carry the **domain events** — immutable notifications of facts that have already happened — from
whoever produces them to whoever reacts to them, without the two knowing each other. It is the
system's only channel of *indirect* communication: direct calls exist, but only from the
orchestration towards the services.

The bus is **not** a command channel and is **not** a query channel: it does not carry requests, does
not return values, does not wait for answers. Intents travelling the other way — the player asking
for a trade, a key being pressed — do **not** travel on it: `INP` accumulates them and the
orchestration pulls at a fixed point in the tick (BUS-3).

The bus decides what *"the same game twice"* means, and it decides it before any game exists. That is
why it has no configuration and no modes: it behaves identically in every build.

## Contract

| Item | Value |
|---|---|
| Depends on | no service. One construction argument: `onHandlerError` (BUS-9) |
| Does NOT depend on | `excalibur`, DOM, any other service, any type of this game |
| Consumed by | `game` (the loop that owns `flush()`), `game/orchestration`, `presentation` |
| Dynamic state | none savable. In flight: the queue, the tick's accumulated stream, the subscriptions. Outside a `flush()` the queue is **empty** (BUS-12) |
| Static state | none |
| Configuration | **none** — the only service in the catalogue that declares no parameters (BUS-15) |
| External data | none |
| Events emitted | none (it is the infrastructure) |
| Order of magnitude | ~10³ events/second with no perceptible degradation |

## Public API

```ts
type JsonValue =
  | string | number | boolean | null
  | readonly JsonValue[]
  | { readonly [k: string]: JsonValue };

type DomainEvent = { readonly type: string; readonly [k: string]: JsonValue };

type Phase = 'orchestration' | 'presentation';

interface EventBus<E extends DomainEvent> {
  /** Subscribes to one event type, in one phase. Returns the unsubscribe function. */
  on<T extends E['type']>(
    phase: Phase, type: T, handler: (e: Extract<E, { type: T }>) => void
  ): () => void;

  /** Subscribes to every event of the phase, delivered before the typed handlers. */
  onAny(phase: Phase, handler: (e: E) => void): () => void;

  /** Queues an event for delivery. Does not run the handlers. */
  publish(event: E): void;
  publishAll(events: readonly E[]): void;

  /** Drains the queue: the orchestration cascade, then the presentation. */
  flush(): void;

  /** Drops every subscription and discards the queue. Called outside a flush. */
  dispose(): void;
}

function createEventBus<E extends DomainEvent>(
  onHandlerError: (error: unknown, event: E) => void
): EventBus<E>;
```

`phase` is explicit at every call site and has **no default**: the two phases are the two subscriber
families ARC-4.3 permits, and a default would be silently wrong half the time.

The bus is **parametric on `E`**, supplied by whoever instantiates it. It never imports a type of
this game — nor could it: it lives under `engine/` and rule 4 of the boundary check
(`engine-may-not-import-the-layers-above`) fails the build on `engine/ → game/`.

## Requirements

**BUS-1** — Events **MUST** form a **discriminated union** on `type`, closed and known at compile
time. Subscribing to a non-existent type is a compile error, guaranteed by the type parameter and
checked by a `@ts-expect-error` assertion (see Test criteria) rather than restated as a rule.

**BUS-2** — Event payloads **MUST** be **plain data**, expressed as the `JsonValue` constraint above.
That constraint structurally rejects `Actor`s, `Map`s, `Set`s, `Date`s and functions, so this is a
property of the type and not a prohibition anyone can break. It exists for three reasons, none of
which is persistence — nothing in this system ever serializes an event:

- a payload holding a runtime reference hands the domain a door into the presentation (ARC-1,
  ARC-5.2: entities are referenced by `EntityId`);
- a payload holding a `Map` or a `Set` makes an iteration order undefined (ARC-9.4);
- a payload holding live service state lets a handler mutate the domain through an event BUS-4 calls
  immutable.

Event types **MUST** be declared as `type` aliases, never as `interface`s: in TypeScript only the
former gets the implicit index signature the constraint requires, and the failure is otherwise
inexplicable.

**BUS-3** — An event **MUST** describe a fact that has **already happened**, and **MUST NOT** be used
to request an action. The test is not the grammar of its name but the dependency: **the publisher
must not depend on anyone reacting**. Consequently **only the orchestration publishes** — the
presentation deposits intents (`INP.feed()`, the HUD's command API) and the orchestration drains them
at a fixed point in the tick. An intent published the instant a DOM event fires would take its
position in the delivery order from the browser's scheduler, which is ARC-9.1 lost to a cause no test
can point at.

**BUS-4** — Events **MUST** be **immutable**, and delivery **MUST** be **deferred and ordered**:
`publish()` queues, `flush()` delivers in FIFO order. Synchronous delivery inside `publish()` is not
allowed, since it would make the order depend on recursion depth.

**BUS-5** — Events published **during** a `flush()` **MUST** be queued and delivered within the same
`flush()`, after those already queued, until the queue is empty.

**BUS-6** — `flush()` **MUST** deliver in **two phases**: first the whole cascade to the
**orchestration** handlers, draining to quiescence and accumulating every delivered event in order;
then, once, that accumulated stream to the **presentation** handlers.

The presentation queries the domain when it reacts (HUD-9), so a panel woken mid-cascade would get a
true answer about a state that never officially existed. Two phases also give the interface one
redraw point per tick, and make BUS-3 structural rather than a rule: a presentation handler runs when
the queue is already empty and has no cascade to publish into.

**BUS-7** — Within a phase, `onAny` handlers **MUST** run **before** the typed handlers for the same
event, and typed handlers **MUST** run in subscription order. The orchestration's subscription order
**MUST** be fixed by a single explicit list registering the themes of ARC-4.4 — a file that can be
read and diffed, as the scene registry already is.

This requirement is load-bearing in the **orchestration** phase only. Presentation subscriptions
arrive in an order set by which screen the player opened first: deterministic, but nothing to reason
about, and harmless because those handlers cannot touch the domain.

**BUS-8** — `flush()` **MUST** bound **causal depth**. Events queued before the flush are generation
0; events published while delivering generation *n* form generation *n+1*. The limit is **32, a fixed
constant**. On exceeding it the bus **MUST throw**, listing the event types present in each of the
last three generations, in order — enough to read a cycle off the message.

The limit is deliberately **not configurable**: the only realistic use of such a knob is raising it
to silence a cycle.

**BUS-9** — An exception thrown by a handler **MUST** be treated according to its phase:

- **orchestration** — it **propagates**. A rule that did not run means a world missing a consequence,
  and that must fail as loudly as a cycle does;
- **presentation** — it **MUST** be caught, passed to `onHandlerError` with the event that caused it,
  and the remaining handlers **MUST** still run. The domain is already intact; a panel that failed to
  draw costs a panel.

`onHandlerError` is a **required** construction argument with no default: a generic service that
reaches for `console` has a dependency it never declared (ARC-3.2). There **MUST NOT** be any branch
that exists only in one build.

**BUS-10** — The set of handlers for an event **MUST** be fixed when delivery of **that event**
begins:

- a handler unsubscribed by an earlier handler still receives the current event, and stops from the
  next;
- a handler subscribed during delivery misses the current event and receives the next, including
  later events of the same flush;
- a handler that calls `flush()` **MUST** throw;
- unsubscribing twice, or after `dispose()`, **MUST** be a no-op.

Otherwise *who received this event* would depend on what earlier handlers happened to do, which
cannot be reasoned about at a subscription site.

**BUS-11** — `dispose()` **MUST** drop every subscription and discard the queue, and **MUST** be
called outside a `flush()` — called inside one it **MUST throw**, off the same flag that refuses a
reentrant `flush()`. The breach is otherwise invisible: `dispose()` swaps the queue the drain is
reading, so a context tearing itself down in reaction to an event would end the cascade mid-sentence,
drop every consequence queued behind it, and leave a tick indistinguishable from one that finished.
It is the bus's half of CTX-6.

**BUS-12** — Outside a `flush()` the queue **MUST** be empty. BUS-5 drains to quiescence and the game
loop owns the only call site, so a save taken at a tick boundary cannot lose an event in flight —
which is what makes "the bus has nothing to serialize" true rather than merely convenient.

**BUS-13** — `onAny` **MUST** observe every delivered event of its phase **exactly once**, in
delivery order. It exists for logging and for the development overlay; there is no journal and no
replay in this project.

**BUS-14** — Event `type` strings **MUST** be prefixed with the producing service (`inv/item-added`,
`qst/objective-completed`), and the union **MUST** be assembled in `game/` from the event types each
service exports on its own public surface. Two services claiming one string with *compatible*
payloads is the one collision the compiler cannot catch; the prefix removes it structurally, with no
check and no lint.

**BUS-15** — The bus **MUST** have no configuration, no `CFG` section and no modes. Its only
construction argument is `onHandlerError`.

**BUS-16** — A service **MUST NOT** subscribe to nor publish on the bus (ARC-4.3): the permitted
subscribers are the orchestration and the presentation, and the only publisher is the orchestration
(BUS-3). No new check is needed — a parameter typed `EventBus` requires importing the type, and rule
3 of the boundary check (`services-may-not-import-each-other`) already forbids that, with no
allowlist.

**BUS-17** — The delivery path carries three allocations — the queue, the per-event handler snapshot
of BUS-10, and the accumulated stream of BUS-6 — and each **MUST** carry its reason beside it. At the
order of magnitude declared above they are the *unavoidable* kind ARC-13.3 permits, and each buys a
stated guarantee. The snapshot is the one that may become copy-on-write if profiling ever asks,
**without changing a single observable rule**.

### Retired requirements

The first version of this sheet had twelve requirements; the argument for each removal is in
[`.scratch/event-bus/grill-log.md`](../../.scratch/event-bus/grill-log.md).

| Was | Outcome |
|---|---|
| old BUS-2 (JSON-serializable) | became the shape of a type — now BUS-2, with its real reason |
| old BUS-9 (must not import a domain type) | already enforced by boundary rule 4; kept as a note on the API |
| old BUS-10 (journal and replay) | cut: replaying a recorded stream re-executes the orchestration and duplicates every event |
| old BUS-11 (who published it, in dev) | cut: the publisher is always the orchestration, and the producer is in the discriminant |
| old BUS-12 (enforced by a new lint) | already enforced by boundary rule 3 — now BUS-16 |
| old BUS-7's *configurable* limit | fixed at 32: the only use of the knob was silencing a cycle |

## Test criteria

The seam is the public surface: no test reaches for the queue, the generation counter or the
subscription registries.

- FIFO with nested publications: everything at depth 2 arrives before anything at depth 3.
- **The phase boundary**: A publishes, an orchestration handler publishes B, and the presentation
  phase receives `[A, B]` only after *both* orchestration handlers have run.
- Stable invocation order for a given set of subscriptions, in the orchestration phase.
- A cycle throws within the limit, and the message names the types of the last three generations.
- A throwing handler aborts the flush in the orchestration phase; in the presentation phase the
  others still run and `onHandlerError` receives the error and its event.
- An event whose typed handler throws is **still in the `onAny` trace** — what makes "`onAny` first"
  load-bearing rather than decorative.
- `onAny` sees each event once, in its own phase, in delivery order.
- The BUS-10 rules: unsubscribed mid-delivery still receives the current event; subscribed
  mid-delivery misses it; reentrant `flush()` throws; double unsubscribe is a no-op.
- The queue is empty when `flush()` returns; after `dispose()` nothing is registered, and `dispose()`
  called from inside a flush throws.
- Two buses do not observe each other (the bus's half of ARC-8.3).
- The bus works with a made-up event union, foreign to this game (ARC-3.4).
- **The compile-time claims, via `@ts-expect-error`**: an unknown type at `on`; a payload carrying a
  `Date`, a `Map` or a function. BUS-1 and BUS-2 are guaranteed by the type system and by nothing
  that runs — if these assertions are ever deleted as redundant, both go unguarded and nothing says
  so.

## Links

- [`specs/bus-event-bus.md`](../specs/bus-event-bus.md) — the spec for step 2
- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-4 (mute services), ARC-5 (events and references),
  ARC-9 (determinism), ARC-13.3 (allocation)
- [`game-context.md`](./game-context.md) — who owns the bus instance
- [`input.md`](./input.md) · [`hud.md`](./hud.md) — where intents go instead of the bus (BUS-3)

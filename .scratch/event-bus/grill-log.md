# Grill log — BUS: the EventBus

**Date:** 2026-08-07
**Subject:** [`docs/services/event-bus.md`](../../docs/services/event-bus.md) — the sheet of the
service that carries every domain event, step 2 of §7.2.
**Status:** decisions agreed, nothing built and nothing edited. No plan, no tickets.

What the sheet already fixed, and was therefore not up for discussion: the bus carries facts and not
requests, delivery is deferred and ordered, `publish()` queues and `flush()` delivers, events
published during a flush are delivered inside it, and the bus is parametric on the event union. This
log records the fourteen decisions the document leaves open — and the six requirements it turned out
to be carrying that no longer have a reason to exist.

---

## 1 — Intents do not travel on the bus

**Decided:** the bus carries facts downward only. The presentation never publishes. `INP` accumulates
raw input through `feed()` and the **orchestration pulls** with `consume(now)` at a fixed point in
the tick; the HUD gets a **named command API exposed by `game/orchestration/`** — `equip(itemId,
slot)`, `requestTrade(merchantId)` — injected into the panels, which **enqueues** and is drained at
that same point. The rule that comes out: **only the orchestration publishes.**

**Why:** the sheet forbids using an event to request an action, and two other sheets already broke
it — `hud.md:25` declares "interface intents (`ui-equip-requested`, …)" and `input.md:24` claims
`action-triggered` among its emitted events. Those are commands wearing a past participle.

The decisive argument is not tidiness but timing. A DOM event fires when the browser decides, between
ticks. An intent published at that instant lands in whichever flush happens to be open, and its
position in the order becomes a function of browser scheduling — which is ARC-9.1 gone. Pulled at a
fixed point and timestamped with the `now` the orchestration passes in, it is deterministic by
construction. That is why `INP.consume()` already takes `now` and returns rather than publishes.

Injection alone would **not** have solved it: ARC-4.2 makes the *caller* publish what a command
returns, and if the scene calls `inp.feed()` the caller is the presentation. The event would be born
below and still enter the bus from above. What solves it is the pull, not the constructor.

**Why a named API rather than a stringly intent union for the HUD:** `INP.Action` is a closed
abstract set with no payload, deliberately generic (ARC-3.2); `ui-equip-requested` carries which
item, from which slot, onto whom. Pushing it through `INP` would make a generic service
domain-aware. A named API types the arguments, makes a typo a compile error, is discoverable by "go
to definition", and cannot be mistaken for the bus by a later reader.

**Not a second bus.** A pull queue has no subscription, no fan-out and no delivery order to reason
about: it is a mailbox emptied at one known instant.

**Consequences:** `hud.md` and `input.md` both lose their `Events emitted` rows. `action-triggered`
is not an event, it is the return value of `consume()`.

## 2 — No journal, no replay

**Decided:** cut. BUS-10 goes, with the `onAny` doc comment that mentions replay, the `onAny` test
criterion, and the `persistence.md` link labelled *"event journal and reproducibility"*.

**Why:** the cross-reference was dangling — `persistence.md` and `random.md` contain no mention of a
journal, a replay or an event stream. And "replaying a session" named two incompatible mechanisms:
the journal as an **oracle** (re-run from seed and inputs, diff the streams) and the journal as a
**source** (feed the recorded events back in). The second cannot work: orchestration handlers respond
to events by calling commands that return new events, so re-feeding a stream makes the orchestration
re-execute everything and emit a second copy of every event it originally caused.

**Scope of the cut, checked file by file.** Three groups share the words and only one was discarded:

- **Cut:** `event-bus.md` lines 37, 79–80, 94, 101.
- **Untouched — a different thing with the same name:** the **quest journal** of `QST-11`, `HUD-2`,
  `GP-50`, `expr.md:108`, `stats.md:105`, `services/README.md:75`.
- **Untouched — determinism, not a replay feature:** `REQUIREMENTS.md:629`,
  `tests-headless/lint.spec.ts:217` (a test that passes today), `ADR-0003:62` (accepted), and
  `specs/rnd-random-service.md:148`. Deleting these would take ARC-9.1, ADR-0001, the golden vectors
  and the determinism zones down with them — step 0, already committed.

**INP-9 kept, reworded off the word "replay":** *a scripted sequence of actions, fed into two games
with the same seed, produces the same result.* Its consumer is a regression test, not a player, and
it is what makes ARC-9.1 checkable above the RNG.

**`onAny` survives on a new justification:** logging and the dev overlay. Step 2's own testbed is
*"`bus` — events published and traced on screen"* (`REQUIREMENTS.md:620`); that trace **is** `onAny`.
Without it, every new event type has to be added to the overlay by hand, and the one that gets
forgotten is the one being hunted.

**Rename decided, for a reason other than the collision:** `journal` → `quest log`. Once BUS-10 is
gone there is no collision left, but in a codebase "journal" reads as *append-only event log*, so
`QST.journal()` invites exactly the assumption this decision deletes. Blast radius: `QST-11`,
`QST-12`, `quest.md` (`journal()` → `questLog()`, `JournalEntry` → `QuestLogEntry`), `HUD-2`,
`GP-50`, `expr.md`, `stats.md`, `services/README.md`.

## 3 — Two-phase flush, called by the game loop

**Decided:** one `flush()` drains the cascade delivering to the **orchestration** only, accumulating
every delivered event in order; when the queue is empty, that accumulated stream is handed to the
**presentation**, once. The single call site is the **game loop in `game/`**: drain the intents, run
the tick, `flush()`.

**Why:** BUS-5 makes one flush drain an arbitrarily deep causal chain, so every subscriber runs
inside a half-finished transaction. For the orchestration that is the job. For the presentation it is
not, because the presentation **queries**: HUD-9 says that if a panel needs to know whether an item
is equippable, *"the answer comes from `STAT`"*. A HUD handler firing at cascade depth 3 asks `STAT`
about a world where half the tick's consequences have landed — and gets a true answer about a state
that never officially existed.

**What it buys beyond consistency:** one redraw point per tick instead of one per cascade level; and
decision 1 becomes structural rather than a rule, because a presentation handler runs when the queue
is already empty and has no cascade to publish into. Re-entrancy dies with it.

**Costs, accepted:** the presentation observes events describing a world that has already moved on —
an entity spawned and killed in the same tick delivers both, in order, and the HUD must not assume
the entity still exists when it handles the first. And a subscriber must declare its phase.

**Why the game loop and not elsewhere:** not the presentation, which would put frame scheduling in
charge of domain ordering; not `TIME`, which does not exist at step 2 and would make the bus depend
on a service it must not know.

## 4 — The union lives in `game/`, discriminants are prefixed

**Decided:** engine services export their event types on their public surface, `game/` assembles the
union, the presentation imports it. Discriminants carry the producing service: `inv/item-added`,
`qst/objective-completed`.

**Why:** ARC-4.2 has each service return the events it produced, so the shapes are declared by the
services — including the generic ones — while the union is game-specific and can only be assembled in
`game/`. Every arrow legal under ARC-14.

The prefix exists for the one failure the compiler cannot reach. Roughly a hundred event names across
33 sheets, with near-misses already (`item-consumed` beside `affordance-consumed`, ten distinct
`*-changed`). Two services claiming one string with **different** payloads fails to compile at the
first field access — confusing, wrong location, but caught. With **compatible** payloads — both
`{ type, id: EntityId }`, entirely plausible given how many carry nothing else — nothing ever fails,
and a handler subscribed for one meaning silently fires on the other fact.

**Rejected:** a type-level uniqueness assertion over the union. It is a conditional-type trick that
fails obscurely, and it is the "condense several statements into one" that `CLAUDE.md` rules out —
the assertion would be harder to read than the bug it catches.

**Cost:** about a hundred names rewritten across the sheets, now, while they are all still `proposed`
and none is code; and `inv/item-added` is uglier at every subscription site. It pays back twice: the
overlay can group and filter by service for free, and the discriminant records the producing service
— which is most of what BUS-11 wanted a stack-trace hack to reconstruct (see 10).

## 5 — The cycle limit: generations, fixed at 32, throw

**Decided:** events queued before the flush are generation 0; events published while delivering
generation *n* form generation *n+1*. The limit bounds **causal depth** at **32, fixed, not
configurable**. On exceeding it the bus **throws**, reporting the types present in each of the last
three generations, in order.

**Why generations:** BUS-4 and BUS-5 give a single FIFO queue drained until empty — a structure with
no iterations in it. The countable thing had to be invented, and depth is the one with a meaning:
*no fact in this game is 32 causes removed from the fact that started it.* A legitimate deep cascade
(`item-picked → objective-completed → quest-completed → reward-granted → item-added → container-full`)
runs six or seven deep. A budget on total events delivered catches the same cycles later and with a
worse message, because a count of 10,000 says nothing about which events are looping.

**Why the last three generations:** a ping-pong reads off the message as `[a] [b] [a]`. No
cycle-detection algorithm, no bookkeeping outside the failure path.

**Why throw:** dropping the queue and carrying on leaves a world where some consequences of the tick
landed and others never will — the silent corruption the two-phase design exists to avoid. A crash
with a readable cause beats a world quietly missing half a transaction, and it still satisfies
"instead of freezing the game".

**Why not configurable — a change to the sheet.** Ask what raising it is for. Not a legitimate
cascade. The only realistic use of that knob is somebody hitting the error, raising the limit to 500,
and shipping the cycle. A configurable safety rail is a rail with a documented procedure for removing
it. Dropping the knob also removes the one parameter that would have forced `BUS` to declare a `CFG`
section (see 10).

## 6 — Exceptions: the policy differs by phase

**Decided:** in the **orchestration** phase an exception **propagates** — the tick fails loudly. In
the **presentation** phase it is **caught, passed to `onHandlerError`, and delivery continues**. The
"in development, rethrown at the end of `flush()`" clause is deleted.

**Why:** a handler that throws is a handler that did not run. In phase one that means a rule of the
game did not fire — the quest did not advance, the loot was not granted — and catching it lets the
player play on in a world quietly missing a consequence, which is the failure mode decision 5 chose
to throw over. In phase two the domain is already quiescent and intact: a panel that failed to redraw
is a broken widget, not a broken world. The distinction is only expressible because of decision 3.

**Why the dev clause goes:** it required the bus to know which mode it was running in, and it made
the control flow of the build under test differ from the build that ships. Under ARC-9.1 that is not
a diagnostic nicety, it is two different games.

**Why `onHandlerError` is a required construction parameter with no default:** there is no logging
service in the catalogue — all 33 sheets checked — and a generic engine service that reaches for
`console` has a dependency it did not declare, which is what ARC-3.2 exists to prevent. Required
rather than optional because a silent default is the thing this repo already refuses: `CFG` makes a
section declare `NO_FILTER` explicitly rather than infer it from absence. It also makes the behaviour
testable: pass a recording function, assert what arrived.

**Cost, stated:** a single buggy orchestration rule crashes the game. Correct for a single-player
RPG — a crash loses minutes, a corrupted world loses the save — and the game loop stays free to catch
at the top and show an error screen. That is a game decision and it stays out of the bus.

## 7 — Changing the subscriber set during delivery

**Decided, four rules:**

- **The handler list is snapshotted when delivery of each event begins.** A handler unsubscribed by
  an earlier handler still receives the current event and stops from the next.
- **Subscriptions take effect from the next event** — the same rule, since the snapshot is per event
  and not per flush. A handler registered while event *N* is delivered misses *N* and receives *N+1*
  onward, including later events in the same flush.
- **A handler that calls `flush()` throws.**
- **Unsubscribing twice, or after `dispose()`, is a no-op.**

**Why the snapshot:** reading the live list and adjusting indices mid-iteration makes "who received
this event" depend on what earlier handlers happened to do — order-dependent behaviour that cannot be
reasoned about at a subscription site. The snapshot rule is one sentence and a reader can predict it.
This is reachable in normal play: a HUD panel subscribes when it opens and unsubscribes when it
closes, and it opens and closes in reaction to events.

**Why reentrant `flush()` throws rather than no-ops:** a silent no-op means the author believes they
forced a delivery and they did not. Decision 3 makes it mostly unreachable; the guard costs a boolean
and states the invariant for the case decision 3 does not cover.

**Consequence for CTX-6:** *"after `dispose()`, a context MUST NOT react to any event"* holds only if
`dispose()` is called **outside a flush**. Neither rule is weakened; the precondition is written down,
and the owner is the game loop that already owns the `flush()` call site.

## 8 — Order: phase one only, an explicit wiring list, `onAny` first

**Decided:** BUS-6 applies to **phase one**. Order within a phase is subscription order, and the
orchestration's order is fixed by **a single explicit ordered list** registering the themes of
ARC-4.4. `onAny` handlers run **before** the typed handlers for the same event, and an `onAny`
subscription **belongs to a phase** like any other.

**Why phase one only:** phase-two subscriptions arrive in an order set by the player — whichever
panel was opened first subscribed first. Deterministic given the same inputs, but nothing anyone can
reason about, and it does not matter: decisions 3 and 6 leave phase-two handlers with no way to touch
the domain. Claiming determinism for an order half of which is a consequence of which menu was opened
weakens the requirement that does the work.

**Why an explicit list and not numeric priorities:** priorities become an arms race of 10, 20, 100,
99, and nobody can say what the numbers mean two years in. The single file that registers the themes,
read top to bottom, is the same precedent step 1 set for the scene registry — an explicit list that
can be read and diffed, chosen over a bundler glob.

**Why `onAny` runs first:** in phase one an exception aborts the flush (decision 6). If `onAny` ran
last, the one event most needed in the trace — the one whose handler just crashed — is the one event
never traced.

**Why phase-scoped:** each event is now delivered twice, once per phase; an unscoped `onAny` would
double every line of the trace. Scoped, it sees each event exactly once, and the completeness
property from decision 2 stays unambiguous: *every delivered event, exactly once, in delivery order*,
per phase. The step-2 overlay registers in phase two and renders the tick's whole cascade, in causal
order, at the point where the world is quiescent.

## 9 — Plain data, expressed in the type

**Decided:** payloads are constrained to `JsonValue`. BUS-2 is retired as prose and survives as one
sentence explaining why the type is shaped that way. Event types are declared as **`type` aliases,
never `interface`s**.

```ts
type JsonValue =
  | string | number | boolean | null
  | readonly JsonValue[]
  | { readonly [k: string]: JsonValue };
```

**Why the type had to change:** the declared `readonly [k: string]: unknown` accepts anything —
`{ type: 'x', actor: someExcaliburActor }` type-checks. Every prohibition in BUS-2 was prose the
compiler was never asked to read, and the index signature also softened BUS-1: any object with a
`type: string` was a `DomainEvent`.

**Why the requirement needed a new reason:** BUS-2's justification died with the journal. Nothing in
this system serializes an event — `SAVE-1` stores dynamic state, the bus has none, and an event's
whole life is one tick. The property is not *serializability*, it is **plain data**, and it is
load-bearing for three reasons that are not persistence: no references across the boundary (ARC-1,
the real content of ARC-5.1); no `Map` or `Set` (ARC-9.4, undocumented iteration order); no aliased
mutable state, which would let a handler mutate the domain through an event BUS-3 calls immutable.

Constrained this way the compiler rejects `Actor`, `Map`, `Set`, `Date` and functions — they carry
methods, and a method is not a `JsonValue`. `EntityId` passes: `number & { readonly __brand }` is
assignable to `number`.

**The sharp edge, recorded because it fails silently:** a `type` alias with an object literal gets an
implicit index signature and satisfies the constraint; an `interface` does **not**, and is rejected
even when its fields are impeccable. The rule gets violated by someone being tidy, and the error will
not explain itself.

**Residue accepted:** a plain-data class instance (fields only, no methods) is structurally
assignable and slips through. With no serialization anywhere, an object with no methods is
indistinguishable from a record.

## 10 — No configuration, no modes

**Decided:** BUS-11 is cut. No provenance capture, no causal parentage, a flat trace in delivery
order. `BUS` declares **no `CFG` section**; its constructor takes exactly one argument,
`onHandlerError`, and it behaves identically in every build.

**Why BUS-11 goes:** three earlier decisions ate it. After 1, "who published it" has one answer for
every event ever — the orchestration. After 4, the producing service is already in the discriminant.
After 6, "development mode" is not something the bus knows, and reintroducing the flag for a `SHOULD`
is a poor trade.

What BUS-11 reached for is the **cause**, not the publisher — and that is answered statically: only
the orchestration publishes, its wiring is split by theme and registered from one explicit ordered
list (decision 8), so "what reacts to `qst/quest-completed`" is a grep. The dynamic version costs
either a stack-trace parse — expensive, engine-specific, and forbidden ground for a service that must
run headless in any host — or a `publish(event, cause)` parameter threaded through every call site to
reconstruct what the wiring file already states. The generation counter from decision 5 already
exists inside `flush()`; if the overlay ever wants to indent the cascade it can be surfaced then,
without a new concept.

**Why "no knobs" is the right property here:** `BUS` is the piece every other piece depends on for
its ordering guarantees. It would be the first service in the catalogue to declare no configuration
at all, and that is a feature.

**Documentation snag:** `REQUIREMENTS.md:620` describes step 2's testbed as *"events published and
traced on screen, on services built from composed parameters"*. That second clause is `CFG`'s half of
the step, proved through `RND`; `BUS` has no parameters to compose, and the line must not read as a
promise that it does.

## 11 — Two rules the boundary check already enforces

**Decided:** BUS-9's prohibition and BUS-12's lint clause are deleted, each replaced by one line
naming the check that does the work. The `MUST` / `MUST NOT` defect is recorded.

**Why, from `dependency-cruiser.boundaries.mjs` rather than assumption:**

- **BUS-9** — the union lives in `game/` (decision 4), the bus under `engine/core/`, and rule 4
  `engine-may-not-import-the-layers-above` (`boundaries.mjs:112`) fails the build on
  `engine/ → game/`. What survives is the design statement — the bus is parametric on `E`, supplied
  by whoever instantiates it — which belongs beside the API, not in a list of rules someone might
  break.
- **BUS-12** — `dependency-cruiser` matches imports, not constructor signatures, but a parameter
  typed `EventBus` requires importing that type, and rule 3 `services-may-not-import-each-other`
  (`boundaries.mjs:98`) forbids any service importing any other service's public surface **with no
  allowlist**. `engine/core/event-bus/` is a service by the config's own definition, so the import
  fails today. No new machinery.

**Why not implement it anyway:** a requirement that restates an existing check invites a second
enforcement, and two enforcements of one rule drift.

**Residue accepted:** nothing stops a service declaring `constructor(private publish: (e: MyEvent)
=> void)` and being handed the bus's method — a port-shaped bus. No lint can see it. It is not a
mistake anyone makes by accident, and ARC-4.2's "return your events" makes such a parameter
conspicuous in review. (The same **Port** mechanism is how ARC-4.1 permits receiving an `EXPR` or an
`RND` stream while rule 3 forbids importing one.)

**Defect to fix:** BUS-12 reads *"No service **MUST** subscribe"*, which in RFC-2119 terms means *no
service is obliged to subscribe* — the opposite of the intent. **ARC-4.3 has the same bug**
(`REQUIREMENTS.md:120`) and BUS-12 inherited it. Both want **MUST NOT**.

## 12 — The resulting interface

**Decided:**

```ts
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

**`phase` is an explicit first argument with no default.** The two phases are exactly the two
subscriber families ARC-4.3 names, so they take those words from `CONTEXT.md` rather than inventing
`rules`/`view`. A default phase would be silently wrong half the time.

**`publish` and `publishAll` both kept** (user's call, against the proposal to collapse them into one
array-taking method): `publishAll(result.events)` matches ARC-4.2's return shape, and a single
synthesized event should not have to be wrapped in an array to be published.

**`dispose()` is new and not optional.** CTX-6 promises that after `dispose()` no handler is
registered, and nothing in the declared API could deliver that — the subscription registries had no
owner. It drops all subscriptions and discards the queue; discarding a queue while the world is being
torn down is harmless, and decision 7 fixed that `dispose()` happens outside a flush.

**Deliberately absent:** `flush()` returns `void` — observing traffic is `onAny`'s job, and a return
value would grow a second, weaker tracing path. No `isEmpty()` or queue introspection: tests observe
the bus through handlers, like every other caller.

## 13 — The contract table, and the conflict with ARC-13.3

**Decided:** three rows corrected, one invariant promoted to a requirement, three allocations
declared.

- **`Dynamic state`** — the bus holds the queue, the tick's accumulated stream, and the subscription
  registries. None of it is savable, which is what ARC-10.1 means, but the parenthesis as written is
  false.
- **The invariant, written in:** *outside a `flush()` the queue is empty.* BUS-5 drains to quiescence
  and decision 3 gives the game loop the only call site, so a save taken at a tick boundary cannot
  lose an event in flight. Without that sentence `SAVE` has no reason to believe the bus is safe to
  ignore, and the first person to publish outside the loop breaks something nobody wrote down.
- **`Depends on | —`** — still accurate as a *service* dependency, but the bus now requires
  `onHandlerError` at construction. Noted, so the row does not read as "takes nothing".
- **`Order of magnitude | ~10³ events/second`** — stays; ARC-13.4 requires the declaration.

**The conflict.** ARC-13.3 is a **MUST**: *"no logging and no avoidable allocation on the hot
paths"*, and `flush()` is the hottest path in the game. The decisions above put three allocations on
it: the queue, the **per-event handler-list snapshot** (decision 7), and the per-tick accumulated
stream (decision 3).

**Not redesigned — declared.** The word that saves it is *avoidable*: at 10³ events/second these are
noise, and each buys a stated property. The sheet says so next to the API, because otherwise someone
profiling on day 200 finds a copy inside the dispatch loop and removes it, silently deleting the
ordering guarantee of decision 7:

- the snapshot is the price of *"who receives this event does not depend on what earlier handlers
  did"*;
- it is the one allocation that becomes copy-on-write if profiling ever asks, **without changing a
  single observable rule**;
- the accumulated stream is the price of the presentation seeing a quiescent world.

An allocation with a reason written beside it survives the next optimizer. One without a reason does
not.

## 14 — Test criteria, and the compile-time claims

**Decided.** Two of the sheet's six criteria survive, three change, one is deleted, four are new.

**Survive:** the cycle producing a diagnostic error rather than a freeze; ARC-3.4's reusability proof
— *the bus works with a made-up event union foreign to this game* — following the convention `RND`
set with `reusability.spec.ts`.

**Change:** FIFO with nested publications becomes **generations** (depth 3 arrives after everything
at depth 2); stable invocation order becomes **phase one only**; and *"a handler that throws does not
interrupt the others"* **splits in two** — in phase one the flush aborts, in phase two the remaining
handlers run and `onHandlerError` receives the failure.

**Deleted:** the `onAny` replay criterion.

**New:**

- **The phase boundary.** A publishes → an orchestration handler publishes B → the presentation phase
  receives `[A, B]` only after *both* orchestration handlers have run. Nothing in the old list came
  close, and this is the one criterion that proves decision 3.
- **The snapshot rules:** unsubscribed mid-delivery still receives the current event; subscribed
  mid-delivery misses it and receives the next; a reentrant `flush()` throws.
- **`onAny` sees the crash:** in phase one, an event whose typed handler throws is still in the
  trace. This is what makes "`onAny` runs first" load-bearing rather than decorative.
- **`dispose()`** leaves nothing registered, satisfying CTX-6 from the bus's side.

**The gap the retirements opened, and how it closes.** Decisions 9 and 11 retired four requirements on
the grounds that the compiler or the boundary check already guarantees them. `dependency-cruiser`
runs in CI; but *"subscribing to a non-existent type is a compile error"* and *"a `Date` in a payload
is a compile error"* were claims nothing ever ran. A retirement backed by an untested claim is a
retirement backed by a hope.

**Decided: `@ts-expect-error` in an ordinary spec file.** No new harness, runs inside the existing
`npm run typecheck` (already in the `test:unit` lane), and — unlike `@ts-ignore` — **fails when the
error stops occurring**, which is the direction it needs to fail in. Vitest's `expectTypeOf` would
also work but means enabling typecheck mode in the config for a job two comments can do.

---

## What changes outside `event-bus.md`

Recorded as consequences, not as work items.

| Document | Change |
|---|---|
| `docs/services/input.md` | `Events emitted` row removed (1); INP-9 reworded off "replay" (2) |
| `docs/services/hud.md` | `Events emitted` row removed (1); HUD-2 journal → quest log (2) |
| `docs/services/quest.md` | `journal()` → `questLog()`, `JournalEntry` → `QuestLogEntry`, QST-11, QST-12 (2) |
| `docs/GAMEPLAY.md` | GP-50 wording (2) |
| `docs/services/expr.md`, `stats.md`, `README.md` | "journal" → "quest log" (2) |
| every sheet with an `Events emitted` row | discriminants gain the service prefix (4) |
| `docs/REQUIREMENTS.md` | ARC-4.3 `MUST` → `MUST NOT` (11); step-2 testbed line 620 reworded (10) |
| `CONTEXT.md` | one new glossary entry: the two **delivery phases** (3) |

## Open points

- **Where `CTX` lives.** `game-context.md` declares a service that *"depends on all services, only in
  order to build them"*. If `CTX` ever sits at `engine/core/game-context/`, rule 3 fails on every one
  of those imports, starting with `EventBus`. It must be `game/` code — which is where
  `createGameContext` belongs anyway, since decision 3 put the loop that owns `flush()` there. A
  decision for the `CTX` sheet, not taken here.
- **The exact shape of the HUD command API** (1). Decided in principle: named, typed, enqueueing,
  drained with the intents. Its surface belongs to the step that builds the HUD, not to step 2.
- **Whether the generation depth is surfaced to the overlay** (5, 10). The counter exists; nothing
  reads it today. Revisit only if a flat trace proves unreadable in practice.
- **The `Phase` words.** `'orchestration' | 'presentation'` are `CONTEXT.md`'s own terms and read
  correctly at a subscription site, but they are long. Left as decided; noted in case they grate once
  written a hundred times.

## What was not touched

This session produced this log and nothing else. `docs/services/event-bus.md`, the eight documents in
the table above, `CONTEXT.md`, `docs/adr/` and the code are all unchanged, and no commit was made. No
plan and no tickets were written, by request.

# BUS — Event bus: usage guide

This is a practical, call-by-call guide to the actual `BUS` implementation in
`src/engine/core/event-bus`. For the requirements and the rationale behind each design
decision, see [`../services/event-bus.md`](../services/event-bus.md) — this page only shows how
to call the public surface. Every example below reflects the real signatures exported from
`src/engine/core/event-bus/index.ts`.

```ts
import { createEventBus, CausalDepthError } from '../../engine/core/event-bus/index'; // adjust the relative path
import type { DomainEvent, EventBus, JsonValue, Phase } from '../../engine/core/event-bus/index';
```

The bus is the project's **only channel of indirect communication**, and it decides what "the
same game twice" means: what gets delivered, in which order, and to whom. It takes exactly one
construction argument, has no configuration and no modes, and behaves identically in every
build (BUS-15).

## 1. Quick reference

One line per call; jump to the matching section below for the description, the full example and
the error cases.

| Call | Runs handlers? | Notes |
|---|---|---|
| `createEventBus(onHandlerError)` | — | the whole construction: one required argument (§2) |
| `bus.on(phase, type, handler)` | no | returns the unsubscribe function; the event arrives narrowed |
| `bus.onAny(phase, handler)` | no | every event of the phase, before that event's typed handlers |
| `bus.publish(event)` | **no** | queues only (BUS-4) |
| `bus.publishAll(events)` | **no** | queues the batch, in the order given |
| `bus.flush()` | yes | the orchestration cascade to its end, then the presentation, once |
| `bus.dispose()` | no | drops every subscription and the queue; **throws** inside a flush |

And the two things a caller writes rather than calls:

| Written by | What | Notes |
|---|---|---|
| the **service** | its own event types, as `type` aliases | prefixed with the service (§3) |
| **`game/`** | the union of them, passed as `E` | the bus never imports a type of this game |

## 2. Creating the bus

Builds the game's one bus for the event union `E`, and says where a **presentation** handler's
exception is reported.

```ts
const bus: EventBus<GameEvent> = createEventBus<GameEvent>((error, event) => {
  console.error(`a panel failed on ${event.type}`, error);
});
```

`onHandlerError` is **required and has no default**. A generic service that reaches for
`console` has a dependency it never declared (ARC-3.2), and one that defaulted to swallowing
would have decided on the caller's behalf that a panel going dark is not worth mentioning. It
is never called for a failed **rule** — those propagate (§8) — so everything arriving in that
sink is a screen and not a consequence.

There is nothing else to pass: no section, no options object, no development flag (BUS-15).

## 3. Declaring events (the service's job)

An event is a **fact that has already happened**, discriminated by `type`. Each service
declares its own on its own public surface; `game/` unions them and hands the union to the bus
(BUS-14).

```ts
// In the service, e.g. src/engine/services/inventory/events.ts
export type ItemAdded = {
  readonly type: 'inv/item-added';
  readonly owner: EntityId;   // a branded number: still plain data
  readonly item: string;
  readonly quantity: number;
};

// In game/, and nowhere else: one member per service, and it grows from step 3 on.
type GameEvent = ItemAdded | ObjectiveCompleted;
```

Three rules, and two of them are the compiler's:

**The name carries the producing service** — `inv/item-added`, `qst/objective-completed`. Two
services claiming one string with *compatible* payloads is the one collision the compiler
cannot catch, and the prefix removes it structurally, with no check and no lint (BUS-14).

**The payload is plain data**, expressed as `JsonValue`. A payload holding an Excalibur `Actor`
hands the domain a door into the presentation; one holding a `Map` or a `Set` makes an
iteration order undefined (ARC-9.4); one holding live service state lets a handler mutate the
domain through something the contract calls immutable. The constraint refuses all of them
structurally:

```ts
type Closed = { readonly type: 'demo/closed'; readonly at: Date };

createEventBus<Closed>(report);
// Type error — a Date carries methods, and a method is not a JsonValue.
```

A branded `number` goes through, being a `number`: that is how an event refers to an entity
(ARC-5.2).

**An event type must be a `type` alias, never an `interface`.** Only the former gets the
implicit index signature `DomainEvent` requires, so an `interface` fails to satisfy it however
impeccable its fields — and the compiler's error explains none of that:

```ts
interface Closed {
  readonly type: 'demo/closed';
  readonly lamps: number;
}

createEventBus<Closed>(report);
// Type error — with no mention of index signatures anywhere in it.
```

Both traps are asserted with `@ts-expect-error` in `types.spec.ts`, which is the only thing
that fails when they stop holding.

## 4. Publishing

Queues a fact. It runs **no handler** and returns immediately: delivery happens at `flush()`
and nowhere else (BUS-4). Synchronous delivery inside `publish()` would make the order of the
game's rules a function of recursion depth.

```ts
bus.publish({ type: 'inv/item-added', owner: player, item: 'rope', quantity: 1 });

// The shape a command returns (ARC-4.2), passed on unchanged:
bus.publishAll(inventory.add(player, 'rope', 1));
```

**Only the orchestration publishes** (BUS-3). The presentation deposits intents — `INP.feed()`,
the HUD's named command API — and the orchestration pulls them at a fixed point in the tick. An
intent published the instant a DOM event fires would take its position in the delivery order
from the browser's scheduler, which is determinism lost to a cause no test can point at.

The bus does not enforce this: a presentation handler that publishes lands in the queue of the
*next* flush. That is a bug in the game's wiring, not something the bus has an answer for.

## 5. Subscribing

`on` takes one event type in one phase and hands the handler that member of the union, already
narrowed — no cast at the call site, and a type nobody declared is a compile error (BUS-1).

```ts
const stop = bus.on('orchestration', 'inv/item-added', (event) => {
  // `event` is `ItemAdded`: its own fields, read without a cast.
  quests.recordPickup(event.owner, event.item, event.quantity);
});

stop();  // unsubscribes
stop();  // no-op: unsubscribing twice is harmless (BUS-10)
```

```ts
bus.on('orchestration', 'inv/item-picked', () => {});
// Type error — no member of the union carries that type.
```

`onAny` takes every event of its phase, and belongs to a phase like any other subscription. It
exists for logging and for the development overlay; it sees each delivered event of its phase
**exactly once**, in delivery order (BUS-13). There is no journal and no replay in this project.

```ts
const stopTracing = bus.onAny('presentation', (event) => {
  panel.line(describeEvent(event));
});
```

`phase` is explicit at every subscription and has **no default**: the two phases are exactly the
two families of subscriber the architecture permits, and a default would be silently wrong half
the time.

| Phase | Who subscribes | What it may do |
|---|---|---|
| `orchestration` | the game's rules | call commands, publish; runs inside a half-finished tick |
| `presentation` | scenes, HUD panels, overlays | query and draw; the world has already stopped moving |

## 6. `flush()` — the two phases

Delivers everything queued. It is the only thing that runs a handler, and it happens at one
place: the game loop in `game/` — drain the intents, run the tick, flush.

```ts
bus.flush();
```

What it does, in order:

1. Delivers the queue to the **orchestration** handlers, in FIFO order, draining until the
   queue is empty. Events published by a handler join the same queue and are delivered in the
   **same flush**, to any depth (BUS-5).
2. Once the cascade is quiescent, hands the whole tick — every event delivered, in delivery
   order — to the **presentation** handlers, **once** (BUS-6).
3. Returns with the queue **empty** (BUS-12), so a save taken at a tick boundary cannot lose an
   event in flight.

The phase boundary is the design, not an optimisation. A panel woken mid-cascade would query
the domain about a state that never officially existed and get a true answer about it; and it
would redraw once per level of consequence instead of once per tick.

```ts
bus.on('orchestration', 'inv/item-added', () => {
  bus.publish({ type: 'qst/objective-completed', quest: 'q1', objective: 'o1' });
});
bus.onAny('presentation', (event) => order.push(event.type));

bus.publish({ type: 'inv/item-added', owner: player, item: 'rope', quantity: 1 });
bus.flush();

// order === ['inv/item-added', 'qst/objective-completed'] — and neither line ran
// until both orchestration handlers had finished.
```

Within a phase the order is fixed (BUS-7): every `onAny` of the phase first, then the typed
handlers of that event in **subscription order**. The orchestration's subscription order comes
from a single explicit list that can be read and diffed, not from whoever imported first.

## 7. Subscribing and unsubscribing during a delivery

The set of handlers is snapshotted when delivery of **that event** begins (BUS-10). The rules
follow from that single sentence:

| During a delivery | Effect |
|---|---|
| a handler unsubscribes another | that handler still receives the **current** event, and stops from the next |
| a handler subscribes | the new handler misses the current event and receives the next — including later events of the same flush |
| a handler calls `flush()` | **throws** |
| a handler calls `dispose()` | **throws** (§9) |
| unsubscribe called twice, or after `dispose()` | no-op |

This is what a panel that opens and closes in reaction to events needs: *who received this
event* must not depend on what the handlers before it happened to do.

```ts
bus.on('presentation', 'qst/objective-completed', () => {
  bus.flush();
});
// Error: the event bus is already delivering: a handler may not call flush().
// Publish and return — the flush already running delivers what you published, in
// the same tick, before it hands anything to the interface.
```

The refusal is deliberate rather than a no-op: a handler that publishes is already promised
delivery by the flush it is standing in, so there is nothing a second call could add, and
whoever wrote the line believes otherwise. Note that from a **presentation** handler that
throw is caught by the failure policy of §8 like any other, and arrives at `onHandlerError`.

## 8. Failure, by phase

The phase decides what a handler that throws is owed, and nothing else does — there is no
branch that exists only in one build.

**Orchestration — it propagates.** A rule that did not run means the world is missing a
consequence: the quest that did not advance, the loot that was not granted. The tick fails
loudly, the exception reaches whoever called `flush()`, the presentation is told **nothing**
about that tick, and the queue is left empty so the next flush does not redeliver events that
already ran.

```ts
try {
  bus.flush();
} catch (error) {
  // A rule failed. The tick is over and the world is not to be trusted.
}
```

**Presentation — it is caught, reported, and left behind.** `onHandlerError` receives the error
and **the event that caused it**, the remaining handlers still run, and `flush()` does not
throw. By then the domain has finished moving and is intact, so a handler that failed cost a
panel; the panels behind it are unrelated screens that would otherwise go dark for somebody
else's bug.

```ts
const bus = createEventBus<GameEvent>((error, event) => {
  // `error` is whatever was thrown, unwrapped — `throw 'a string'` is legal.
  // The stack trace names the handler; the event says why this run and not the last.
  report(error, event.type);
});
```

An event whose typed handler threw is **still in the `onAny` trace of its phase**: the trace
always contains the cause of the failure, which is what makes "`onAny` runs first" load-bearing
rather than decorative.

## 9. A cascade that will not stop

Events queued before the flush are generation 0; what a handler publishes while generation *n*
is being delivered forms generation *n+1*. `flush()` bounds that **causal depth** at **32** and
throws a `CausalDepthError` on the 33rd (BUS-8). It counts depth, not events: a generation
hundreds of events wide is not a deep one.

```ts
try {
  bus.flush();
} catch (error) {
  if (error instanceof CausalDepthError) {
    console.error(error.message);
    console.error(error.generations);
    // [['demo/pebble-dropped'], ['demo/echo-heard'], ['demo/pebble-dropped']]
  }
  throw error;
}
```

The message names the event types of each of the **last three** generations, oldest first, each
type once however many events carried it:

```
a flush exceeded 32 generations of events: the last three carried
[demo/pebble-dropped] [demo/echo-heard] [demo/pebble-dropped]. A type appearing
twice in that list is a cycle — two rules publishing each other, or one publishing
its own event. The limit is fixed and there is no setting for it: raising it would
ship the cycle.
```

Three generations rather than one because a ping-pong reads as `[a] [b] [a]` and one line
cannot show that. The brackets are sets of types delivered together, not one type handing over
to the next — the bus never observed which event caused which.

The limit is **not configurable**, by construction: the only realistic use of that knob is
raising it to silence a cycle. Catch `CausalDepthError` **by its class** if you catch it at all;
a `catch` that swallowed everything would turn the next failing rule into a tick that quietly
did nothing.

## 10. Teardown

`dispose()` drops every subscription and discards the queue — the bus's half of CTX-6. Call it
**outside** a flush, from the same owner that calls `flush()`:

```ts
return () => {
  bus.dispose();
  panel.close();
};
```

Inside a flush it throws, off the same flag that refuses a reentrant `flush()`:

```
Error: the event bus is already delivering: dispose() must be called outside a flush().
Let the flush finish and tear down between ticks — a context that decides to close while
a rule is running is still owed the rest of that tick.
```

The breach it refuses is the invisible kind: `dispose()` swaps the queue the drain is reading,
so a context tearing itself down in reaction to an event would end the cascade mid-sentence,
drop every consequence queued behind it, and leave a tick indistinguishable from one that
finished.

After `dispose()` the bus is inert but not broken: unsubscribe functions handed out earlier are
no-ops, and a later `publish` + `flush` reaches nobody.

Two buses never observe each other — no module-level state, no registry, nothing global — which
is what lets two independent games run in one process (ARC-8.3).

## 11. What `BUS` deliberately is not

- **Not a command channel and not a query channel.** It carries no requests, returns no values,
  waits for no answers. If the publisher depends on somebody reacting, it is not an event
  (BUS-3).
- **Not a route for intents.** A key press and a "player asked to trade" travel the other way:
  `INP` accumulates and the orchestration pulls at a fixed point in the tick.
- **Not a journal.** `onAny` observes; it records nothing and there is no replay. Feeding a
  recorded stream back in cannot work — the orchestration answers events by calling commands
  that return new events, so a replay re-executes everything and emits a second copy of
  everything.
- **Not configurable.** No `CFG` section, no depth knob, no development mode. The build under
  test behaves exactly like the build that ships.
- **Not visible to a service.** A service returns the facts its command produced and publishes
  nothing (ARC-4.2). Taking an `EventBus` parameter means importing this file, and boundary rule
  3 (`services-may-not-import-each-other`) already fails the build on that, with no allowlist
  (BUS-16).

## Links

- [`../services/event-bus.md`](../services/event-bus.md) — full contract, requirements (`BUS-*`)
  and test criteria.
- [`../specs/bus-event-bus.md`](../specs/bus-event-bus.md) — the spec for step 2, and the
  argument behind each decision above.
- `src/engine/core/event-bus/index.ts` — the actual public surface this guide documents.
- `src/engine/core/event-bus/reusability.spec.ts` — a domain-agnostic worked example (a railway
  signal box, not a dungeon) exercising the whole surface end to end.
- `src/engine/core/event-bus/types.spec.ts` — the compile-time claims of §3, and the only thing
  that fails when they stop holding.
- `src/presentation/scenes/testbed/bus/bus-scene.ts` — `?scene=bus`: the two phases and the
  cycle refusal, watched happening.

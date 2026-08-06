# Spec — `BUS`, the event bus

**Service:** `BUS` · **Priority:** 1 · **Sheet:** [`services/event-bus.md`](../services/event-bus.md)
**Requirements:** ARC-5.1, ARC-5.4, ARC-4.2, ARC-4.3, ARC-9.1, ARC-9.4, ARC-13.3, ARC-3.4 ·
**Step:** 2 of the plan in [`REQUIREMENTS.md`](../REQUIREMENTS.md), beside `CFG`
**Grill log:** [`.scratch/event-bus/grill-log.md`](../../.scratch/event-bus/grill-log.md)

## Problem Statement

Nothing in the engine can yet tell anything else that something happened. ARC-4.1 forbids a service
importing another service, so the only way `QST` learns that an item was picked up is through a
notification carried by something that knows neither of them. That something does not exist, and
every service from step 3 onward is specified as if it did.

Building it late is not an option, and building it carelessly is worse than building it late. Four
problems are decided by this one piece of infrastructure, and each of them is paid for by every
service written afterwards:

1. **The order in which the game's rules run.** A fight ends, a quest advances, a reward is granted,
   the inventory fills up and refuses the reward. Whether that chain produces the same outcome every
   time depends entirely on how the notifications are delivered. Deliver them synchronously inside
   the call that produced them and the order becomes a function of recursion depth: ARC-9.1 is lost
   on day one, silently, and is not recoverable without rewriting every rule.
2. **What the interface is allowed to see.** A panel that redraws in the middle of a chain of
   consequences reads a world in which half the tick has happened. It gets a true answer about a
   state that never officially existed, and the bug it produces is intermittent and blamed on the
   panel.
3. **What a notification is permitted to carry.** A payload holding an Excalibur `Actor` hands the
   domain a door into the presentation and quietly deletes ARC-1. A payload holding a `Map` makes an
   iteration order undefined and quietly deletes ARC-9.4. Both compile perfectly if nobody decides
   otherwise now.
4. **Which direction requests travel.** Two sheets already specify the interface *publishing*
   intents — `hud.md` declares `ui-equip-requested`, `input.md` declares `action-triggered`. An
   intent published the instant a DOM event fires lands in whichever delivery happens to be open, at
   a position the browser's scheduler chose. That is reproducibility lost to a cause no test will
   ever point at.

None of the four is a performance problem or an ergonomics problem. They are all the same problem:
the bus decides what "the same game twice" means, and it decides it before any game exists.

## Solution

A service `BUS` — **generic**, with no knowledge of this game, no configuration and no modes — that
is the project's only channel of indirect communication, and that offers four guarantees behind one
small surface:

- **Deferred, ordered delivery.** `publish` queues; `flush` delivers in FIFO order, draining the
  whole causal chain including everything produced during the drain. The order of the game's rules
  is a property of the bus, not of the call stack.
- **Two phases in one flush.** The chain is drained to quiescence delivering to the **orchestration**
  only; the accumulated stream is then handed to the **presentation**, once. A panel therefore only
  ever observes a world that has finished moving, and gets one redraw point per tick instead of one
  per level of the chain.
- **Plain data, enforced by the compiler.** Payloads are constrained to `JsonValue`, which rejects
  `Actor`, `Map`, `Set`, `Date` and functions structurally. The rule is not prose anyone can break.
- **Failure that is loud where it must be and survivable where it can be.** A rule that throws aborts
  the tick, because a rule that did not run means a world missing a consequence. A panel that throws
  is reported and the rest keep drawing, because the domain is already intact.

The bus takes exactly one construction argument, an error callback. It has no `CFG` section, no
development mode, and behaves identically in every build — which is the right property for the one
piece every other piece depends on for its ordering.

## User Stories

### The developer writing the game's rules

1. As an orchestration developer, I want to react to a fact without knowing which service produced
   it, so that adding a producer does not mean editing a consumer.
2. As an orchestration developer, I want to subscribe to an event type and receive that type
   **narrowed**, so that I read the payload's fields without a cast.
3. As an orchestration developer, I want subscribing to a type that does not exist to be a **compile
   error**, so that a renamed event is found by the build and not by play-testing.
4. As an orchestration developer, I want the events a command returns to be publishable in one call,
   so that the shape ARC-4.2 hands me is the shape I pass on.
5. As an orchestration developer, I want to publish a single event I synthesised myself without
   wrapping it in an array, so that the common case reads plainly.
6. As an orchestration developer, I want events delivered in the order they were published, so that
   two facts that happened in an order are consumed in that order.
7. As an orchestration developer, I want an event published by a handler to be delivered in the same
   flush, so that a consequence of a consequence lands within the tick that caused it.
8. As an orchestration developer, I want that to hold to any depth, so that I never have to think
   about how many levels of consequence a rule sets off.
9. As an orchestration developer, I want handlers for one event invoked in a **fixed** order, so
   that two rules reacting to the same fact behave the same way every run.
10. As an orchestration developer, I want that order to come from a list I can read and diff, so
    that I can see what runs before what without executing anything.
11. As an orchestration developer, I want a rule that throws to **stop the tick**, so that I never
    keep playing in a world where a quest silently failed to advance.
12. As an orchestration developer, I want to unsubscribe, so that a rule that applies only to a
    phase of the game can stop applying.
13. As an orchestration developer, I want unsubscribing twice to be harmless, so that defensive
    cleanup code is not a source of new errors.

### The developer writing a scene or a HUD panel

14. As a panel developer, I want to be woken by facts instead of polling the domain every frame, so
    that the interface costs nothing while nothing is happening (HUD-10).
15. As a panel developer, I want to observe the world only once it has finished changing, so that
    when I ask `STAT` a question I get an answer about a state that really existed.
16. As a panel developer, I want all of a tick's facts delivered together and in causal order, so
    that I can redraw once rather than once per consequence.
17. As a panel developer, I want a fact about an entity that no longer exists to still reach me, so
    that a spawn and a death in the same tick are both visible and I decide what to show.
18. As a panel developer, I want my exception to be reported without taking the game down, so that a
    broken widget costs a widget.
19. As a panel developer, I want my handler never to be invoked while another handler is mid-draw,
    so that I do not have to make drawing re-entrant.
20. As a panel developer, I want to subscribe when my panel opens and unsubscribe when it closes, so
    that a closed screen costs nothing.
21. As a panel developer, I want a subscription made while reacting to a fact to start from the
    **next** fact, so that opening a panel in reaction to an event has a predictable starting point.
22. As a panel developer, I want to be certain I cannot publish into the domain, so that the
    interface cannot become a source of game rules by accident.

### The developer of a service

23. As a service developer, I want to **return** the facts my command produced rather than publish
    them, so that my service stays testable without any infrastructure at all (ARC-4.2).
24. As a service developer, I want to declare my event types on my own public surface, so that the
    shape of a fact lives with the code that produces it.
25. As a service developer, I want the compiler to refuse an `Actor`, a `Map`, a `Set`, a `Date` or
    a function in a payload, so that a rule about references is not something I have to remember.
26. As a service developer, I want my event names to carry my service's name, so that two services
    can never claim the same fact without noticing.
27. As a service developer, I want to be unable to receive the bus at all, so that "services are
    mute" is a property of the build rather than of my discipline.

### The developer debugging a cascade

28. As a developer, I want to observe every event of a phase in delivery order, so that I can trace
    a tick without naming the types in advance.
29. As a developer, I want that observation to include the event whose handler then crashed, so that
    the trace always contains the cause of the failure.
30. As a developer, I want a cycle between events to fail with a message rather than freeze the
    game, so that an infinite chain is a bug report and not a hung tab.
31. As a developer, I want that message to name the types involved, so that I can identify the loop
    without adding logging.
32. As a developer, I want a testbed scene showing events published and traced live, so that the
    step's behaviour is visible and not merely asserted (step 2 of §7.2).
33. As a developer, I want the trace to show each event **once**, so that a two-phase delivery does
    not double every line I read.

### The developer of the game's bootstrap

34. As the bootstrap author, I want one place that decides when facts are delivered, so that
    delivery is a decision and not a consequence of who called what.
35. As the bootstrap author, I want the queue to be empty between ticks, so that a save taken at a
    tick boundary cannot lose a fact in flight.
36. As the bootstrap author, I want to dispose of a bus and be sure nothing is left registered, so
    that a context really can be thrown away (CTX-6).
37. As the bootstrap author, I want to run two independent games in one process with no interference,
    so that ARC-8.3 stays checkable.
38. As the bootstrap author, I want to decide where handler failures are reported, so that the engine
    does not choose `console` on my behalf.

### The developer reusing the engine

39. As a developer reusing the engine, I want the bus to work with an event union invented for
    another game, so that its genericity is proved and not claimed (ARC-3.4).
40. As a developer reusing the engine, I want the bus to have no configuration to compose, so that
    adopting it costs one constructor call.
41. As a developer reusing the engine, I want it to run headless with no browser, DOM or renderer, so
    that it works in a test, a script and a game equally.

### The developer maintaining the engine

42. As a maintainer, I want the rules I retired into the type system to be **tested**, so that a
    future change to the types cannot silently reopen what a requirement used to guard.
43. As a maintainer, I want the allocations on the delivery path to carry their reason beside them,
    so that an optimiser does not delete an ordering guarantee while removing a copy.
44. As a maintainer, I want the bus to have no branch that only exists in one build, so that the
    behaviour I test is the behaviour that ships.

## Implementation Decisions

Every decision below is argued in full in the grill log; what follows is the outcome.

### Modules

One new service, `BUS`, at `engine/core/event-bus/`, with the single public surface ARC-2.1 requires.
No other module is created. The union of the game's events is assembled in `game/` — engine services
export their own event types on their public surfaces, `game/` unions them, and the presentation
imports the union. No service imports the bus, and the boundary check already refuses it.

### Public contract

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

`phase` is an explicit first argument with **no default**: the two phases are exactly the two
subscriber families ARC-4.3 names, and a default would be silently wrong half the time.
`onHandlerError` is **required**, because a generic service that reaches for `console` has a
dependency it never declared, and because a silent default is what CFG already refuses elsewhere.

### Delivery, in order

1. `publish` and `publishAll` append to a single FIFO queue and run nothing.
2. `flush` delivers to **orchestration** handlers only, draining until the queue is empty. Events
   published during delivery join the same queue and are delivered in the same flush.
3. Every delivered event is accumulated, in delivery order, as the flush proceeds.
4. When the queue empties, the accumulated stream is delivered **once** to the **presentation**
   handlers, in the same order.
5. Within a phase, `onAny` handlers for an event run **before** its typed handlers; typed handlers
   run in subscription order.
6. On return, the queue is empty.

### Depth, not iterations

Events queued before the flush are generation 0; events published while delivering generation *n*
form generation *n+1*. The limit bounds causal depth at **32, a fixed constant, not configurable**.
Exceeding it **throws**, and the message lists the event types present in each of the last three
generations, in order — enough for a person to read a ping-pong off the error without any
cycle-detection machinery.

The limit is not configurable on purpose: the only realistic use of that knob is raising it to
silence a cycle.

### Failure, by phase

- **Orchestration phase:** an exception **propagates**. A rule that did not run means the domain is
  no longer trustworthy, and the tick fails loudly.
- **Presentation phase:** an exception is caught, passed to `onHandlerError` with the event that
  caused it, and delivery continues.

There is no development-mode branch. The build under test behaves exactly like the build that ships.

### Mutation during delivery

- The handler list is **snapshotted when delivery of each event begins**. A handler unsubscribed by
  an earlier handler still receives the current event and stops from the next.
- Subscriptions take effect from the **next** event — the same rule, since the snapshot is per event
  rather than per flush.
- A handler that calls `flush()` **throws**.
- Unsubscribing twice, or after `dispose()`, is a no-op.
- `dispose()` is called **outside** a flush, by the same owner that calls `flush()`.

### Where the flush happens, and who publishes

The single `flush()` call site is the **game loop in `game/`**: drain the intents, run the tick,
flush. **Only the orchestration publishes.** The presentation never does — `INP` accumulates raw
input through `feed()` and the orchestration pulls with `consume(now)` at a fixed point in the tick,
and the HUD gets a named, typed command API exposed by `game/orchestration/` which enqueues and is
drained at that same point.

This is what keeps ARC-9.1 intact: an intent published when a DOM event fires would take its position
in the order from the browser's scheduler.

### Event naming

Discriminants carry the producing service: `inv/item-added`, `qst/objective-completed`. Two services
claiming one string with **compatible** payloads is the one collision the compiler cannot catch — a
handler would silently fire on the wrong fact — and the prefix removes it structurally, with no check
and no lint. It also lets the trace group and filter by service for free.

### Decisions taken deliberately against the obvious alternative

- **No journal and no replay.** The sheet's BUS-10 asked `onAny` to record a stream for "replaying a
  session", referring to two documents that never mention one. Feeding a recorded stream back in
  cannot work: orchestration handlers respond to events by calling commands that return new events,
  so a replay re-executes everything and emits a second copy of every event. `onAny` survives for
  logging and the step-2 trace.
- **No provenance capture.** With only the orchestration publishing, "who published this" has one
  answer for every event; with prefixed names, the producing service is already in the discriminant;
  and what reacts to what is a grep over one explicit wiring list.
- **No `CFG` section.** With the depth limit fixed and the development branch gone, nothing is left
  to configure. `BUS` is the first service in the catalogue to declare no parameters, which for the
  piece everything else depends on for its ordering is a feature.
- **No type-level uniqueness assertion** over the union. It is a conditional-type trick that fails
  obscurely, and `CLAUDE.md` rules out exactly that kind of condensation. The prefix does the job
  in the naming.
- **No new lint rule.** A parameter typed `EventBus` requires importing the type, and rule 3
  (`services-may-not-import-each-other`) forbids that today with no allowlist. A requirement that
  restates an existing check invites a second enforcement, and two enforcements of one rule drift.

### Allocations, declared against ARC-13.3

`flush()` is the hottest path in the game, and three allocations sit on it: the queue, the per-event
handler-list snapshot, and the per-tick accumulated stream. At the ~10³ events/second the sheet
declares, these are noise, and each buys a stated property. Their reasons are written beside the
code, because otherwise a later optimiser removes the snapshot and silently deletes the guarantee
that *who receives an event does not depend on what earlier handlers did*. The snapshot is the one
that becomes copy-on-write if profiling ever asks — without changing a single observable rule.

### Changes to other sheets

- `event-bus.md` — BUS-2, BUS-9, BUS-10, BUS-11 and BUS-12's lint clause retired; BUS-6 narrowed to
  the orchestration phase; BUS-7 rewritten around generations and a fixed limit; BUS-8 split by
  phase; the contract table corrected and the empty-queue-between-ticks invariant added.
- `input.md` — the `Events emitted` row goes: `action-triggered` is the return value of `consume()`.
  INP-9 reworded off the word "replay".
- `hud.md` — the `Events emitted` row goes; intents travel through a named command API.
- `REQUIREMENTS.md` — ARC-4.3's `MUST` becomes `MUST NOT` (it currently states the opposite of its
  intent, and BUS-12 inherited the defect); step 2's testbed line reworded so it does not promise
  that `BUS` takes composed parameters.
- `CONTEXT.md` — one new glossary entry for the two **delivery phases**.
- The `journal` → `quest log` rename across `QST`, `HUD`, `GAMEPLAY.md`, `expr.md`, `stats.md` and
  `services/README.md`, so that nothing in the project reads as an append-only event log.

## Testing Decisions

### What makes a good test here

The bus has no dependencies, no configuration and no state worth inspecting, so every test is a
statement about **what a caller observes**: which handler was invoked, with what, in what order, and
what was thrown. Tests record invocations into an array and assert the array. No test reaches for the
queue, the generation counter or the subscription registries — all three are free to change shape,
and a test that named them would make the copy-on-write optimisation described above a breaking
change.

Delivery order is the subject matter, so almost every test is an assertion about a sequence rather
than a value.

### The seam

**One seam: the service's public surface.** Everything in this spec is observable through
`on`, `onAny`, `publish`, `publishAll`, `flush`, `dispose` and the injected `onHandlerError`. No
fakes are needed, because there is nothing to fake.

**Plus the compiler, through `@ts-expect-error`** in a colocated spec file. Two of the retired
requirements — *subscribing to a type that does not exist fails to compile*, *a `Date` in a payload
fails to compile* — are now guaranteed by the type system and by nothing that runs. `@ts-expect-error`
fails when the error stops occurring, which is the direction it must fail in, and it runs inside the
existing `npm run typecheck` in the `test:unit` lane. No new harness, no config change.

**Nothing new at the boundary seam.** `services-may-not-import-each-other` already covers a service
importing the bus, and `tests-headless/fixtures/boundaries/project/` already proves that rule bites.

**Not a seam:** the `?scene=bus` testbed. It ships as the step's definition of done, but everything
it displays is proved at the surface; opening a browser-level seam for the bus would test the overlay.

### What gets tested

- **FIFO and depth.** Nested publications at several levels arrive in generation order: everything
  at depth 2 before anything at depth 3.
- **The phase boundary.** A publishes, an orchestration handler publishes B, and the presentation
  phase receives `[A, B]` only after *both* orchestration handlers have run. This single test is what
  proves the two-phase design; nothing else comes close to it.
- **Stable invocation order** for a given set of subscriptions, in the orchestration phase.
- **The depth limit**: a cycle throws within the limit rather than freezing, and the message names
  the types of the last three generations.
- **Failure by phase**: in the orchestration phase a throwing handler aborts the flush; in the
  presentation phase the remaining handlers run and `onHandlerError` receives the error and the
  event.
- **`onAny` sees the crash**: an event whose typed handler throws in the orchestration phase is
  still in the trace — the test that makes "`onAny` runs first" load-bearing rather than decorative.
- **`onAny` sees each event once**, in its own phase, in delivery order.
- **The snapshot rules**: a handler unsubscribed mid-delivery still receives the current event; one
  subscribed mid-delivery misses it and receives the next; a reentrant `flush()` throws; a double
  unsubscribe is a no-op.
- **The queue is empty when `flush()` returns.**
- **`dispose()`** leaves nothing registered, and a disposed bus reacts to nothing.
- **Two buses do not observe each other** — the bus's half of ARC-8.3.
- **The reusability proof** (ARC-3.4): the whole surface exercised against an event union invented
  for another game, with no type from this one.
- **The compile-time claims**, via `@ts-expect-error`: an unknown event type at `on`; a payload
  carrying a `Date`, a `Map` or a function.

### Prior art

`src/engine/core/random/` is the model in every respect: colocated `*.spec.ts` beside the code,
`reusability.spec.ts` for ARC-3.4 under that exact name, `isolation.spec.ts` for the
no-interference-between-instances property. The bus follows the same layout and the same file naming.
`tests-headless/` is not used: nothing here is cross-cutting, and the one CFG test that had to live
there did so because it closed a circle between two services, which this step does not.

## Out of Scope

- **The game loop that calls `flush()`.** Its ownership is decided (the loop in `game/`), but the
  loop itself belongs to step 3, with `TIME`.
- **The HUD's named command API.** Decided in principle — named, typed, enqueueing, drained with the
  intents — and shaped by the step that builds the HUD.
- **`INP`'s pull contract.** `feed()` and `consume(now)` are already in its sheet; this spec only
  fixes that they are not a bus concern.
- **The game's event union.** It grows one type per service from step 3 onward; step 2 has no domain
  facts to declare.
- **The rename of the ~100 event names** across the sheets to prefixed form. Decided here, applied to
  each sheet as its service arrives, since none of them is code yet.
- **`CTX`'s location.** Its sheet's "depends on all services" collides with boundary rule 3 the
  moment it sits under `engine/`; the bus is simply the first import that would break. A decision for
  the `CTX` sheet at step 3.
- **Surfacing generation depth to the trace.** The counter exists inside `flush()`; nothing reads it.
  Revisit only if a flat trace proves unreadable.
- **Persistence of anything.** The bus has no savable state, by construction.

## Further Notes

The sheet this spec replaces contained twelve requirements. Six of them do not survive: BUS-2 became
the shape of a type, BUS-9 and BUS-12's lint clause became a pointer to two `dependency-cruiser`
rules that already fail the build, BUS-7 lost its configurability, and BUS-10 and BUS-11 lost their
reason to exist. That is the substance of the work as much as the code is — a requirement that
restates what the compiler already guarantees is a requirement that will one day be implemented a
second time.

The one thing that must not be lost in the retirement: two of those four compile-time guarantees are
now checked by `@ts-expect-error` and nothing else. If those two comments are ever deleted as
redundant, four requirements go unguarded at once and nothing will say so.

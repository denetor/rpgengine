# Spec — `TIME`, the game clock and the scheduler

**Service:** `TIME` · **Priority:** 1 · **Sheet:** [`services/time.md`](../services/time.md)
**Requirements:** ARC-9.1, ARC-9.3, ARC-9.4, ARC-10.2…10.4, ARC-4.1, ARC-4.2, ARC-8.3, ARC-13.1,
ARC-3.4 · **Step:** 3 of the plan in [`REQUIREMENTS.md`](../REQUIREMENTS.md), with the first `CTX`
**Grill log:** [`.scratch/time/grill-log.md`](../../.scratch/time/grill-log.md)

## Problem Statement

Nothing in this engine can measure a duration, and nothing can make something happen later. Every
deferred fact in the catalogue is already specified as if a scheduler existed: items and enemies
respawn after a time that depends on the area (GP-10), statuses expire without private counters
(CBT-8), merchants restock as a function of elapsed time (ECO-5), NPCs follow routines tied to the
hour of the day (GP-13), and the world has a day/night cycle that governs lighting and spawning
(GP-12). Eleven sheets name `TIME`; the service does not exist.

Building it late is not the risk. Building it as a set of timers is, because four decisions are
settled by this one piece of infrastructure and every one of them is paid for by everything written
afterwards:

1. **Where time enters the domain.** ARC-9.3 allows exactly one door. The moment a second one opens —
   one `Date.now()` in a combat formula, one `setTimeout` in a status effect — ARC-9.1 is gone, and
   it is gone *silently*: the game still runs, the replay just diverges, and nothing points at the
   cause. Every later service must be written against a clock it is handed, and that habit is either
   established now or retrofitted across twelve services.
2. **Whether a deferred fact survives a save.** The choice is made at the first `schedule()` call
   site, not at step 13 when `SAVE` arrives. A scheduler that takes a callback cannot be serialized
   at all (ARC-10.4), so a poisoning with eight seconds left comes back from a save with nothing
   left — and by then a dozen call sites depend on the callback.
3. **What *"the same game twice"* means across a save boundary.** Two timers due at the same
   millisecond must come due in a defined order (ARC-9.4), and that order must be the same after a
   reload as it was before. The mechanism that decides this costs nothing if it is chosen now and is
   unrecoverable later, because it lives in the identity of every timer ever created.
4. **Who drives the world.** This is the first seam where the presentation drives the domain instead
   of being it. Put the driving on the wrong side and frame scheduling ends up in charge of domain
   ordering: an event enters the bus at an instant the browser chose, and reproducibility is lost to
   a cause no test can point at.

None of the four is a performance problem. They are the same problem seen four times: the clock
decides what a reproducible game is, and it decides it before any game exists.

## Solution

A service `TIME` — **generic**, with no knowledge of this game — that owns game time, a timer queue
and the conversion into world time, behind a surface small enough to describe in a sentence: **it
advances by exactly the amount it is given and returns what came due.**

- **No scale, no pause, no modes.** The service does not know what real time is. A frame advances it
  by 16 ms, a combat turn by 6000 ms, and a paused game does not advance it at all — so no timer can
  come due, without the service holding any pause state. *Which situations freeze the world* is a
  rule of this game and stays in `game/orchestration/`.
- **Timers carry domain events.** `schedule(afterMs, event)` takes a member of the game's event
  union and hands it back unchanged at the deadline. There is no wrapper event to dispatch on, and
  serializability stops being prose: a member of the union satisfies `JsonValue` by construction, so
  a callback cannot be scheduled and the error lands at the call site.
- **The world clock is a pure function.** Day, hour, minute and phase are computed from elapsed time
  and the configured calendar; the transitions an advance crosses are computed from its two
  endpoints. Nothing about world time is stored, so nothing about it can drift out of agreement with
  the calendar it came from.
- **Excalibur is the driver, never the scheduler.** It keeps what it is good at — frame pacing, the
  fixed simulation step, the interpolation lag, the cap on an anomalous delta — and the domain keeps
  what must survive a save and run headless. `ex.Timer` is not used anywhere.
- **One fixed point.** The presentation pumps `tick(realDeltaMs)` in `game/orchestration/`, which
  advances the world if it is not paused, publishes what came due and flushes the bus. The world can
  stop while the interface keeps running, which is what a pause menu needs.

Step 3 also builds the **first `GameContext`**: the construction point that holds the bus and the
clock and makes ARC-8.3 — two independent games in one process — a thing a test can assert.

## User Stories

### The developer writing the game's rules

1. As a rules developer, I want to schedule a respawn by saying *what will have happened*, so that I
   write one event type instead of an event type and a payload kind.
2. As a rules developer, I want the scheduled event to be type-checked against the game's union at
   the `schedule()` call site, so that a typo is a compile error rather than a timer that silently
   never does anything.
3. As a rules developer, I want a periodic status effect to come due the right number of times when
   the world advances by a large amount, so that a poisoning does the same damage over six seconds
   however those six seconds were delivered.
4. As a rules developer, I want the repetitions of a periodic timer anchored to their deadlines, so
   that a cycle does not lose its phase after every large advance.
5. As a rules developer, I want everything that came due in one advance handed to me in deadline
   order, so that consequences arrive in the order the world produced them.
6. As a rules developer, I want two timers due at the same instant to arrive in registration order,
   so that the tie is broken by something I can reason about instead of by a hash order.
7. As a rules developer, I want to cancel a timer I scheduled, so that curing a poisoning early stops
   the ticks instead of leaving them to fire on a healthy character.
8. As a rules developer, I want `cancel` to tell me whether the timer was still pending, so that I
   can tell "cancelled" from "already fired" without keeping a second bookkeeping structure.
9. As a rules developer, I want to be able to *not* cancel, so that a stale event that finds nothing
   to act on is a normal, harmless outcome and not a bug I must design around.
10. As a rules developer, I want the clock to return events rather than publish them, so that
    publishing stays where ARC-4.2 puts it and I can see the whole tick in one place.
11. As a rules developer, I want the current time passed to me as a parameter, so that I can test a
    rule by handing it an instant instead of by moving a clock.

### The developer writing combat

12. As a combat developer, I want to advance the world by a whole turn when a turn resolves, so that
    a turn-based fight and a real-time one use the same clock and the same timers.
13. As a combat developer, I want the turn's length to be my own configuration, so that the engine
    does not learn what a turn is.
14. As a combat developer, I want everything that comes due inside a turn delivered as one ordered
    batch, so that a character who dies mid-turn still resolves the turn's consequences in order.
15. As a combat developer, I want to decide later whether combat is real-time or turn-based, so that
    the clock does not make that decision for me now.

### The developer writing a scene or a HUD panel

16. As a scene developer, I want to read `now()` and `worldTime()` while drawing, so that a clock
    widget updates every frame without an event per minute.
17. As a scene developer, I want the interface to keep animating while the world is paused, so that a
    pause menu is usable.
18. As a scene developer, I want the bus to keep delivering while the world is paused, so that
    equipping an item from a paused inventory updates the panel immediately.
19. As a scene developer, I want the presentation never to be the thing that publishes, so that what
    reaches the bus does not depend on when the browser fired an event.
20. As a scene developer, I want to drive the whole loop by calling one function, so that a testbed
    scene is a few lines and not a copy of the game loop.

### The developer of the engine

21. As an engine developer, I want the clock to have no dependency on Excalibur, so that the same
    game runs headless with no canvas and no renderer.
22. As an engine developer, I want the fixed step, the frame pacing and the cap on an anomalous delta
    to stay in the driver, so that the domain contains no policy about frames.
23. As an engine developer, I want the phases of the day declared as data, so that a game with three
    phases or with none uses the same engine.
24. As an engine developer, I want the clock parametric on the event union, so that it cannot name an
    event of this game even by accident.
25. As an engine developer, I want the whole surface exercised against an invented domain, so that
    "generic" is verified rather than claimed.
26. As an engine developer, I want insertion and expiry to be logarithmic, so that a thousand pending
    timers cost nothing per frame.

### The developer of the game's bootstrap

27. As a bootstrap developer, I want the calendar validated before the context exists, so that a
    malformed `time` section fails at load with every problem listed, not at the first hour change.
28. As a bootstrap developer, I want a sensible clock with no configuration at all, so that a test or
    a reused engine can build one without inventing a calendar.
29. As a bootstrap developer, I want the bus and the clock built in one explicit place, so that the
    construction order is readable and nothing resolves itself.
30. As a bootstrap developer, I want two independent games in one process, so that the absence of
    global state is a test and not a hope.
31. As a bootstrap developer, I want `dispose()` to leave nothing behind, so that a test that builds
    a hundred contexts does not accumulate them.

### The player, through whoever implements their save

32. As a player, I want a poisoning with eight seconds left to have eight seconds left after I
    reload, so that saving is not a way to cure myself.
33. As a player, I want a reloaded game to unfold exactly as an uninterrupted one, so that saving
    changes nothing about what happens next.
34. As a player, I want a corrupt save refused with a clear message, so that I do not play for an
    hour inside a game that was already broken when it loaded.
35. As a player, I want the game paused while I read a menu, so that nothing kills me while I choose
    a potion.
36. As a player, I want the world to keep its schedule while the window is in the background, so that
    coming back does not dump an hour of consequences into one frame.

### The developer debugging

37. As a developer, I want a testbed scene showing game time, world time and timers coming due, so
    that I can see the clock behave before any game exists.
38. As a developer, I want to advance the world by hand from that scene, so that I can reproduce a
    large delta without backgrounding a window.
39. As a developer, I want every timer's deadline to be an absolute instant, so that reading a save
    tells me when something is due without arithmetic.

## Implementation Decisions

Every decision below is argued in full in the grill log; what follows is the outcome. The sheet has
been rewritten around them, and five other sheets adjusted (see *Changes to other sheets*).

### Modules

One new service, `TIME`, at `engine/core/time/`, with the single public surface ARC-2.1 requires.
Its internals — the heap, the calendar arithmetic, the state format and the configuration section —
stay private behind that surface.

Three modules outside the service change or appear:

- **`game/orchestration/`** — the fixed point, `tick(realDeltaMs)`. It appears here and every later
  step reuses it.
- **`game/`** — the first `GameContext`, holding the bus and the clock, built in one place (CTX-1),
  plus the game's event union gaining the three `time/*` types the service exports.
- **`presentation/`** — the boot configures the driver's fixed step and pumps `tick`; a new testbed
  scene `clock` is registered.

### Public contract

```ts
type GameTimeMs = number;                                  // redeclared locally by every consumer
type TimerId = number & { readonly __brand: 'TimerId' };
type DayPhase = string;

interface WorldTime {
  readonly day: number; readonly hour: number; readonly minute: number; readonly phase: DayPhase;
}

interface Clock<E extends DomainEvent> {
  now(): GameTimeMs;
  worldTime(): WorldTime;

  /** Advances by exactly this much game time. Returns what came due, ordered. Publishes nothing. */
  advance(gameDeltaMs: number): readonly E[];

  schedule(afterMs: number, event: E): TimerId;
  scheduleRepeating(everyMs: number, event: E): TimerId;
  cancel(id: TimerId): boolean;

  serialize(): TimeState<E>;
}
```

There is no `tick()`, no `setScale`, no `isPaused`, no `TimerPayload`, no `nextDeadline`. The clock is
constructed with its configuration slice and restored from a state **plus that same slice**, because
the calendar is not in the save.

### How an advance behaves

`advance()` takes **integer** milliseconds and refuses anything else, including a negative delta. It
returns everything whose deadline falls in the interval, as **one batch**, ordered by `(deadline,
id)`, merged with the world-time transitions the same interval crosses. At an equal instant,
world-time events come first, then timers in registration order.

The batch is computed before any consumer runs, and that is the contract: a handler must tolerate a
world that has already moved past the event it is holding. Sixty poison ticks are delivered even if
the entity died on the third, and it is the combat rules that drop damage against a corpse.

For the same total elapsed time, any subdivision returns the same events with the same deadlines.
What differs is the `now()` at which the caller publishes them.

### Timers

Ids are drawn from a **monotonic counter** and branded (`number & { readonly __brand: 'TimerId' }`),
following `EntityId`. The counter doubles as the registration order, so the heap key `(deadline, id)`
satisfies the tie-break rule with no second sequence.

`cancel(id)` reports whether the timer was pending and is otherwise unobservable. Whoever may cancel
keeps the `entity → TimerId` mapping in its own state, and therefore in its own save. Cancellation
may be implemented lazily, provided cancelled entries never reach a save.

`scheduleRepeating` is not sugar: a handler that reschedules itself does so *during the flush*, after
the batch was computed, so a 6000 ms advance would yield one tick instead of sixty. Repetition is
anchored to the deadline (`D + everyMs`), never to the current instant.

`afterMs < 0` and `everyMs <= 0` throw; the second would be an infinite loop inside the batch.

### World time

`worldTime()` and the transition list are **pure functions** of the instants involved and the
configuration. One event per boundary crossed — five hours crossed yield five `time/hour-changed` —
and the service exports its three event types on its public surface for `game/` to fold into the
union, with the producing service in the discriminant as BUS-14 requires: `time/hour-changed`,
`time/day-changed`, `time/day-phase-changed`.

There is no `minute-changed`: the HUD reads `worldTime()` while drawing.

### Configuration

```ts
interface TimeConfig {
  readonly dayLengthMs: number;
  readonly startsAt: { readonly day: number; readonly hour: number; readonly minute: number };
  readonly phases: readonly { readonly name: string; readonly hour: number; readonly minute: number }[];
}
```

Declared as the service's own `SectionShape` under the key `time`, exactly as `RND` declares
`FILTER_SECTION`: the key, the fallback and the check belong to the service, and the composition
mechanism owns none of them. A day is 24 hours of 60 minutes, fixed. Phases are data. **The fallback
is a single phase named `day`**, so an unconfigured clock has no cycle rather than this game's four
phases. Validation reports every problem, not the first.

### The driver

Excalibur is configured with an **integer** `fixedUpdateTimestep`, so the domain only ever receives a
whole number of milliseconds and the fraction is carried by the driver's own accumulator, where real
time is. `Engine.timescale` **stays at 1**: it scales `elapsed` before the update, and a second
scaling in the domain would apply it twice. Excalibur's existing clamp on an anomalous delta is the
project's cap, and the sheet says so, because if the driver ever changes the cap leaves with it.

`ex.Timer` and `Clock.schedule` are not used by the domain for any purpose. `Clock.schedule` remains
available to the presentation for interface-only timing.

### The fixed point

```ts
function tick(realDeltaMs: number): void {
    drainIntents();                                            // always — empty until INP exists
    if (!paused) bus.publishAll(clock.advance(realDeltaMs));    // only if the world runs
    bus.flush();                                                // always
}
```

Pausing means *not advancing the clock*, never *not pumping the beat*: intents drain and the bus
delivers while the world is still. `paused` is orchestration state — a set of reasons, if it ever
needs to be more than a boolean — and the clock never learns of it.

This function is the **only** caller of `advance()`. The presentation may read the clock; it may not
advance it, because only the orchestration publishes.

### The first `GameContext`

Built in one explicit place, holding the bus and the clock, with a `dispose()` that tears both down.
Only the parts of the sheet that this step can honour are honoured: CTX-1 (one construction point),
CTX-2 (dependencies by constructor), CTX-4 (two independent contexts), CTX-6 (dispose), CTX-7
(headless). The aggregate `serialize()` of CTX-9 belongs to `SAVE` at step 13; the clock's own
`serialize()` is in scope here.

### Save and restore

```ts
interface TimeState<E> {
  readonly version: number;
  readonly elapsedMs: GameTimeMs;
  readonly nextId: number;
  readonly timers: readonly { id: TimerId; at: GameTimeMs; every?: number; event: E }[];
}
```

Deadlines are absolute. `nextId` is saved because ids break ties at equal deadlines: a counter
restarting from zero would let a timer created after a load come due before one pending from before,
and the reloaded game would diverge at exactly the point where ARC-9.1's test is *save, reload,
compare*. The list is written ordered by `(at, id)` and rebuilt on load, so the internal layout is
irrelevant and cancelled entries never appear.

Restore is a **factory** taking state and configuration, as `Random.deserialize` is — never a reload
of a live clock, which would briefly hold one game's elapsed time and another's queue. A corrupt
state is refused at the **first** broken invariant, before anything is built: a save is not a
configuration, nobody edited it, and there is no file to fix. `TIME_STATE_VERSION` is exported for
`SAVE` to read.

### How other services get the time

No service receives the clock, by import or injection. `now` is passed as a `GameTimeMs` parameter by
the orchestration, which is already how `BB.get(scope, key, now)` and `INP.consume(now)` are
specified. Consumers **redeclare `type GameTimeMs = number` locally**: rule 3 of the boundary check
has no exception for types and `tsPreCompilationDeps` is on, so even an `import type` fails the
build. Structural typing makes the redeclarations the same type; a shared module would be the
project's first piece of global state.

### Decisions taken deliberately against the obvious alternative

| Obvious | Chosen | Because |
|---|---|---|
| Reuse `ex.Timer` / `Clock.schedule` | own scheduler | callbacks cannot be saved (ARC-10.4), `ex.Timer` seeds its own RNG from the wall clock, and `engine/` may not import `excalibur` |
| `scale` with `0` meaning paused | no scale at all | pause is *not advancing*; a scale would need serializing, reconstructing, and a policy the service must not hold |
| A wrapper `timer-elapsed` event | the payload *is* the event | a wrapper builds a second, untyped dispatcher beside the bus |
| Coalesce world-time transitions into `{from, to}` | one event per crossing | anything else would make the world clock the one thing that behaves differently inside a batch |
| A configurable cap on the delta | the driver's cap | `advance()` cannot tell a 16 ms frame from a 6000 ms turn, so a clamp would truncate the turn |
| `nextDeadline()` so callers can walk deadline by deadline | omitted | no caller today, purely additive later, and flushing per deadline would run the presentation phase sixty times in a frame |
| A carried fractional remainder | integer milliseconds only | the driver already carries the fraction; an integer clock keeps "due at exactly 6000" true |
| `TimerId = string` | branded `number` | a caller-chosen key invites a collision the service cannot detect |

### Changes to other sheets

Already applied, listed so that a reviewer can check them: `audio.md` (AUD-11 no longer reads pause
from the clock), `rendering.md` (REN-12 interpolates over the *driver's* fixed step), `hud.md`
(HUD-5 asks the orchestration to pause), `combat.md` (CBT-8 schedules the expiry event itself),
`persistence.md` (SAVE-11 renumbered), `economy.md` (ECO-5 reads a duration instead of scheduling a
timer, resolving its contradiction with ECO-6), and `CONTEXT.md` (the *Time* section, from three
entries to eight).

## Testing Decisions

### What makes a good test here

The clock's subject matter is **sequence**: what came due, in what order, with which deadlines. Tests
therefore assert arrays returned by `advance()`, not internal structures. No test reaches for the
heap, the live set, the id counter or the calendar's intermediate arithmetic — all four are free to
change shape, and the lazy-cancellation strategy in particular must remain an implementation choice.

Determinism is asserted by **comparing two runs**, not by inspecting state: the same schedule
advanced in ten steps and in one; the same game saved, restored and continued.

### The seams

**1. The service's public surface** (`engine/core/time/index.ts`), headless, colocated `*.spec.ts` —
the seam `RND` and `BUS` already use. Everything about ordering, repetition, cancellation, world time,
configuration and serialization is observable through `advance`, `schedule`, `scheduleRepeating`,
`cancel`, `now`, `worldTime` and `serialize`. No fakes are needed: the service has no dependencies.

**2. The orchestration's fixed point** (`tick`), headless, with the **real bus and the real clock**.
This is the only place where "the world stops but the beat goes on" is a statement about behaviour
rather than about a diagram, and it is where the composition of the two services is proved. It is a
new seam, and it is deliberately the *highest* one: every later step pumps the same function, so the
seam is opened once and reused rather than re-derived per service.

**3. The `clock` testbed scene** (`?scene=clock`), Playwright, against the built page — the seam
`tests/testbed.spec.ts` already established. It proves the presentation can drive the domain, which
is what §7.2 requires of a step, and nothing else: the assertions stay at the level a person could
make by looking at the page.

**Plus the compiler, through `@ts-expect-error`** in a colocated spec: scheduling a payload carrying a
function, a `Date` or a `Map` must fail to compile. TIME-6 is guaranteed by the type system and by
nothing that runs, and `@ts-expect-error` fails when the error stops occurring, inside the existing
`npm run typecheck`.

**Nothing new at the boundary seam.** `engine-may-not-import-excalibur` and
`services-may-not-import-each-other` already bite, and the fixtures already prove they do.

### What gets tested

At the **service surface**:

- **Step independence**: the same schedule advanced 10 × 16 ms and 1 × 160 ms returns identical
  sequences with identical deadlines.
- **Repetition and catch-up**: a 100 ms repeater over 350 ms comes due at 100, 200, 300; over a
  further 350 ms at 400, 500, 600, 700 — the anchoring rule, which a `now`-based implementation
  fails. The last of the four is the boundary, reached exactly by the second advance.
- **Ordering**: equal deadlines come due in registration order; a world-time transition and a timer at
  the same instant come back world-time first.
- **World time**: an advance spanning five hours returns five `time/hour-changed` merged in order with
  whatever timers fell between them; a phase boundary is crossed exactly once however large the
  advance; an unconfigured clock never emits `time/day-phase-changed`.
- **Cancellation**: a cancelled timer never comes due, `cancel` reports pending vs already-fired, a
  cancelled repeater stops, and a save taken with one pending contains no trace of it.
- **Not advancing advances nothing**: no events, `now()` and `worldTime()` unchanged.
- **Refusals**: non-integer delta, negative delta, `everyMs <= 0`.
- **Save and restore**: the remainder is exact; a restored clock continues the *identical* sequence,
  including the tie-break between a timer scheduled before the save and one scheduled after the
  load — the test `nextId` exists for.
- **Corrupt state**: each invariant refused before construction, with the message naming it.
- **Isolation**: two clocks do not observe each other (ARC-8.3's half).
- **Reusability** (ARC-3.4): the whole surface exercised with an invented event union and an invented
  calendar — a `reusability.spec.ts`, under that name, as `RND` and `BUS` have.
- **Configuration**: a malformed section reports every problem; the absent section yields the
  documented fallback.

At the **fixed point**:

- What `advance()` returns is published and flushed in the same beat, in order.
- **Paused**: the clock does not move and no timer comes due, **and the bus still flushes** — a
  presentation handler subscribed to an event published by an intent still runs.
- Two contexts pumped independently do not observe each other (ARC-8.3, end to end).
- After `dispose()`, pumping is inert and nothing is registered on the bus.

At the **scene**:

- `?scene=clock` opens, shows game time and world time advancing, and a timer coming due is visible.
- A control advances the world by a large amount and the display shows the batch arriving at once.
- Pausing freezes the world clock while the page stays alive and responsive.

### Prior art

`src/engine/core/random/` is the model for the service seam: colocated specs, `reusability.spec.ts`
for ARC-3.4, `isolation.spec.ts` for the no-interference property, `serialization.spec.ts` for the
round trip, and `assertRandomState` for the refuse-before-building discipline this spec copies.
`src/engine/core/event-bus/` is the model for a service parametric on the event union and for
`@ts-expect-error` assertions on compile-time claims. `tests/testbed.spec.ts` is the model for the
scene seam: the built page, entered by URL, asserted the way a person would look at it.

## Out of Scope

- **Whether combat is real-time or turn-based.** The clock serves either; the decision belongs to
  `CBT` at step 11.
- **`INP` and the intent queue.** `drainIntents()` exists as the fixed point's first line and has
  nothing to drain until step 7.
- **`SAVE`.** The clock serializes its own portion; aggregating portions, slots, metadata and
  migration is step 13. No migration path is written for `TIME_STATE_VERSION` beyond refusing a
  version it cannot read.
- **The full `GameContext`.** One field per service, the aggregate `serialize()`, and construction
  from a save arrive with the services that need them.
- **A pause-reason set.** A boolean is enough while `HUD` and `DLG` do not exist; the shape lives in
  the orchestration and can grow without touching the clock.
- **Slow-motion inside the domain.** Achievable today by passing a smaller delta; if it is ever
  wanted as a feature, whoever wants it decides how to round, visibly.
- **`nextDeadline()` and deadline-by-deadline walking.** Additive later, with no migration.
- **A `minute-changed` event**, calendars other than 24 × 60, and multiple simultaneous calendars.
- **Audio, lighting and NPC routines reacting to the day/night cycle.** The events exist at the end
  of this step; their consumers do not.

## Further Notes

- **The cap on an anomalous delta is on loan from Excalibur.** It is the driver's, deliberately, and
  the sheet names it as such. Replacing the driver means re-providing it, and that is a one-line
  change at the pump rather than a change to the domain.
- **`economy.md` contradicted itself** and the fix is in this spec's blast radius: ECO-5 scheduled a
  restock timer per merchant, ECO-6 forbade exactly that in favour of a lazy computation. ECO-6 is
  the one that scales; ECO-5 now reads a duration.
- **One spelling is still open**, and nothing depends on it: whether restore is `Clock.deserialize`
  (a class with a static, as `RND` has) or `restoreClock(state, config)` (a factory function, as
  `createEventBus` has). The two precedents in this repo disagree.
- **The three `time/*` event types are the first events the union receives from a service.** They are
  also the first test of BUS-14's prefix convention against a real producer.

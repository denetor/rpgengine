# TIME — Game time and scheduler

**Area:** Core · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `TIME-*`
**Grill log:** [`.scratch/time/grill-log.md`](../../.scratch/time/grill-log.md)

## Purpose

To be the domain's **single source of time**. It holds game time (distinct from real time), converts
it into world time for the day/night cycle, and owns a **scheduler** for deferred facts: respawns,
status effect expiry, merchant restocking, NPC routines.

Without this service, timers end up scattered as `setTimeout` calls and private counters, which makes
pause, saving and reproducibility impossible.

The service does **not** know what real time is. It advances by exactly the amount it is given, and
who decides that amount — a frame, a combat turn, a fast-forward — is the caller's business. It has
no scale, no pause and no modes: *pause* is the orchestration choosing not to advance it (TIME-2), and
the fixed step, the frame pacing and the cap on an anomalous delta belong to the **driver** (TIME-3).

## Contract

| Item | Value |
|---|---|
| Depends on | no service. One construction argument: its configuration slice |
| Does NOT depend on | `excalibur`, `Date.now()`, `performance.now()`, `setTimeout`, any other service, any type of this game |
| Consumed by | `game/orchestration` (the only caller of `advance()`); the presentation **reads** `now()` and `worldTime()` |
| Dynamic state | elapsed game time, the queue of pending timers, the id counter |
| Static state | none — the calendar is configuration, not content |
| Configuration | `dayLengthMs`, `startsAt`, `phases`, under the key `time` (TIME-11) |
| External data | none |
| Events emitted | `time/hour-changed`, `time/day-changed`, `time/day-phase-changed` (TIME-10) |
| Order of magnitude | hundreds of pending timers, 10³ in the worst case; an advance touches only what came due |

## Public API

```ts
type GameTimeMs = number;                                  // game milliseconds since the game began
type TimerId = number & { readonly __brand: 'TimerId' };
type DayPhase = string;                                    // declared in the configuration, not an enum

interface WorldTime {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly phase: DayPhase;
}

interface Clock<E extends DomainEvent> {
  now(): GameTimeMs;
  worldTime(): WorldTime;

  /**
   * Advances game time by exactly this much. Returns what came due, ordered;
   * it does not publish it (ARC-4.2). Integer milliseconds only.
   */
  advance(gameDeltaMs: number): readonly E[];

  schedule(afterMs: number, event: E): TimerId;
  scheduleRepeating(everyMs: number, event: E): TimerId;
  cancel(id: TimerId): boolean;

  serialize(): TimeState<E>;
}
```

Constructed with its configuration slice; restored from a `TimeState` **and** that same slice, since
the calendar is not in the save (TIME-13).

The clock is **parametric on `E`**, exactly as the bus is. It never imports a type of this game — nor
could it: it lives under `engine/` and rule 4 of the boundary check
(`engine-may-not-import-the-layers-above`) fails the build on `engine/ → game/`.

## Requirements

**TIME-1** — No domain code **MUST** read `Date.now()`, `performance.now()` or use
`setTimeout`/`setInterval`: time enters through `advance()` and nowhere else (ARC-9.3).

**TIME-2** — **Game time MUST** be distinct from real time, and the service **MUST NOT** know the
difference: `advance(deltaMs)` moves it by exactly `deltaMs`, and **the caller decides the
conversion**. There is no scale factor and no pause state.

A paused game simply does not advance the clock, so no timer can come due: the guarantee is obtained
by not doing anything rather than by multiplying by zero. Slow-motion is a caller passing a
smaller delta; a combat turn is a caller passing `advance(turnMs)` when the turn resolves. Which
situations freeze the world is a rule of *this* game and lives in `game/orchestration/`.

**Pause must stop the world, not the beat.** The orchestration's fixed point runs on every frame
regardless: intents are drained and the bus is flushed even while paused, or an item equipped from a
paused inventory would not reach the panel until the game resumed. Only the advance is conditional.

**TIME-3** — `advance()` **MUST** take **integer** milliseconds and **MUST** refuse anything else,
along with a negative delta. The clock is integer arithmetic end to end: deadlines are compared for
equality and ordered, and an accumulated fraction would make "due at exactly 6000" stop meaning what
it says.

The fraction of a fractional frame is carried by the **driver**, which is where real time is: with
Excalibur, `fixedUpdateTimestep` set to an integer makes its own accumulator call the update a whole
number of times. The driver also owns the frame pacing and the **cap on an anomalous delta** (a
backgrounded window, a breakpoint). The cap **MUST NOT** live here: `advance()` cannot distinguish a
16 ms frame from a 6000 ms combat turn, so a clamp inside the service would silently truncate the
turn instead of the anomaly.

`Engine.timescale` **MUST** stay at 1: Excalibur scales `elapsed` before handing it to the update, so
a second scaling here would apply it twice.

**TIME-4** — `advance()` **MUST** return the events that came due in increasing order of deadline;
for equal deadlines, in registration order. It **MUST NOT** publish them (ARC-4.2): publishing is the
orchestration's, which is the only caller.

For the same total elapsed time, **any subdivision returns the same events, in the same order, with
the same deadlines**: ten advances of 16 ms and one of 160 ms are indistinguishable in what comes
back. What differs is the `now()` at which the caller publishes them, which is a property of the
caller and not of the scheduler.

**TIME-5** — A single `advance()` **MUST** correctly handle **several deadlines**, including several
repetitions of a periodic timer: a 100 ms repeating timer over a 6000 ms advance comes due 60 times,
in one batch, before any rule runs.

**Repetition is anchored to the deadline**, never to the current instant: after coming due at `D`,
the next deadline is `D + everyMs`. Anchoring to `now` would slide a batch's deadlines to its end and
lose the cycle's phase after every large advance.

**Consumers MUST tolerate a world that has already moved past the event they are holding.** If the
entity dies on the third of those 60 ticks, the other 57 are still delivered, and it is the combat
rules that drop damage against a corpse. This is the discipline the bus already imposes — an event is
a fact, not a request — and it **MUST NOT** be worked around inside the scheduler.

**TIME-6** — A timer's payload **MUST** be a **domain event**: `schedule(afterMs, event)` takes a
member of the union, and `advance()` returns it unchanged. There is no wrapper event and no separate
payload type.

This is what makes serializability a property of the type instead of a rule: a member of the union
satisfies `JsonValue` by construction, so a callback, an `Actor` or a `Map` cannot be scheduled, and
the error lands at the `schedule()` call site rather than in a save file. A wrapper would instead
build a **second dispatcher beside the bus** — every consumer subscribed to one type, switching by
hand on a string the compiler never checks.

**TIME-7** — The service **MUST NOT** know what a timer means. *"Respawn of enemy E42"*, *"end of
poisoning"* are meanings that belong to the orchestration; here the payload is an opaque `E`,
guaranteed opaque by the type parameter.

**TIME-8** — `TimerId` **MUST** be an opaque branded `number` drawn from a **monotonic counter**, and
an id **MUST NOT** be reused — including across a save and reload (TIME-13). The counter doubles as
the registration order of TIME-4, so no second sequence number exists.

A caller-chosen `string` key is refused deliberately: two subscribers claiming one key by accident is
a collision the service cannot detect.

**TIME-9** — `cancel(id)` **MUST** report whether the timer was pending, and **MUST NOT** be
observable in any other way: a cancelled timer never comes due, never appears in a save, and does not
change what any other timer does.

Whoever may want to cancel keeps the `entity → TimerId` pair **in its own state, and therefore in its
own save**. The service offers no `cancelWhere(payload => …)`: it would have to look inside a payload
it has promised not to understand (TIME-7), and would be a linear scan besides.

Most cancellations turn out to be unnecessary, given TIME-5: a poison tick arriving on a healed
character finds no component and does nothing. `cancel` earns its place for repeating timers, which
would otherwise stay in the queue for ever.

**TIME-10** — The service **MUST** convert game time into **world time** — day, hour, minute, phase —
and emit `time/hour-changed`, `time/day-changed` and `time/day-phase-changed` at the transitions.

The conversion and the transitions **MUST** be **pure functions** of the instants involved and the
configuration: `worldTime()` of one instant, the transitions of the two instants an advance spans.
Nothing about world time is remembered and nothing is serialized, so nothing can drift out of
agreement with the calendar it came from.

**One event per boundary crossed**, as for timers: an advance spanning five hours returns five
`time/hour-changed`. They are **merged into the same ordered sequence** as the timers; at the same
instant, **world-time events come first**, then timers in registration order.

**TIME-11** — The calendar **MUST** be configuration, declared as this service's own section under
the key `time`, validated before the context exists (CTX-10) and reporting **every** problem rather
than the first (RND-24):

```ts
interface TimeConfig {
  readonly dayLengthMs: number;   // game milliseconds in one day
  readonly startsAt: { readonly day: number; readonly hour: number; readonly minute: number };
  readonly phases: readonly { readonly name: string; readonly hour: number; readonly minute: number }[];
}
```

- A day is **24 hours of 60 minutes, fixed**: world time is a human-readable projection of
  `dayLengthMs`, not a physics, and `dayLengthMs` alone already makes a day as long or short as
  wanted.
- **Phases are data and `DayPhase` is a `string`**: a generic engine cannot know that this game has
  dawn, day, dusk and night (ARC-3.2). The current phase is the last one whose start is ≤ the current
  time; adding a fifth is a data edit.
- **In the absence of the section, the fallback is a single phase named `day`** covering the whole
  day, so `time/day-phase-changed` never fires. A clock nobody configured has no cycle; four
  hardcoded phases would be this game's content sitting in `engine/` as a default value.
- Validation: `dayLengthMs` a positive integer; `phases` non-empty, ordered, starting at 00:00, names
  distinct; `startsAt` inside the day.

There **MUST NOT** be a `minute-changed` event. The HUD clock calls `worldTime()` while drawing — a
read, lawful for the presentation (ADR-0004) — and emitting an event 1 440 times a day so a label can
update is a cost every subscriber pays, in the tick, for ever.

**TIME-12** — Insertion and expiry **MUST** be logarithmic, with no linear scan per advance
(ARC-13.1). A binary heap keyed by `(deadline, id)` satisfies TIME-4's ordering with no extra
structure, because the id *is* the registration order (TIME-8).

Cancellation **MAY** be lazy — the entry left in the heap and discarded when it surfaces — provided
TIME-9 holds observably, which requires cancelled entries to be filtered out by `serialize()`.

**TIME-13** — The dynamic state **MUST** be serializable on its own, with a version of its own
(ARC-10.2), and pending timers **MUST** resume with the exact remainder (ARC-10.4):

```ts
interface TimeState<E> {
  readonly version: number;
  readonly elapsedMs: GameTimeMs;
  readonly nextId: number;
  readonly timers: readonly { id: TimerId; at: GameTimeMs; every?: number; event: E }[];
}
```

- **Deadlines are absolute.** With `elapsedMs` beside them the remainder is exact by subtraction and
  nothing is rounded on write.
- **`nextId` is saved.** The ids break ties at equal deadlines (TIME-4, TIME-8); a counter restarting
  from zero would give a timer created after a load a *lower* id than one pending from before, and
  the same game, saved and reloaded, would produce a different sequence — at exactly the point where
  ARC-9.1's test is *save, reload, compare*. It cannot be derived as `max(saved id) + 1` either: ids
  consumed by timers that already fired are not in the list and would be handed out twice.
- **The list is written ordered by `(at, id)`** and rebuilt on load. Since the order in which the
  queue comes due is fully determined by that key, the internal layout is irrelevant and a resumed
  game comes due in exactly the sequence an uninterrupted one would.
- **World time is not saved**: it is derivable (TIME-10) and the configuration is not part of the
  save (CFG-15). Consequence, stated rather than discovered: changing `dayLengthMs` reinterprets
  existing saves — the same game finds itself at a different hour of the day.
- Restore is a **factory** taking the state and the configuration, as `Random.deserialize` is, never
  a reload of a live clock: a half-restored clock would hold one game's elapsed time and another's
  queue, and the `TimerId`s handed out before it would point at strangers' timers (CTX-9).
- A corrupt state **MUST** be refused **at the first broken invariant**, before anything is built
  from it. A save is not a configuration: nobody edited it, there is no file to fix, and there is no
  reason to collect every problem before giving up. The invariants: the expected `version`, with the
  message naming both; `elapsedMs` and `nextId` non-negative integers; every `at >= elapsedMs`; every
  `every` a positive integer; ids distinct and below `nextId`; the list ordered by `(at, id)`; every
  event an object with a `string` `type` — all that can be checked without looking inside a payload
  the service has promised not to understand. The version constant is exported on the public surface,
  because `SAVE` reads it to decide whether it can migrate.

**TIME-14** — No service **MUST** receive the clock, by import or by injection (ARC-4.1). Whoever
needs the current time receives it as a `GameTimeMs` **parameter**, passed by the orchestration —
`BB.get(scope, key, now)`, `INP.consume(now)`, and EXPR-8 for the case of an expression. A service
holding a clock stops depending only on its arguments, cannot be tested by handing it an instant, and
gains a temporal coupling no signature declares.

Consumers therefore **MUST redeclare `type GameTimeMs = number` locally** rather than import it: rule
3 of the boundary check forbids a service importing another service **with no exception for types**,
and `tsPreCompilationDeps` is on, so even an `import type` fails the build. Structural typing makes
the redeclarations the same type. Moving it to a shared module would be the project's first piece of
global state.

### Retired requirements

The first version of this sheet had eleven requirements; the argument for each change is in
[`.scratch/time/grill-log.md`](../../.scratch/time/grill-log.md).

| Was | Outcome |
|---|---|
| old TIME-2 (scalable, `scale = 0` is pause) | cut: pause is the orchestration not advancing the clock — now TIME-2 |
| old TIME-5 (optional fixed simulation step) | cut: the driver owns the fixed step, and a headless caller passing a constant delta is fixed by construction |
| old TIME-7 (payload is data, never a callback) | became a property of the type: the payload is a domain event — now TIME-6 |
| old TIME-10 (configurable cap on an anomalous delta) | cut: the service cannot tell a frame from a combat turn, so the cap belongs to the driver — now part of TIME-3 |
| old TIME-11 (simulated time vs interface time) | cut: interface time is the driver's real delta and lives only in the presentation |
| `timer-elapsed` among the events emitted | cut: the payload is the event, so there is nothing to wrap (TIME-6) |
| `tick()` | renamed `advance()`: the *tick* is the orchestration's beat, this is only time moving |
| `phase-changed` | renamed `time/day-phase-changed`: *phase* already means the delivery phase |
| `TimerId = string` | an opaque branded `number` from a monotonic counter (TIME-8) |

## Test criteria

The seam is the public surface: no test reaches for the heap, the id counter or the live set.

- The same sequence of events with large and small advances, for the same total time.
- A 100 ms repeating timer over a 350 ms advance comes due 3 times, with deadlines 100, 200, 300 —
  and over a further 350 ms at 400, 500, 600, 700, which is the anchoring rule of TIME-5. The fourth
  is the boundary: an advance reaching 700 exactly is an advance that crossed that deadline.
- A timer and a world-time transition at the same instant come back in that order, world time first.
- An advance spanning five hours returns five `time/hour-changed`, in order, merged with whatever
  timers fell between them.
- Phase transitions happen exactly once per crossing, however large the advance.
- Saving and reloading halfway through a timer: the remainder is exact, and the sequence of a resumed
  game is identical to that of an uninterrupted one — including the tie-break between a timer
  scheduled before the save and one scheduled after the load, which is what `nextId` exists for.
- A save taken with a cancelled timer pending contains no trace of it.
- A corrupt state is refused before the clock is built, with a message naming the broken invariant.
- Not advancing the clock advances nothing: no timer comes due, `worldTime()` does not move.
- A non-integer or negative delta is refused; `everyMs <= 0` is refused.
- Two clocks do not observe each other (the clock's half of ARC-8.3).
- The clock works with a made-up event union and a made-up calendar, foreign to this game (ARC-3.4).
- **The compile-time claim, via `@ts-expect-error`**: scheduling a payload carrying a function, a
  `Date` or a `Map`. TIME-6 is guaranteed by the type system and by nothing that runs — if the
  assertion is ever deleted as redundant, nothing says so.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-9 (determinism), ARC-10 (serializability),
  ARC-13 (performance), ARC-4.2 (a command returns its events)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-10 (respawn), GP-12 (day/night cycle), GP-13 (routines)
- [`event-bus.md`](./event-bus.md) — who publishes what `advance()` returns, and the `time/` prefix
- [`game-context.md`](./game-context.md) — who owns the clock instance, and who may read it
- [`persistence.md`](./persistence.md) — SAVE-11, the pending timers in the save
- [`rendering.md`](./rendering.md) — REN-12, the interpolation the driver's fixed step makes possible

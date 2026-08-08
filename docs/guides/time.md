# TIME — Game time and scheduler: usage guide

This is a practical, call-by-call guide to the actual `TIME` implementation in
`src/engine/core/time`. For the requirements and the rationale behind each design
decision, see [`../services/time.md`](../services/time.md) — this page only shows how to
call the public surface. Every example below reflects the real signatures exported from
`src/engine/core/time/index.ts`.

```ts
import {
  createClock,
  restoreClock,
  TIME_STATE_VERSION,
  DEFAULT_TIME_CONFIG,
  TIME_SECTION,
  timeConfigProblems,
  validateTimeConfig,
  assertTimeConfig,
  TimeConfigError,
  describeIssue,
} from '../../engine/core/time'; // adjust the relative path to your file's location
import type {
  Clock,
  DayPhase,
  DomainEvent,
  GameTimeMs,
  JsonValue,
  TimeConfig,
  TimerId,
  TimerState,
  TimeState,
  WorldTime,
  HourChanged,
  DayChanged,
  DayPhaseChanged,
  TimeEvent,
  TimeConfigIssue,
  TimeConfigProblem,
} from '../../engine/core/time';
```

## 1. Quick reference

One line per call; jump to the matching section below for the description, the full
example and the error cases.

| Call | Consumes/moves time? | Notes |
|---|---|---|
| `createClock(config?)` | — | starts at `now() === 0`, nothing pending |
| `restoreClock(state, config?)` | — | static factory, not a reload of a live clock |
| `clock.now()` | no | |
| `clock.worldTime()` | no | pure function of `now()` and the calendar |
| `clock.advance(gameDeltaMs)` | yes | returns due events, does **not** publish them |
| `clock.schedule(afterMs, event)` | no | one-shot |
| `clock.scheduleRepeating(everyMs, event)` | no | anchored to its own deadline, not to `now` |
| `clock.cancel(id)` | no | reports whether the timer was still pending |
| `clock.serialize()` | no | a snapshot; advancing afterwards does not move it |
| `validateTimeConfig(value, file?)` / `assertTimeConfig(value, file?)` | — | report vs. throw, the `random/config.ts` pattern |

## 2. Creating the clock

Builds the single source of time for a game: an optional calendar, and nothing else. No
service, no clock of the host machine, no scale.

```ts
// No calendar: the clock runs on DEFAULT_TIME_CONFIG — a day of 24 real
// hours, one phase named 'day', so time/day-phase-changed never fires.
const clock: Clock<GameEvent> = createClock<GameEvent>();
```

```ts
// This game's own calendar (src/game/calendar.ts): a day/night cycle with
// four named phases, a day 24 real minutes long.
const GAME_CALENDAR: TimeConfig = {
  dayLengthMs: 1_440_000,
  startsAt: { day: 1, hour: 6, minute: 30 },
  phases: [
    { name: 'night', hour: 0, minute: 0 },
    { name: 'dawn', hour: 5, minute: 0 },
    { name: 'day', hour: 8, minute: 0 },
    { name: 'dusk', hour: 20, minute: 0 },
  ],
};

const clock = createClock<GameEvent>(GAME_CALENDAR);
```

`Clock<E>` is parametric on the game's event union, exactly as `EventBus<E>` is: the
service never imports a type of this game, and could not — it lives under `engine/`, and
rule 4 of the boundary check fails the build on `engine/ → game/`.

A malformed calendar is refused before anything is built from it:

```ts
createClock<GameEvent>({ dayLengthMs: 0, startsAt: { day: 0, hour: 0, minute: 0 }, phases: [] });
// TimeConfigError: time configuration: dayLengthMs: expected a whole number of game
// milliseconds in a day, at least 1440 …; found 0
// time configuration: phases: expected at least one phase: …; found []
```

## 3. Reading time

`now()` is the raw instant; `worldTime()` is the same instant as a person reads it — day,
hour, minute, phase. Both are reads: neither moves anything, and both are safe to call from
the presentation while drawing (ADR-0004).

```ts
clock.now();
// 0 — a freshly created clock starts at game time zero

clock.worldTime();
// { day: 1, hour: 6, minute: 30, phase: 'dawn' } — GAME_CALENDAR's startsAt, projected
```

There is deliberately no `minute-changed` event: a HUD clock calls `worldTime()` on every
frame it draws, which is a read, and emitting an event 1 440 times a day so a label can
update is a cost every subscriber in the game would pay, forever (TIME-11).

## 4. Advancing time

The only door through which time enters the clock (TIME-1). It moves game time by exactly
`gameDeltaMs` and returns everything that came due, in order — it does **not** publish
anything (ARC-4.2): that is the orchestration's job, and `advance()` is meant to be its only
caller.

```ts
const combatDamageTick: GameEvent = { type: 'combat/dot-tick', targetId: 'goblin-3' };
const timerId = clock.schedule(2000, combatDamageTick);

const due = clock.advance(2500);
// [{ type: 'combat/dot-tick', targetId: 'goblin-3' }] — the timer came due at 2000,
// inside the 2500 ms the advance covered
```

`gameDeltaMs` must be a whole, non-negative number of milliseconds — the clock is integer
arithmetic end to end, because a deadline is compared for equality, not for nearness:

```ts
clock.advance(16.6);
// Error: advance() takes whole milliseconds and gameDeltaMs is 16.6. …

clock.advance(-1);
// Error: advance() cannot go backwards and was given -1. …
```

**Subdividing an advance never changes what comes back.** Ten calls of `advance(16)` and one
call of `advance(160)` return the same events, in the same order, with the same deadlines —
only *when* the caller gets to publish them differs, which is a property of the caller, not
of the clock:

```ts
const a = createClock<GameEvent>();
a.schedule(150, { type: 'door/unlocks', doorId: 'vault' });
let batch: GameEvent[] = [];
for (let i = 0; i < 10; i += 1) batch = [...batch, ...a.advance(16)];

const b = createClock<GameEvent>();
b.schedule(150, { type: 'door/unlocks', doorId: 'vault' });
const once = b.advance(160);

// batch and once carry the same event — the vault unlocks once, not twice
```

**A caller must tolerate a world that has already moved past an event it is holding.** A
single `advance()` can return several deadlines, including several repetitions of the same
periodic timer, and it is the domain rules — not the scheduler — that decide what to do when
the target of a late-arriving event is no longer there:

```ts
// A 100 ms poison tick, and one advance that spans 350 ms of game time.
const poison = clock.scheduleRepeating(100, { type: 'status/poison-tick', targetId: 'hero' });
clock.advance(350);
// three poison ticks come back, at 100, 200 and 300 — the fourth (400) is still ahead
```

If the target died on the first tick, the other two are still delivered: it is the combat
rules' job to drop damage against a corpse, not the clock's.

## 5. Scheduling — one-shot

Registers an event to come due once, `afterMs` from the current instant, and returns the
handle needed to cancel it (§7).

```ts
const respawnEvent: GameEvent = { type: 'enemy/respawns', enemyId: 'goblin-3' };
const respawnId: TimerId = clock.schedule(30_000, respawnEvent);
```

The event is handed back **unchanged** when it comes due — there is no wrapper type and no
second dispatcher beside the bus (TIME-6): whatever a timer carries must already be a member
of the game's event union.

`afterMs` must be a whole, non-negative number of milliseconds; zero means "due on the next
advance":

```ts
clock.schedule(1000.5, respawnEvent);
// Error: schedule() takes whole milliseconds and afterMs is 1000.5. …

clock.schedule(-1, respawnEvent);
// Error: schedule() was given a deadline in the past: afterMs is -1. …
```

## 6. Scheduling — repeating

Registers an event to come due every `everyMs`, first at `now + everyMs`, until the clock is
destroyed or the timer is cancelled.

```ts
const restockEvent: GameEvent = { type: 'merchant/restocks', merchantId: 'blacksmith' };
const restockId: TimerId = clock.scheduleRepeating(600_000, restockEvent);
```

**Repetition is anchored to the deadline it just came due at, never to the instant the
advance is heading for.** After coming due at `D`, the next deadline is `D + everyMs` — so a
100 ms timer over a 6000 ms advance comes due 60 times, spaced through the advance, not 60
times bunched at the end:

```ts
const oven = createClock<GameEvent>();
const doneId = oven.scheduleRepeating(100, { type: 'oven/batch-ready' });

oven.advance(350);
// three events, deadlines 100, 200, 300

oven.advance(350);
// four more, deadlines 400, 500, 600, 700 — the cycle's phase survived the big jump
```

`everyMs` must be a whole, strictly positive number of milliseconds:

```ts
clock.scheduleRepeating(0, restockEvent);
// Error: scheduleRepeating() takes a positive period and was given 0. …
```

## 7. Cancelling

Reports whether the timer was still pending — `false` for one that already came due, one
already cancelled, or an id this clock never handed out — and is otherwise unobservable: a
cancelled timer never comes due and never changes what any other timer does (TIME-9).

```ts
clock.cancel(restockId);
// true — the merchant's next restock will not happen

clock.cancel(restockId);
// false — already cancelled
```

There is no `cancelWhere(payload => …)`: the clock has promised not to understand a payload
(TIME-7), and a caller that wants to cancel a timer later keeps the `entity → TimerId` pair
in **its own state**, and therefore in its own save. Most cancellations turn out to be
unnecessary given §4's tolerance rule — `cancel` earns its place mainly on repeating timers,
which would otherwise sit in the queue forever.

## 8. Save and restore

Turns the clock's dynamic state — elapsed time, the id counter, and every pending timer with
its **absolute** deadline — into plain data for a save file, and rebuilds an equivalent clock
from it.

```ts
const state: TimeState<GameEvent> = clock.serialize();
// { version: 1, elapsedMs: 12500, nextId: 4, timers: [{ id: 3, at: 42500, event: {...} }, ...] }

// Restore is a static factory, never an instance method (TIME-13), for the same
// reason Random.deserialize is: no instant where a live clock holds one game's
// elapsed time and another's queue.
const restored = restoreClock<GameEvent>(state, GAME_CALENDAR);
```

- Only **pending** timers are in `timers`; a cancelled one leaves no trace (TIME-9), and
  nothing has to be swept for it to be true.
- The **calendar is not part of the save** (TIME-13, CFG-15) — pass the configuration
  currently in force at load time, same as `restoreClock`'s second argument above. A
  rebalanced `dayLengthMs` reinterprets existing saves: the same elapsed time lands at a
  different hour of the day.
- **World time is not in the save** either — it is derivable from `elapsedMs` and the
  calendar (TIME-10), so nothing here can drift out of agreement with the calendar it came
  from.

`restoreClock` validates the state before building anything from it — a corrupt save throws
rather than producing a subtly wrong game:

```ts
restoreClock<GameEvent>({ version: 2, elapsedMs: 0, nextId: 1, timers: [] } as TimeState<GameEvent>);
// Error: time state: version 2 cannot be read by version 1
```

## 9. World-time events, merged with timers

An advance spanning a boundary of the calendar returns the world-time transition folded
into the same ordered batch as the timers — the return type of `advance()` is `readonly (E |
TimeEvent)[]` for exactly this reason.

```ts
// GAME_CALENDAR starts at day 1, 06:30 — the next hour boundary is 07:00.
const untilSeven = /* however many game ms that is */;
clock.advance(untilSeven);
// [{ type: 'time/hour-changed', day: 1, hour: 7 }]
```

**One event per boundary crossed, however large the advance:** five hours in one call
returns five `time/hour-changed`, in order. **At the same instant, world-time events come
first, then timers, in registration order** — a timer scheduled *for* 07:00 is a consequence
of 07:00 having arrived, so it cannot precede it:

```ts
const bell: GameEvent = { type: 'town/bell-tolls' };
clock.schedule(msUntilNextHour, bell);
clock.advance(msUntilNextHour);
// [{ type: 'time/hour-changed', day, hour }, { type: 'town/bell-tolls' }]
```

There are exactly three world-time event types — `time/hour-changed`, `time/day-changed`,
`time/day-phase-changed` — and a clock built on `DEFAULT_TIME_CONFIG`'s single phase never
emits the third: there is no boundary between two phases to cross, not even at midnight.

## 10. Who may hold the clock

**No service may receive the clock, by import or by injection (TIME-14).** Whoever needs the
current time is handed a `GameTimeMs` **parameter** by the orchestration — the same shape as
`BB.get(scope, key, now)` or `INP.consume(now)` — never a reference to `Clock` itself. A
service holding a clock would stop depending only on its arguments and could no longer be
tested by handing it an instant.

Consumers that need the type **redeclare `type GameTimeMs = number` locally** rather than
import it — the same second-declaration pattern `JsonValue` and `DomainEvent` use (§11) —
because rule 3 of the boundary check forbids a service importing another service, types
included, and structural typing makes the redeclaration the same type.

In practice, the clock lives on the game context (`src/game/bootstrap.ts`) beside the event
bus, and only the orchestration's fixed point calls `advance()`:

```ts
export interface GameContext {
  readonly bus: EventBus<GameEvent>;
  readonly clock: Clock<GameEvent>; // presentation may read now()/worldTime(); only
                                     // orchestration advances it (ARC-4.2)
}
```

## 11. `JsonValue` and `DomainEvent` are declared twice, on purpose

Exactly as `event-bus.md` documents for the bus: `TIME` exports its own `JsonValue` and
`DomainEvent`, structurally identical to the bus's, and not a re-export of them. Whoever
constructs a clock writes the same event union against both services; a shared module
holding one declaration would be the project's first piece of global state.

```ts
// game/events.ts — one union, handed to both services, each seeing its own
// (structurally identical) declaration of DomainEvent.
export type GameEvent = HourChanged | DayChanged | DayPhaseChanged | EnemyRespawns | /* … */;
```

## 12. Validating a calendar (`game/balance/time.json`)

Checks that a game's calendar — day length, start time, phases — is well-formed *before* it
is handed to `createClock`, so a typo (a day of zero length, a start hour of 25) is refused
with a precise, actionable error instead of quietly producing a subtly wrong game. `TIME`
reads no files itself: this is what the loader is expected to call first (TIME-11). The
pattern is identical to `RND`'s (`random/config.ts`) and `CFG`'s section mechanism.

```ts
const raw: unknown = JSON.parse(fileContents);
const issues: readonly TimeConfigIssue[] = validateTimeConfig(raw, 'time.json');

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(describeIssue(issue));
    // time.json: phases[2].name: expected a name no other phase uses: … ; found "dusk"
  }
  throw new Error('invalid time.json');
}
```

Or, to fail fast with a single exception carrying every issue:

```ts
try {
  assertTimeConfig(raw, 'time.json');
} catch (error) {
  if (error instanceof TimeConfigError) {
    console.error(error.message); // every issue, one per line
    console.error(error.issues);  // the same issues as structured data
  }
  throw error;
}
```

Or, composed through `CFG` alongside the game's other sections — `TIME_SECTION` already
carries the key (`'time'`) and the fallback (`DEFAULT_TIME_CONFIG`), matching `CFG`'s
`SectionShape` structurally:

```ts
const [time] = composeConfig([TIME_SECTION], [
  { name: 'time.json', values: { time: await readJson('game/balance/time.json') } },
]);

const clock = createClock<GameEvent>(time);
```

Notes on the check:

- `undefined` (the key not present at all) is valid — it means "the default calendar". An
  explicit `null` is refused.
- Every problem is reported at once, except cascades: a `phases` that is not a list makes
  every question about an individual phase unanswerable, and is reported once, not once per
  phase.
- Unknown keys are refused rather than ignored, so a typo in `dayLengthMs` is caught instead
  of silently falling back to the default.
- The first phase **must** begin at 00:00, phases **must** be strictly ordered by start time,
  and phase names **must** be distinct — every minute of the day has to be covered by exactly
  one phase.

## Links

- [`../services/time.md`](../services/time.md) — full contract, requirements (`TIME-*`) and
  test criteria.
- [`random.md`](./random.md) — the guide `TIME`'s validation surface mirrors
  (`random/config.ts` is the model for `time/config.ts`).
- [`config.md`](./config.md) — `CFG`, and `TIME_SECTION`'s role in it.
- `src/engine/core/time/index.ts` — the actual public surface this guide documents.
- `src/engine/core/time/reusability.spec.ts` — a second, domain-agnostic worked example (a
  bakery's night shift, not a dungeon) exercising the whole surface end to end.
- `src/game/bootstrap.ts`, `src/game/calendar.ts` — this game's own clock construction and
  calendar.

# 02 — The calendar: world time, and the transitions an advance crosses

**What to build:** the clock learns to say what time of day it is. `worldTime()` answers with day,
hour, minute and phase, and an advance that crosses an hour, a day or a phase boundary returns the
corresponding events alongside the timers that came due in the same interval.

Both are **pure functions** — of one instant for `worldTime()`, of the two endpoints for the
transitions — and this is the requirement, not an implementation preference. Nothing about world time
is stored, so there is no "last hour seen" to fall out of step with the calendar it was computed
from, and nothing about it reaches ticket 03's save file.

**One event per boundary crossed**, exactly as timers behave in a batch: an advance spanning five
hours returns five `time/hour-changed`. Coalescing into one event carrying `{from, to}` would make
the world clock the single thing in the system that behaves differently inside a batch, and a quest
counting elapsed days would have to know it.

The events are **merged into the same ordered sequence** the timers come back in — not appended in a
second block. At an equal instant, **world-time events come first**, then timers in registration
order: the world changes, and then what was waiting for that instant happens.

The service exports its three event types on its public surface for `game/` to fold into the union,
with the producing service in the discriminant as BUS-14 requires: **`time/hour-changed`**,
**`time/day-changed`**, **`time/day-phase-changed`**. The last one is *not* called `phase-changed`:
*phase* already means the delivery phase, in the bus and in the glossary.

**The configuration section** arrives with it, declared as the service's own `SectionShape` under the
key `time` — the key, the fallback and the check belong to the service, and the composition mechanism
owns none of them (CFG-13):

```ts
interface TimeConfig {
  readonly dayLengthMs: number;   // game milliseconds in one day
  readonly startsAt: { readonly day: number; readonly hour: number; readonly minute: number };
  readonly phases: readonly { readonly name: string; readonly hour: number; readonly minute: number }[];
}
```

A day is **24 hours of 60 minutes, fixed**: world time is a human-readable projection of
`dayLengthMs`, not a physics. **Phases are data and `DayPhase` is a `string`** — a generic engine
cannot know that this game has dawn, day, dusk and night, and the current phase is simply the last
one whose start is ≤ the current time.

**The fallback is a single phase named `day`** covering the whole day, so a clock nobody configured
has *no cycle* and never emits `time/day-phase-changed`. Four hardcoded phases would be this game's
content sitting in `engine/` as a default value.

Validation reports **every** problem, not the first (RND-24): a person edits this file, and being told
one mistake at a time is what makes a configuration format hated.

**There is no `minute-changed`.** The HUD clock calls `worldTime()` while drawing — a read, lawful for
the presentation — and emitting an event 1 440 times a day so a label can update is a cost every
subscriber pays, in the tick, for ever.

**Blocked by:** 01 — the clock and the queue. The transitions are returned by the same `advance()`
and merged into the same sequence, so there is nothing to merge into until it exists.

**Status:** done

- [x] `worldTime()` is correct at the start of the game, and follows `startsAt`
- [x] Hour, day and minute advance according to `dayLengthMs`, and a short configured day makes them
      move fast
- [x] An advance crossing five hours returns five `time/hour-changed`, in order
- [x] An advance crossing midnight returns `time/day-changed`, and the day number increases by one
- [x] A phase boundary is crossed **exactly once** per crossing, however large the advance
- [x] World-time events and timers due in the same interval come back **merged in time order**
- [x] At the same instant, the world-time event precedes the timer
- [x] With no configuration, the fallback applies: one phase named `day`, and
      `time/day-phase-changed` never fires
- [x] A malformed section is refused with **every** problem listed: `dayLengthMs` not a positive
      integer, `phases` empty, out of order, not starting at 00:00, with duplicate names, `startsAt`
      outside the day
- [x] The three event types are exported on the public surface and carry the `time/` prefix
- [x] There is no `minute-changed` event
- [x] `worldTime()` computes the same answer for the same instant however that instant was reached
- [x] Every test enters through the service's public door
- [x] The unit lane is green: lint, typecheck, boundaries and the headless suite

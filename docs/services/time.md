# TIME — Game time and scheduler

**Area:** Core · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `TIME-*`

## Purpose

To be the domain's **single source of time**. It provides game time (distinct from real time), the
conversion into world time for the day/night cycle, and a **scheduler** for deferred actions:
respawns, status effect expiry, merchant restocking, NPC routines.

Without this service, timers would end up scattered as `setTimeout` calls and private counters,
making pause, saving and reproducibility impossible.

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, `Date.now()`, `setTimeout`, other services |
| Consumed by | orchestration; the `tick` is pumped by the presentation loop |
| Dynamic state | elapsed game time, scale factor, queue of pending timers |
| Static state | day length, time→clock mapping |
| External data | day/night cycle parameters |
| Events emitted | `timer-elapsed`, `hour-changed`, `day-changed`, `phase-changed` |

## Public API (indicative)

```ts
type GameTimeMs = number;              // milliseconds of game time since the game started
type TimerId = string;

interface Clock {
  now(): GameTimeMs;
  /** Advances game time. Returns the events that came due, it does not publish them (ARC-4.2). */
  tick(realDeltaMs: number): readonly DomainEvent[];

  setScale(factor: number): void;      // 0 = paused, 1 = normal, >1 = accelerated
  isPaused(): boolean;

  schedule(afterMs: number, payload: TimerPayload): TimerId;
  scheduleRepeating(everyMs: number, payload: TimerPayload): TimerId;
  cancel(id: TimerId): boolean;

  worldTime(): { day: number; hour: number; minute: number; phase: DayPhase };
}
```

## Requirements

**TIME-1** — No domain code **MUST** read `Date.now()`, `performance.now()` or use
`setTimeout`/`setInterval`: time only enters through `tick()` (ARC-9.3).

**TIME-2** — **Game time MUST** be distinct from real time and scalable, with `scale = 0` meaning
paused. While paused no timer **MUST** come due.

**TIME-3** — `tick()` **MUST** return the events that came due in increasing order of deadline; for
equal deadlines, in registration order. The result **MUST** be independent of step size: 10 ticks of
16 ms and 1 tick of 160 ms **MUST** produce the same sequence.

**TIME-4** — The scheduler **MUST** correctly handle a `delta` that spans **several deadlines**,
including multiple repetitions of a periodic timer.

**TIME-5** — The service **MUST** offer an optional **fixed simulation step** for determinism-
sensitive logic, decoupling it from the rendering frame rate.

**TIME-6** — The scheduler **MUST** cope with thousands of pending timers, with insertion and expiry
in logarithmic time: no linear scan per tick (ARC-13).

**TIME-7** — Timers **MUST** be serializable: `payload` is data, never a callback. On load, pending
timers resume with the correct remaining time (ARC-10.4).

**TIME-8** — The service **MUST** convert game time into **world time** (day, hour, minute, phase)
according to a configurable day length, and emit `hour-changed`, `day-changed`, `phase-changed` at
the transitions.

**TIME-9** — The service **MUST NOT** know what a timer means: `payload` is opaque. The meaning
("respawn of enemy E42", "end of poisoning") belongs to the orchestration.

**TIME-10** — An abnormal `delta` (backgrounded window, breakpoint) **MUST** be limited by a
configurable cap, to prevent thousands of events coming due in a single frame on return.

**TIME-11** — The service **MUST** distinguish **simulated** time from **interface** time: HUD and
menu animations continue even while the game is paused.

## Test criteria

- The same sequence of events with large and small steps, for the same total time.
- A 100 ms periodic timer over a 350 ms delta comes due 3 times, with the correct deadlines.
- Saving and reloading halfway through a timer: the remainder is exact.
- At `scale = 0` time does not advance and no timer comes due.
- Phase transitions happen exactly once per crossing, even with very large deltas.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-9 (determinism), ARC-13 (performance)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-10 (respawn), GP-12 (day/night cycle), GP-13 (routines)
- [`persistence.md`](./persistence.md) — timer serialization

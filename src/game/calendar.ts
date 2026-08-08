import type { TimeConfig } from "../engine/core/time/index";

/**
 * This game's calendar: how long a day lasts, when the game begins, and what
 * the parts of the day are called.
 *
 * It is **content**, which is why it is here and not in `engine/`: a generic
 * clock cannot know that this game has dawn, day, dusk and night, and a default
 * naming them would ship this game's world with every reuse of the engine
 * (ARC-3.2, TIME-11). The engine's own fallback is one phase named `day`, which
 * is the absence of a cycle rather than somebody else's cycle.
 *
 * **A day lasts 24 real minutes**, so an hour of world time passes in a minute
 * and a minute in a second. That is a testbed's number rather than a designer's:
 * it is short enough that the day/night cycle is a thing a person can watch,
 * which is exactly what the `clock` scene exists to show. Whoever balances this
 * game will want a longer one.
 *
 * It will **move into `game/balance/time.json`** and arrive through `CFG`,
 * validated before the context exists (CTX-10), the way `RND`'s filter already
 * arrives in the `bus` scene. Written here until there is a loader to read it
 * from: a constant that can be replaced by a file is a smaller lie than a file
 * nobody loads.
 */
export const GAME_CALENDAR: TimeConfig = {
  dayLengthMs: 1_440_000,
  startsAt: { day: 1, hour: 6, minute: 30 },
  phases: [
    { name: "night", hour: 0, minute: 0 },
    { name: "dawn", hour: 5, minute: 0 },
    { name: "day", hour: 8, minute: 0 },
    { name: "dusk", hour: 20, minute: 0 },
  ],
};

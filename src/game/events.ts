import type { TimeEvent } from "../engine/core/time/index";

/**
 * Everything that can happen in this game, as one union (BUS-1, BUS-14).
 *
 * It is assembled **here**, in `game/`, out of the types each service exports on
 * its own surface. No service can name it — they are each parametric on the
 * union and live under `engine/`, where rule 4 of the boundary check fails the
 * build on `engine/ → game/` — so this file is the only place that knows what
 * this particular game is made of.
 *
 * Every member carries the producing service in its discriminant, which is what
 * lets a subscriber read `'time/hour-changed'` and know where it came from
 * without a registry to look it up in.
 *
 * It grows by union: a service arrives, exports its types, and this file adds
 * them. Today it is what `TIME` produces — the first events the union received
 * from a service — and one fact of the testbed's own.
 */
export type GameEvent = TimeEvent | BellRung;

/**
 * A bell rang, because somebody asked for it to ring at a given moment.
 *
 * The **testbed's** fact, and the prefix says so (BUS-14): the `clock` scene
 * schedules it to show a timer coming due, repeating and being cancelled where
 * a person can watch it happen.
 *
 * It is declared here, in `game/`, because a timer's payload is a member of
 * *this game's* union (TIME-6) and there is nowhere else for a member of that
 * union to live: `engine/` may not name one and `game/` may not import
 * `presentation/`. It is the first thing to delete when a real service brings
 * facts of its own — and until then it is what keeps `schedule()` exercised by
 * something a person can see, rather than only by tests.
 *
 * Deliberately **not** called `timer-elapsed`. That name was retired from the
 * whole design (TIME-6): a timer's payload is the fact itself, never a wrapper
 * announcing that a timer fired, and a type by that name would invite the
 * second dispatcher the bus exists to prevent.
 */
export type BellRung = {
  readonly type: "testbed/bell-rung";

  /** Which bell — the one-shot or the repeater — so the trace can tell them apart. */
  readonly bell: string;
};

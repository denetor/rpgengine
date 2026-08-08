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
 * Today the union is what `TIME` produces and nothing else, because `TIME` is
 * the first service with events to contribute. It grows by union: a service
 * arrives, exports its types, and this file adds them.
 */
export type GameEvent = TimeEvent;

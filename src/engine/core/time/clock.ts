/**
 * The clock and its queue: time that moves only when somebody moves it, and a
 * batch of deadlines that the movement crossed.
 *
 * The service holds the elapsed game time, the pending timers and the id
 * counter, and nothing else. It reads no clock of its own: time enters through
 * `advance()` and nowhere else (TIME-1), which is what makes the same seed and
 * the same sequence of advances the same game (ARC-9.1).
 */

import { resolveCalendar, transitionsBetween, worldTimeAt } from './calendar';
import { assertTimeConfig } from './config';
import { push, pop, peek } from './queue';
import { assertTimeState, TIME_STATE_VERSION } from './state';
import type {
    Clock,
    DomainEvent,
    GameTimeMs,
    TimeConfig,
    TimeEvent,
    TimerId,
    TimerState,
    TimeState,
} from './types';

/**
 * A pending timer is exactly what a saved one is — the same type and not two
 * that happen to agree (TIME-13).
 *
 * `serialize()` writes the live entries out as they stand, so a second shape
 * would be a copy to keep in step with this one, held together by nothing but a
 * comment. Sharing it makes the save format what it actually is: the pending
 * timers, with their **absolute** deadlines, because a remainder would have to
 * be recomputed against the clock on every save and a subtraction cannot drift.
 */
type Timer<E extends DomainEvent> = TimerState<E>;

/**
 * A clock for the event union `E`, starting at zero with nothing pending.
 *
 * Its **one** construction argument is its configuration slice, the calendar
 * (TIME-11), and it is optional: with none, the clock runs on
 * `DEFAULT_TIME_CONFIG` — a day of 24 real hours with a single phase — so a
 * test or a reused engine can build one without inventing a calendar. There is
 * no other argument, no scale and no modes: the clock does not know what real
 * time is, and *how much* a frame or a combat turn is worth is the caller's
 * business (TIME-2). Two clocks in one process share nothing, which is the
 * clock's half of ARC-8.3.
 *
 * The configuration is expected to have been validated before it got here
 * (CTX-10) — `assertTimeConfig` is the door for a caller that has a file name
 * to blame.
 */
export function createClock<E extends DomainEvent>(config?: TimeConfig): Clock<E> {
    return clockFrom(config, { startAt: 0, firstId: 1, timers: [] });
}

/**
 * A clock resumed from a saved state and **that same calendar again**, because
 * the calendar is configuration and is not in the save (TIME-13, CFG-15).
 *
 * A **factory**, deliberately, and not a method that reloads a live clock, as
 * `Random.deserialize` is a static for the same reason: a clock that could be
 * reloaded would briefly hold one game's elapsed time and another's queue,
 * and every `TimerId` handed out before it would point at a stranger's timer
 * (CTX-9). Spelled as a function rather than as a static because this service's
 * door in is `createClock`, and a service with one factory and one static would
 * be answering the same question twice.
 *
 * The state is refused at the **first** broken invariant, before anything is
 * built from it. What comes back continues the game the save was taken from:
 * the same pending timers with the exact remainder, the same ids, and — because
 * `nextId` travels with them — the same tie-break between a timer scheduled
 * before the save and one scheduled after the load.
 */
export function restoreClock<E extends DomainEvent>(
    state: TimeState<E>,
    config?: TimeConfig,
): Clock<E> {
    assertTimeState(state);

    return clockFrom(config, {
        startAt: state.elapsedMs,
        firstId: state.nextId,
        timers: state.timers.map((timer) => ({ ...timer })),
    });
}

/** Where a clock begins: an instant, an id counter and a set of pending timers. */
interface StartingPoint<E extends DomainEvent> {
    readonly startAt: GameTimeMs;
    readonly firstId: number;
    readonly timers: readonly Timer<E>[];
}

/**
 * The clock both doors open onto: a calendar, and where to begin.
 *
 * One body rather than two, because the alternative is a restored clock that
 * behaves *almost* like a new one — and the whole of TIME-13 is the claim that
 * it behaves identically. The starting point arrives as one named argument so
 * that a new clock reads as `{ startAt: 0, firstId: 1, timers: [] }` rather
 * than as three bare numbers whose order a reader has to remember.
 */
function clockFrom<E extends DomainEvent>(
    config: TimeConfig | undefined,
    from: StartingPoint<E>,
): Clock<E> {
    // Before anything is built from it: a clock that came into existence on a
    // calendar it cannot use would produce a game that is subtly wrong rather
    // than a load that failed, and nobody would connect the two (CTX-10).
    assertTimeConfig(config);

    /**
     * The calendar, with the arithmetic that never changes worked out once.
     *
     * Held rather than recomputed, and that is not a cache of world time: it is
     * the *configuration*, which cannot change while the clock lives. Nothing
     * derived from an instant is kept anywhere (TIME-10).
     */
    const calendar = resolveCalendar(config);

    /** Game milliseconds since this clock began. Only `advance()` moves it. */
    let elapsedMs: GameTimeMs = from.startAt;

    /**
     * The pending timers, as a queue ordered by `(deadline, id)`.
     *
     * The ordering is the one TIME-4 promises, so nothing else has to arrange
     * it: the id *is* the registration order (TIME-8), and popping the queue
     * therefore yields the batch already in the order it must be returned in.
     */
    const pending: Timer<E>[] = [];

    /**
     * The timers that are still live, by id — the queue's entries seen from the
     * other side, and the answer to *is this one pending?*
     *
     * It holds the **entry itself**, not merely the id, which is what makes
     * cancellation lazy without making it leaky (TIME-12): an entry that
     * surfaces from the queue is discarded unless this map still points at that
     * very object, so a cancelled timer and the earlier deadline of a repeater
     * are both stale by the same test, and neither can come due. Nothing is
     * removed from the queue by `cancel`, and nothing has to be searched for.
     */
    const live = new Map<TimerId, Timer<E>>();

    /**
     * The next id to hand out. Monotonic, and never rewound: an id identifies a
     * timer for as long as the clock lives (TIME-8).
     */
    let nextId = from.firstId;

    function takeId(): TimerId {
        const id = nextId as TimerId;
        nextId += 1;
        return id;
    }

    /** Arms a timer: into the queue to come due, into the map to be cancellable. */
    function arm(timer: Timer<E>): void {
        live.set(timer.id, timer);
        push(pending, timer);
    }

    // Whatever the save was holding. The list arrives ordered by `(at, id)`,
    // which is the key the queue comes due on, so the heap's own layout never
    // has to be reproduced — and a resumed game comes due in exactly the
    // sequence an uninterrupted one would (TIME-13).
    for (const timer of from.timers) {
        arm(timer);
    }

    return {
        now() {
            return elapsedMs;
        },

        worldTime() {
            return worldTimeAt(calendar, elapsedMs);
        },

        advance(gameDeltaMs) {
            assertWholeMilliseconds('advance()', 'gameDeltaMs', gameDeltaMs);

            if (gameDeltaMs < 0) {
                throw new Error(
                    `advance() cannot go backwards and was given ${gameDeltaMs}. Game time ` +
                        'only ever moves forward: what a rewind should mean for a timer that ' +
                        'has already come due and been returned is a question with no answer ' +
                        'here. A game that must go back goes back through a saved state.',
                );
            }

            const until = elapsedMs + gameDeltaMs;
            const due: (E | TimeEvent)[] = [];

            // The world's own boundaries over the same interval, computed once
            // and before anything is delivered: they are a pure function of the
            // two endpoints (TIME-10), so they do not depend on — and cannot be
            // disturbed by — what the timers below turn out to be.
            const crossed = transitionsBetween(calendar, elapsedMs, until);
            let nextTransition = 0;

            /** Everything the world did up to and including `instant`. */
            function worldUpTo(instant: GameTimeMs): void {
                while (nextTransition < crossed.length && crossed[nextTransition].at <= instant) {
                    due.push(crossed[nextTransition].event);
                    nextTransition += 1;
                }
            }

            // Everything whose deadline the interval reached, taken in
            // `(deadline, id)` order because that is the order the queue is in.
            // The batch is complete before it is returned, and before any
            // consumer runs (TIME-5).
            while (pending.length > 0 && peek(pending).at <= until) {
                const timer = pop(pending);

                if (live.get(timer.id) !== timer) {
                    // A cancelled timer, or a repeater's spent deadline left
                    // behind by a later one. It is discarded here, on the way
                    // past, and cost nothing while it waited.
                    continue;
                }

                // At an equal instant the world changes first, and then what
                // was waiting for that instant happens: a timer registered
                // *for* 07:00 is a consequence of 07:00 having arrived, so it
                // cannot precede it. Registration order breaks ties between
                // timers (TIME-4) and says nothing about a boundary, which
                // nobody registered.
                worldUpTo(timer.at);

                due.push(timer.event);
                live.delete(timer.id);

                if (timer.every !== undefined) {
                    // Anchored to the deadline it just came due at, never to
                    // the instant the advance is heading for (TIME-5): a
                    // repeater re-armed at `until` would come due the right
                    // number of times and lose its phase, which is a bug no
                    // small-step test can see.
                    //
                    // It keeps its id, so it also keeps its place among the
                    // timers registered at the same instant: repeating is not
                    // re-registering.
                    arm({ ...timer, at: timer.at + timer.every });
                }
            }

            // Whatever the world did after the last timer — or all of it, when
            // no timer came due at all.
            worldUpTo(until);

            elapsedMs = until;

            return due;
        },

        schedule(afterMs, event) {
            assertWholeMilliseconds('schedule()', 'afterMs', afterMs);

            if (afterMs < 0) {
                throw new Error(
                    `schedule() was given a deadline in the past: afterMs is ${afterMs}. A ` +
                        'timer comes due on the advance that crosses its deadline, and every ' +
                        'advance that could have crossed this one has already happened. Zero ' +
                        'is allowed and means due now.',
                );
            }

            const id = takeId();
            arm({ id, at: elapsedMs + afterMs, event });

            return id;
        },

        scheduleRepeating(everyMs, event) {
            assertWholeMilliseconds('scheduleRepeating()', 'everyMs', everyMs);

            if (everyMs <= 0) {
                throw new Error(
                    `scheduleRepeating() takes a positive period and was given ${everyMs}. A ` +
                        'period of zero re-arms the timer at the deadline it has just come due ' +
                        'at, so the advance that met it would never end; a negative one would ' +
                        'arm it in the past, which is the same loop reached from further away.',
                );
            }

            const id = takeId();
            arm({ id, at: elapsedMs + everyMs, every: everyMs, event });

            return id;
        },

        serialize() {
            // Straight off the live map, which holds exactly the timers that
            // are still pending: a cancelled one was deleted from it, and a
            // repeater's spent deadline was replaced in it. So a save carries
            // no tombstone (TIME-9) without anything having to be swept, and
            // the lazy cancellation of TIME-12 stays invisible.
            const timers = [...live.values()];

            // Ordered by the key the queue comes due on, which is what lets a
            // restore rebuild from this list without reproducing the heap.
            timers.sort((one, other) => {
                if (one.at !== other.at) {
                    return one.at - other.at;
                }

                return one.id - other.id;
            });

            return {
                version: TIME_STATE_VERSION,
                elapsedMs,
                nextId,
                timers: timers.map((timer) => ({ ...timer })),
            };
        },

        cancel(id) {
            // The whole of it: forgotten here, and discarded by the advance
            // that meets it. An id the clock never handed out, one already
            // cancelled and one that has already come due are the same answer,
            // because in all three the caller is holding a handle on nothing.
            return live.delete(id);
        },
    };
}

/**
 * The refusal every door shares (TIME-3): whole milliseconds, or nothing.
 *
 * A fractional value would put a deadline half a millisecond away from the
 * instant it is compared against, and the equality this service is built on —
 * *due at exactly 6000* — would start depending on how the fractions happened
 * to add up. `Number.isInteger` also refuses `NaN` and the infinities, which is
 * the right answer for the same reason and by the same sentence: a deadline
 * they produced could never be reached.
 *
 * The message names the door and the argument, because a caller reading it is
 * holding a number that came from somewhere else — a frame, a configuration
 * file, a division — and needs to know which of the three it is.
 */
function assertWholeMilliseconds(door: string, argument: string, value: number): void {
    if (!Number.isInteger(value)) {
        throw new Error(
            `${door} takes whole milliseconds and ${argument} is ${value}. The clock is ` +
                'integer arithmetic end to end, so that a deadline is compared for equality ' +
                'rather than for nearness; the fraction of a fractional frame is carried by ' +
                'the driver, which is where real time is.',
        );
    }
}

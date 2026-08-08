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
import type { Clock, DomainEvent, GameTimeMs, TimeConfig, TimeEvent, TimerId } from './types';

/**
 * One registered timer.
 *
 * `at` is **absolute**, never a remainder: the remainder is a subtraction, and
 * a subtraction cannot drift. The shape is deliberately the one ticket 03 will
 * write into a save.
 */
export interface Timer<E extends DomainEvent> {
    readonly id: TimerId;
    readonly at: GameTimeMs;

    /** The period of a repeating timer; absent on a one-shot. */
    readonly every?: number;

    readonly event: E;
}

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
    let elapsedMs: GameTimeMs = 0;

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
    let nextId = 1;

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

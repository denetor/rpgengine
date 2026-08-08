/**
 * `TIME`'s own portion of the save (TIME-13, ARC-10.2), and the check that
 * refuses a corrupt one before anything is built from it.
 *
 * The state is **plain data**: numbers, and the caller's own events — which are
 * plain data by construction, because a timer's payload is a domain event
 * (TIME-6). It carries a version of its own, so the format can be migrated
 * without touching the other services' portions.
 *
 * A save is not the same kind of data as a configuration, and the two checks in
 * this service are deliberately not one. This one reads bytes written by the
 * game itself: nobody edited them, there is no file for anyone to fix, and
 * there is no reason to collect every problem before giving up — the **first**
 * invariant broken means the save is corrupt. `config.ts` validates what a
 * person edits, and answers accordingly (RND-24). The two files disagreeing on
 * that point is the point.
 */

import type { DomainEvent, TimerId, TimeState, TimerState } from './types';

/**
 * The version of this format. Bumped whenever the shape below changes.
 *
 * Exported on the public surface because `SAVE` reads it to decide whether it
 * can migrate a state it has found. No migration path is written here beyond
 * refusing a version this build cannot read: a migration needs two formats, and
 * so far there is one.
 */
export const TIME_STATE_VERSION = 1;

/**
 * Refuses a state that cannot be read, at the **first** broken invariant, so
 * that a clock is never built from one (CTX-10).
 *
 * The invariants are this format's own, and each is one that would otherwise
 * turn into a silently wrong game rather than a failed load: a deadline in the
 * past would come due on the first advance whatever it was written for, a
 * duplicate id would let one `cancel` reach two timers, an id at or above
 * `nextId` would be handed out again, and a list out of order would come due in
 * an order the save does not describe.
 *
 * What is *not* checked is the payload: the service has promised not to
 * understand it (TIME-7), so it goes no further than the one thing every domain
 * event has — a `string` discriminant. Whether it is a member of *this* game's
 * union is a question only the game can answer, and `SAVE` is where it will be
 * asked.
 */
export function assertTimeState<E extends DomainEvent>(state: TimeState<E>): void {
    if (state === null || typeof state !== 'object') {
        throw new Error('time state: expected an object');
    }

    if (state.version !== TIME_STATE_VERSION) {
        throw new Error(
            `time state: version ${String(state.version)} cannot be read by version ` +
                `${TIME_STATE_VERSION}`,
        );
    }

    if (!isWholeCount(state.elapsedMs)) {
        throw new Error(
            `time state: elapsed time '${String(state.elapsedMs)}' is not a whole number of ` +
                'milliseconds since the game began',
        );
    }

    if (!isWholeCount(state.nextId)) {
        throw new Error(
            `time state: next id '${String(state.nextId)}' is not a whole number of ids ` +
                'handed out',
        );
    }

    if (!Array.isArray(state.timers)) {
        throw new Error('time state: expected a list of timers');
    }

    const seen = new Set<TimerId>();
    let previous: TimerState<E> | undefined;

    for (const timer of state.timers) {
        assertTimerState(timer, state);

        if (seen.has(timer.id)) {
            throw new Error(`time state: timer ${timer.id} appears twice`);
        }
        seen.add(timer.id);

        if (previous !== undefined && !comesAfter(timer, previous)) {
            throw new Error(
                `time state: timer ${timer.id} at ${timer.at} is written after timer ` +
                    `${previous.id} at ${previous.at}, but comes due before it. The list is ` +
                    'ordered by deadline, and at an equal deadline by id.',
            );
        }

        previous = timer;
    }
}

/** Checks one saved timer against the state it was written in. */
function assertTimerState<E extends DomainEvent>(
    timer: TimerState<E>,
    state: TimeState<E>,
): void {
    if (timer === null || typeof timer !== 'object') {
        throw new Error('time state: expected a timer');
    }

    if (!isWholeCount(timer.id)) {
        throw new Error(`time state: '${String(timer.id)}' is not a timer id`);
    }

    if (timer.id >= state.nextId) {
        throw new Error(
            `time state: timer ${timer.id} carries an id the clock had not handed out ` +
                `(the next is ${state.nextId}), so the clock would hand it out again`,
        );
    }

    if (!isWholeCount(timer.at)) {
        throw new Error(
            `time state: timer ${timer.id} comes due at '${String(timer.at)}', which is not ` +
                'an instant of game time',
        );
    }

    if (timer.at < state.elapsedMs) {
        throw new Error(
            `time state: timer ${timer.id} comes due at ${timer.at}, which the clock passed ` +
                `at ${state.elapsedMs}: a pending timer cannot have a deadline in the past`,
        );
    }

    if (timer.every !== undefined && (!Number.isInteger(timer.every) || timer.every <= 0)) {
        throw new Error(
            `time state: timer ${timer.id} repeats every '${String(timer.every)}', which is ` +
                'not a positive whole number of milliseconds',
        );
    }

    if (
        timer.event === null ||
        typeof timer.event !== 'object' ||
        typeof timer.event.type !== 'string'
    ) {
        throw new Error(
            `time state: timer ${timer.id} carries something that is not a domain event: an ` +
                'event is an object with a string `type`',
        );
    }
}

/** Whether `timer` comes due after `previous`, by the key the list is ordered on. */
function comesAfter<E extends DomainEvent>(timer: TimerState<E>, previous: TimerState<E>): boolean {
    if (timer.at !== previous.at) {
        return timer.at > previous.at;
    }

    return timer.id > previous.id;
}

/** A whole number of something countable: not negative, not fractional, not NaN. */
function isWholeCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

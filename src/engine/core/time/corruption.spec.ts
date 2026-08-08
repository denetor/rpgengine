import { describe, expect, it } from 'vitest';
import { restoreClock, TIME_STATE_VERSION } from './index';
import type { TimerId, TimerState, TimeState } from './index';

/**
 * What a corrupt save looks like on the way in (TIME-13).
 *
 * Refused at the **first** broken invariant, before anything is built from it —
 * which is the opposite of what `config.spec.ts` asserts about the calendar, on
 * purpose. A configuration is edited by a person, so being told one mistake per
 * run is what makes a format hated; a save is written by the game itself, so
 * nobody edited it, there is no file for anyone to fix, and the first invariant
 * broken already means it cannot be read.
 *
 * Each test names the invariant in the message it expects, because that is the
 * whole value of the refusal: whoever reads it is holding a file they did not
 * write and cannot open.
 */

type Woke = { readonly type: 'demo/woke'; readonly who: string };

function woke(who: string): Woke {
    return { type: 'demo/woke', who };
}

/**
 * One timer as a save file holds it.
 *
 * The cast is the only one in this file and it is the point: a `TimerId` is
 * handed out by a clock and cannot be written down by a caller (TIME-8), so a
 * test forging a save has to say out loud that it is forging one.
 */
function savedTimer(id: number, at: number, event: Woke, every?: number): TimerState<Woke> {
    return { id: id as TimerId, at, every, event };
}

/** A state that is in every way readable, for one field at a time to be broken. */
function sound(): TimeState<Woke> {
    return {
        version: TIME_STATE_VERSION,
        elapsedMs: 1_000,
        nextId: 4,
        timers: [
            savedTimer(1, 1_100, woke('first')),
            savedTimer(3, 1_100, woke('second')),
            savedTimer(2, 2_000, woke('repeating'), 500),
        ],
    };
}

/** Breaks one thing about an otherwise sound state. */
function broken(change: Partial<TimeState<Woke>>): TimeState<Woke> {
    return { ...sound(), ...change };
}

describe('a sound state', () => {
    it('is restored without complaint', () => {
        expect(() => restoreClock(sound())).not.toThrow();
    });
});

describe('a state this build cannot read', () => {
    it('is refused, naming the version it carries and the one this build knows', () => {
        const message = /version 99 cannot be read by version 1/;

        expect(() => restoreClock(broken({ version: 99 }))).toThrow(message);
    });

    it('is refused when it carries no version at all', () => {
        expect(() => restoreClock(broken({ version: undefined as unknown as number }))).toThrow(
            /version/,
        );
    });

    it('is not an object at all', () => {
        expect(() => restoreClock(null as unknown as TimeState<Woke>)).toThrow(/expected an object/);
    });
});

describe('a state whose clock reading is not one', () => {
    it('refuses a negative elapsed time', () => {
        expect(() => restoreClock(broken({ elapsedMs: -1 }))).toThrow(/elapsed time/);
    });

    it('refuses a fractional elapsed time', () => {
        expect(() => restoreClock(broken({ elapsedMs: 1.5 }))).toThrow(/elapsed time/);
    });

    it('refuses a next id that is not a count', () => {
        expect(() => restoreClock(broken({ nextId: -1 }))).toThrow(/next id/);
        expect(() => restoreClock(broken({ nextId: 1.5 }))).toThrow(/next id/);
    });

    it('refuses timers that are not a list', () => {
        const notAList = { timers: {} as unknown as TimeState<Woke>['timers'] };

        expect(() => restoreClock(broken(notAList))).toThrow(/list of timers/);
    });
});

describe('a state whose timers cannot be trusted', () => {
    it('refuses a deadline the clock has already passed', () => {
        const past = { timers: [savedTimer(1, 999, woke('overdue'))] };

        // It would come due on the first advance whatever it was written for,
        // and nothing would say the save had been wrong.
        expect(() => restoreClock(broken(past))).toThrow(/cannot have a deadline in the past/);
    });

    it('refuses a deadline that is not an instant', () => {
        const fractional = { timers: [savedTimer(1, 1_100.5, woke('between'))] };

        expect(() => restoreClock(broken(fractional))).toThrow(/not an instant of game time/);
    });

    it('refuses a period that would never end', () => {
        const zero = { timers: [savedTimer(1, 1_100, woke('forever'), 0)] };
        const negative = { timers: [savedTimer(1, 1_100, woke('backwards'), -5)] };

        expect(() => restoreClock(broken(zero))).toThrow(/positive whole number/);
        expect(() => restoreClock(broken(negative))).toThrow(/positive whole number/);
    });

    it('refuses the same id twice', () => {
        const twice = {
            timers: [savedTimer(1, 1_100, woke('one')), savedTimer(1, 1_200, woke('the other'))],
        };

        // One `cancel` would otherwise reach two timers, and whoever kept the
        // id would have no way of saying which.
        expect(() => restoreClock(broken(twice))).toThrow(/appears twice/);
    });

    it('refuses an id the clock had not handed out', () => {
        const fromTheFuture = { timers: [savedTimer(9, 1_100, woke('impossible'))] };

        // `nextId` is 4, so an id of 9 is one the counter would hand out again
        // later — and the second holder would cancel the first one's timer.
        expect(() => restoreClock(broken(fromTheFuture))).toThrow(/had not handed out/);
    });

    it('refuses a list written out of order', () => {
        const shuffled = {
            timers: [savedTimer(1, 2_000, woke('later')), savedTimer(2, 1_100, woke('sooner'))],
        };

        // The list *is* the order the queue comes due in, which is what lets a
        // restore skip reproducing the heap.
        expect(() => restoreClock(broken(shuffled))).toThrow(/comes due before it/);
    });

    it('refuses a list where an equal deadline is out of id order', () => {
        const shuffled = {
            timers: [
                savedTimer(3, 1_100, woke('registered later')),
                savedTimer(1, 1_100, woke('registered first')),
            ],
        };

        expect(() => restoreClock(broken(shuffled))).toThrow(/comes due before it/);
    });

    it('refuses a payload that is not a domain event', () => {
        const notAnEvent = { timers: [savedTimer(1, 1_100, 'poisoned' as unknown as Woke)] };
        const noType = { timers: [savedTimer(1, 1_100, {} as unknown as Woke)] };

        // As far as the service goes, and no further: it has promised not to
        // understand the payload (TIME-7), so it checks the one thing every
        // domain event has and leaves the union to whoever owns it.
        expect(() => restoreClock(broken(notAnEvent))).toThrow(/not a domain event/);
        expect(() => restoreClock(broken(noType))).toThrow(/not a domain event/);
    });
});

describe('the refusal', () => {
    it('stops at the first broken invariant', () => {
        const everythingWrong = {
            version: 99,
            elapsedMs: -1,
            nextId: -1,
            timers: [savedTimer(9, -5, {} as unknown as Woke)],
        };

        // One message and not four: there is no file to fix, so a list of
        // everything wrong with a corrupt save is a list nobody can act on.
        expect(() => restoreClock(everythingWrong)).toThrow(/version 99/);
        expect(() => restoreClock(everythingWrong)).not.toThrow(/elapsed time/);
    });

    it('leaves nothing built behind it', () => {
        // The state is refused *before* a clock exists, so there is no
        // half-restored clock holding one game's elapsed time and another's
        // queue for anybody to get hold of (CTX-9).
        expect(() => restoreClock(broken({ elapsedMs: -1 }))).toThrow();
    });
});

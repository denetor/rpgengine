import { describe, expect, it } from 'vitest';
import { createClock } from './index';

/**
 * What the clock refuses, and what it says when it does (TIME-3).
 *
 * The clock is integer arithmetic end to end: deadlines are compared for
 * equality and ordered, and an accumulated fraction would make "due at exactly
 * 6000" stop meaning what it says. The fraction of a fractional frame belongs to
 * the driver, which is where real time is.
 *
 * Each message is asserted to **name which argument was wrong** and nothing
 * further. Matching more of the wording would make every improvement to it a
 * failing test; matching nothing at all would let the three refusals converge on
 * one unhelpful sentence, which is exactly what somebody holding a number that
 * came from somewhere else cannot afford.
 */

type Ticked = { readonly type: 'demo/ticked'; readonly of: string };

const POISON: Ticked = { type: 'demo/ticked', of: 'poison' };

describe('an advance', () => {
    it('refuses a fractional delta', () => {
        const clock = createClock<Ticked>();

        expect(() => clock.advance(16.7)).toThrow(/16\.7/);
        expect(() => clock.advance(16.7)).toThrow(/whole millisecond/);
    });

    it('refuses a negative delta', () => {
        const clock = createClock<Ticked>();

        expect(() => clock.advance(-1)).toThrow(/backwards/);
    });

    it('refuses a delta that is not a number at all', () => {
        const clock = createClock<Ticked>();

        expect(() => clock.advance(Number.NaN)).toThrow(/whole millisecond/);
        expect(() => clock.advance(Number.POSITIVE_INFINITY)).toThrow(/whole millisecond/);
    });

    it('leaves the clock where it was when it refuses', () => {
        const clock = createClock<Ticked>();
        clock.advance(100);

        expect(() => clock.advance(0.5)).toThrow();
        expect(clock.now()).toBe(100);
    });
});

describe('a schedule', () => {
    it('refuses a fractional delay', () => {
        const clock = createClock<Ticked>();

        expect(() => clock.schedule(0.5, POISON)).toThrow(/whole millisecond/);
    });

    it('refuses a deadline in the past', () => {
        const clock = createClock<Ticked>();

        expect(() => clock.schedule(-1, POISON)).toThrow(/past/);
    });

    it('accepts a delay of zero, which is due now', () => {
        const clock = createClock<Ticked>();
        clock.schedule(0, POISON);

        // Not a refusal, and worth pinning: a timer is due when its deadline is
        // *reached*, and this one's deadline is the instant it was registered
        // at. It comes due on the next advance, however small — including an
        // advance of zero, which reaches it without moving.
        expect(clock.advance(0)).toEqual([POISON]);
    });
});

describe('a repeating schedule', () => {
    it('refuses a period of zero', () => {
        const clock = createClock<Ticked>();

        // The one refusal that is not about arithmetic: a period of zero
        // re-arms the timer at the deadline it has just come due at, and the
        // advance that met it never ends.
        expect(() => clock.scheduleRepeating(0, POISON)).toThrow(/positive/);
    });

    it('refuses a negative period', () => {
        const clock = createClock<Ticked>();

        expect(() => clock.scheduleRepeating(-100, POISON)).toThrow(/positive/);
    });

    it('refuses a fractional period', () => {
        const clock = createClock<Ticked>();

        expect(() => clock.scheduleRepeating(16.7, POISON)).toThrow(/whole millisecond/);
    });

    it('registers nothing when it refuses', () => {
        const clock = createClock<Ticked>();

        expect(() => clock.scheduleRepeating(0, POISON)).toThrow();
        expect(clock.advance(10_000)).toEqual([]);
    });
});

import { describe, expect, it } from 'vitest';
import { createClock } from './index';
import type { TimeConfig } from './index';

/**
 * World time: the human-readable projection of game time onto a configured
 * calendar (TIME-10).
 *
 * It is a **pure function of one instant** and the configuration, and that is
 * the requirement rather than an implementation preference: nothing about world
 * time is remembered, so there is no "last hour seen" to fall out of step with
 * the calendar it was computed from, and nothing about it reaches a save.
 *
 * The last test of the file is the one that says so — the same instant reached
 * three different ways answers the same thing.
 */

type Woke = { readonly type: 'demo/woke'; readonly who: string };

/**
 * A day of 1 440 000 ms: a minute is a second, an hour is a minute. Chosen so
 * that every instant below is legible as arithmetic, and so that a short day
 * really does make the world clock move fast.
 */
const FAST_DAY: TimeConfig = {
    dayLengthMs: 1_440_000,
    startsAt: { day: 1, hour: 6, minute: 30 },
    phases: [
        { name: 'night', hour: 0, minute: 0 },
        { name: 'dawn', hour: 5, minute: 0 },
        { name: 'day', hour: 8, minute: 0 },
        { name: 'dusk', hour: 20, minute: 0 },
    ],
};

const MINUTE = 1_000;
const HOUR = 60_000;

describe('world time at the start of the game', () => {
    it('is the instant the configuration says the game starts at', () => {
        const clock = createClock<Woke>(FAST_DAY);

        expect(clock.worldTime()).toEqual({ day: 1, hour: 6, minute: 30, phase: 'dawn' });
    });

    it('is midnight of day zero when nobody configured a calendar', () => {
        const clock = createClock<Woke>();

        expect(clock.worldTime()).toEqual({ day: 0, hour: 0, minute: 0, phase: 'day' });
    });
});

describe('world time as the clock advances', () => {
    it('counts minutes', () => {
        const clock = createClock<Woke>(FAST_DAY);
        clock.advance(29 * MINUTE);

        expect(clock.worldTime()).toEqual({ day: 1, hour: 6, minute: 59, phase: 'dawn' });
    });

    it('counts hours', () => {
        const clock = createClock<Woke>(FAST_DAY);
        clock.advance(HOUR + 30 * MINUTE);

        expect(clock.worldTime()).toEqual({ day: 1, hour: 8, minute: 0, phase: 'day' });
    });

    it('counts days', () => {
        const clock = createClock<Woke>(FAST_DAY);

        // 17h30 from 06:30 is the next midnight, exactly.
        clock.advance(17 * HOUR + 30 * MINUTE);

        expect(clock.worldTime()).toEqual({ day: 2, hour: 0, minute: 0, phase: 'night' });
    });

    it('moves as fast as the configured day is short', () => {
        const fast = createClock<Woke>(FAST_DAY);
        const real = createClock<Woke>();

        // The same game milliseconds, two calendars: one day of 1 440 000 ms
        // against the unconfigured day of 86 400 000. World time is a
        // projection of `dayLengthMs` and of nothing else.
        fast.advance(HOUR);
        real.advance(HOUR);

        expect(fast.worldTime().hour).toBe(7);
        expect(real.worldTime()).toEqual({ day: 0, hour: 0, minute: 1, phase: 'day' });
    });

    it('does not move when the clock does not', () => {
        const clock = createClock<Woke>(FAST_DAY);
        const before = clock.worldTime();

        clock.advance(0);

        expect(clock.worldTime()).toEqual(before);
    });
});

describe('the phase of the day', () => {
    it('is the last one whose start is at or before the current time', () => {
        const clock = createClock<Woke>(FAST_DAY);

        // 06:30 is dawn, which began at 05:00; the next phase begins at 08:00.
        expect(clock.worldTime().phase).toBe('dawn');

        clock.advance(HOUR + 30 * MINUTE);
        expect(clock.worldTime().phase).toBe('day');

        clock.advance(12 * HOUR);
        expect(clock.worldTime().phase).toBe('dusk');
    });

    it('changes at the very instant the phase begins, not a millisecond later', () => {
        const clock = createClock<Woke>(FAST_DAY);
        clock.advance(HOUR + 30 * MINUTE - 1);

        expect(clock.worldTime().phase).toBe('dawn');

        clock.advance(1);
        expect(clock.worldTime().phase).toBe('day');
    });

    it('is the single fallback phase when nobody configured any', () => {
        const clock = createClock<Woke>();

        clock.advance(13 * 60 * 60 * 1000);

        expect(clock.worldTime().phase).toBe('day');
    });
});

describe('world time', () => {
    it('is the same answer for the same instant however that instant was reached', () => {
        const inOneGo = createClock<Woke>(FAST_DAY);
        const stepped = createClock<Woke>(FAST_DAY);
        const unevenly = createClock<Woke>(FAST_DAY);

        inOneGo.advance(100_000);

        for (let step = 0; step < 100; step += 1) {
            stepped.advance(1_000);
        }

        unevenly.advance(1);
        unevenly.advance(99_998);
        unevenly.advance(1);

        // The point of the requirement: world time is computed from the instant
        // and the calendar, so it cannot depend on the path taken to get there.
        // An implementation remembering the last hour it announced would agree
        // here only by luck.
        expect(stepped.worldTime()).toEqual(inOneGo.worldTime());
        expect(unevenly.worldTime()).toEqual(inOneGo.worldTime());
    });
});

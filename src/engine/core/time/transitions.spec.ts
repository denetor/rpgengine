import { describe, expect, it } from 'vitest';
import { createClock } from './index';
import type { TimeConfig, TimeEvent } from './index';

/**
 * The boundaries an advance crosses, returned in the same batch as the timers
 * that came due in the same interval (TIME-10).
 *
 * **One event per boundary crossed**, exactly as timers behave: an advance
 * spanning five hours returns five `time/hour-changed`. Coalescing them into one
 * event carrying `{ from, to }` would make the world clock the single thing in
 * the system that behaves differently inside a batch, and a quest counting
 * elapsed days would have to know it.
 *
 * They are **merged into the same ordered sequence**, not appended in a second
 * block. At an equal instant the world-time events come first, coarsest first,
 * and then the timers in registration order: the world changes, and then what
 * was waiting for that instant happens.
 */

type Woke = { readonly type: 'demo/woke'; readonly who: string };

/** A day of 1 440 000 ms: a minute is a second, an hour is a minute. */
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
const DAY = 1_440_000;

function woke(who: string): Woke {
    return { type: 'demo/woke', who };
}

function hourChanged(day: number, hour: number): TimeEvent {
    return { type: 'time/hour-changed', day, hour };
}

function dayChanged(day: number): TimeEvent {
    return { type: 'time/day-changed', day };
}

function phaseChanged(day: number, phase: string): TimeEvent {
    return { type: 'time/day-phase-changed', day, phase };
}

/** How many events of one type a batch holds. */
function count(batch: readonly { readonly type: string }[], type: string): number {
    return batch.filter((event) => event.type === type).length;
}

describe('an advance spanning five hours', () => {
    it('returns five hour changes, in order, with the phase it also crossed', () => {
        const clock = createClock<Woke>(FAST_DAY);

        // 06:30 to 11:30. The hours are 07:00…11:00, and 08:00 is also where
        // this calendar's day phase begins — so the batch is both kinds, in
        // time order, with the coarser of the two first at the shared instant.
        expect(clock.advance(5 * HOUR)).toEqual([
            hourChanged(1, 7),
            hourChanged(1, 8),
            phaseChanged(1, 'day'),
            hourChanged(1, 9),
            hourChanged(1, 10),
            hourChanged(1, 11),
        ]);
    });

    it('returns them one at a time when the advance is subdivided', () => {
        const clock = createClock<Woke>(FAST_DAY);
        const batches: (Woke | TimeEvent)[][] = [];

        for (let step = 0; step < 5; step += 1) {
            batches.push([...clock.advance(HOUR)]);
        }

        expect(batches).toEqual([
            [hourChanged(1, 7)],
            [hourChanged(1, 8), phaseChanged(1, 'day')],
            [hourChanged(1, 9)],
            [hourChanged(1, 10)],
            [hourChanged(1, 11)],
        ]);
    });
});

describe('an advance crossing midnight', () => {
    it('returns the day change, the new hour and the new phase, in that order', () => {
        const clock = createClock<Woke>(FAST_DAY);

        // 06:30 to exactly 00:00 of the next day.
        const batch = clock.advance(17 * HOUR + 30 * MINUTE);

        expect(batch.slice(-3)).toEqual([
            dayChanged(2),
            hourChanged(2, 0),
            phaseChanged(2, 'night'),
        ]);
    });

    it('increases the day by one and no more', () => {
        const clock = createClock<Woke>(FAST_DAY);

        const batch = clock.advance(17 * HOUR + 30 * MINUTE);

        expect(count(batch, 'time/day-changed')).toBe(1);
        expect(clock.worldTime().day).toBe(2);
    });

    it('counts one day change per midnight crossed, however large the advance', () => {
        const clock = createClock<Woke>(FAST_DAY);

        const batch = clock.advance(3 * DAY);

        // Three midnights in three days, whatever the advance's size, and the
        // hours keep pace: 24 an hour apart for each of them.
        expect(count(batch, 'time/day-changed')).toBe(3);
        expect(count(batch, 'time/hour-changed')).toBe(72);
    });
});

describe('a phase boundary', () => {
    it('is crossed exactly once per crossing, however large the advance', () => {
        const inOneGo = createClock<Woke>(FAST_DAY);
        const stepped = createClock<Woke>(FAST_DAY);

        const fromOneAdvance = inOneGo.advance(3 * DAY);

        const fromSteps: (Woke | TimeEvent)[] = [];
        for (let step = 0; step < 3 * 24; step += 1) {
            fromSteps.push(...stepped.advance(HOUR));
        }

        // Four phases a day, three days: twelve crossings, and the same twelve
        // whether the world moved in one step or in seventy-two.
        expect(count(fromOneAdvance, 'time/day-phase-changed')).toBe(12);
        expect(fromSteps).toEqual(fromOneAdvance);
    });

    it('never fires for a clock nobody configured a cycle for', () => {
        const clock = createClock<Woke>();

        // The fallback is a single phase covering the whole day, so there is no
        // boundary between two phases to cross — not even at midnight, where
        // the day and the hour do change.
        const batch = clock.advance(3 * 24 * 60 * 60 * 1000);

        expect(count(batch, 'time/day-phase-changed')).toBe(0);
        expect(count(batch, 'time/day-changed')).toBe(3);
    });

    it('reports the phase the clock itself reports at that instant', () => {
        const clock = createClock<Woke>(FAST_DAY);

        clock.advance(HOUR + 30 * MINUTE);

        expect(clock.advance(0)).toEqual([]);
        expect(clock.worldTime().phase).toBe('day');
    });
});

describe('a world-time event and a timer', () => {
    it('come back merged in time order', () => {
        const clock = createClock<Woke>(FAST_DAY);
        clock.schedule(HOUR + 30 * MINUTE, woke('at 08:30'));
        clock.schedule(30 * MINUTE, woke('at 07:00'));

        expect(clock.advance(2 * HOUR)).toEqual([
            hourChanged(1, 7),
            woke('at 07:00'),
            hourChanged(1, 8),
            phaseChanged(1, 'day'),
            woke('at 08:30'),
        ]);
    });

    it('come back world time first when they fall on the same instant', () => {
        const clock = createClock<Woke>(FAST_DAY);
        clock.schedule(30 * MINUTE, woke('on the hour'));

        // The world changes, and then what was waiting for that instant
        // happens. A timer scheduled *for* 07:00 is a consequence of 07:00
        // having arrived, so it cannot precede it.
        expect(clock.advance(30 * MINUTE)).toEqual([
            hourChanged(1, 7),
            woke('on the hour'),
        ]);
    });

    it('come back world time first even for a timer registered long before', () => {
        const clock = createClock<Woke>(FAST_DAY);
        clock.schedule(90 * MINUTE, woke('at 08:00'));

        // Registration order breaks ties **between timers** (TIME-4). It says
        // nothing about a world-time event, which is not registered by anyone.
        expect(clock.advance(90 * MINUTE).slice(-3)).toEqual([
            hourChanged(1, 8),
            phaseChanged(1, 'day'),
            woke('at 08:00'),
        ]);
    });
});

describe('the world clock', () => {
    it('has no minute-changed event, at any size of advance', () => {
        const clock = createClock<Woke>(FAST_DAY);

        // Asserted rather than merely absent from the union: a HUD clock reads
        // `worldTime()` while drawing, and an event 1 440 times a day so a
        // label can update is a cost every subscriber pays, in the tick, for
        // ever (TIME-11).
        const types = clock.advance(3 * DAY).map((event) => event.type);

        expect(types.filter((type) => type.includes('minute'))).toEqual([]);
        expect(new Set(types)).toEqual(
            new Set(['time/hour-changed', 'time/day-changed', 'time/day-phase-changed']),
        );
    });

    it('gained one door and no more: the batch is still the caller\'s to publish', () => {
        const clock = createClock<Woke>(FAST_DAY);

        expect(Object.keys(clock).sort()).toEqual([
            'advance',
            'cancel',
            'now',
            'schedule',
            'scheduleRepeating',
            'worldTime',
        ]);
    });
});

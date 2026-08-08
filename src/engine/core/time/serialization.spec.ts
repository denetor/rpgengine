import { describe, expect, it } from 'vitest';
import { createClock, restoreClock, TIME_STATE_VERSION } from './index';
import type { TimeConfig } from './index';

/**
 * The save door (TIME-13): a clock that can be put down and picked up again
 * without the game noticing.
 *
 * The state is **plain data** — numbers and the caller's own events, which are
 * plain data by construction (TIME-6) — and its four fields each encode a
 * decision that could not be retrofitted without rewriting every save. The
 * tests below are about those decisions and not about the shape: absolute
 * deadlines, a saved `nextId`, a list ordered by `(at, id)`, and no trace of a
 * cancelled timer.
 *
 * World time is deliberately absent: it is derivable from the instant and the
 * calendar, and the calendar is configuration rather than state (CFG-15).
 */

type Poisoned = { readonly type: 'demo/poisoned'; readonly victim: number };
type Woke = { readonly type: 'demo/woke'; readonly who: string };

type DemoEvent = Poisoned | Woke;

function woke(who: string): Woke {
    return { type: 'demo/woke', who };
}

const POISON: Poisoned = { type: 'demo/poisoned', victim: 42 };

/** A day of 1 440 000 ms, starting at 06:30: an hour of game time is a minute. */
const FAST_DAY: TimeConfig = {
    dayLengthMs: 1_440_000,
    startsAt: { day: 1, hour: 6, minute: 30 },
    phases: [{ name: 'night', hour: 0, minute: 0 }],
};

describe('a saved clock', () => {
    it('carries the version, the elapsed time, the next id and the pending timers', () => {
        const clock = createClock<DemoEvent>();
        clock.advance(500);
        clock.schedule(1_000, woke('later'));

        expect(clock.serialize()).toEqual({
            version: TIME_STATE_VERSION,
            elapsedMs: 500,
            nextId: 2,
            timers: [{ id: 1, at: 1_500, event: woke('later') }],
        });
    });

    it('writes deadlines as absolute instants, so the remainder is a subtraction', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(1_000, woke('later'));
        clock.advance(600);

        const state = clock.serialize();

        // 400 ms left, and nothing about the state says 400: it says *when*,
        // and the remainder is `at - elapsedMs`. A remainder written down
        // instead would have to be recomputed on every save, and rounded.
        expect(state.timers[0].at).toBe(1_000);
        expect(state.timers[0].at - state.elapsedMs).toBe(400);
    });

    it('writes a repeating timer with its period', () => {
        const clock = createClock<DemoEvent>();
        clock.scheduleRepeating(100, POISON);
        clock.advance(250);

        expect(clock.serialize().timers).toEqual([
            { id: 1, at: 300, every: 100, event: POISON },
        ]);
    });

    it('orders the list by deadline, and at an equal deadline by id', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(300, woke('third'));
        clock.schedule(100, woke('first'));
        clock.schedule(200, woke('registered second'));
        clock.schedule(200, woke('registered third'));

        // The key the queue comes due by, written down: a restore that rebuilds
        // from this list reproduces the sequence without reproducing the heap,
        // which is what keeps the heap an implementation detail.
        expect(clock.serialize().timers.map((timer) => [timer.at, timer.id])).toEqual([
            [100, 2],
            [200, 3],
            [200, 4],
            [300, 1],
        ]);
    });

    it('contains no trace of a cancelled timer', () => {
        const clock = createClock<DemoEvent>();
        const doomed = clock.schedule(100, woke('cancelled'));
        clock.schedule(200, woke('pending'));
        clock.cancel(doomed);

        const state = clock.serialize();

        // No tombstone, which is also what makes the lazy cancellation of
        // ticket 01 invisible rather than a leak: the entry may still be in the
        // queue, and it is not in the save.
        expect(state.timers).toEqual([{ id: 2, at: 200, event: woke('pending') }]);

        // The id it consumed is not reused, though: `nextId` has moved past it.
        expect(state.nextId).toBe(3);
    });

    it('contains no trace of a timer that has already come due', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(100, woke('spent'));
        clock.advance(100);

        expect(clock.serialize().timers).toEqual([]);
    });

    it('is a snapshot: advancing afterwards does not move it', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(1_000, woke('later'));

        const state = clock.serialize();
        clock.advance(900);

        expect(state.elapsedMs).toBe(0);
        expect(state.timers).toHaveLength(1);
    });

    it('holds no world time, no calendar and nothing that is not plain data', () => {
        const clock = createClock<DemoEvent>({
            dayLengthMs: 1_440_000,
            startsAt: { day: 3, hour: 6, minute: 30 },
            phases: [{ name: 'night', hour: 0, minute: 0 }],
        });
        clock.scheduleRepeating(100, POISON);
        clock.advance(1_000);

        const state = clock.serialize();

        // The whole state, through JSON and back, is the same state: no
        // calendar, no day or hour, no function, nothing that a save file could
        // not hold (TIME-13, ARC-10.4).
        expect(JSON.parse(JSON.stringify(state))).toEqual(state);
        expect(Object.keys(state).sort()).toEqual(['elapsedMs', 'nextId', 'timers', 'version']);
    });
});

describe('a restored clock', () => {
    it('is built by a factory, never by reloading a live one', () => {
        const clock = createClock<DemoEvent>();

        // The surface has `serialize` and no way back in: a clock that could be
        // reloaded would briefly hold one game's elapsed time and another's
        // queue, and every `TimerId` handed out before it would point at a
        // stranger's timer (CTX-9).
        expect(Object.keys(clock).sort()).toEqual([
            'advance',
            'cancel',
            'now',
            'schedule',
            'scheduleRepeating',
            'serialize',
            'worldTime',
        ]);
    });

    it('comes back where the saved one was', () => {
        const clock = createClock<DemoEvent>();
        clock.advance(750);

        expect(restoreClock<DemoEvent>(clock.serialize()).now()).toBe(750);
    });

    it('writes back the state it was restored from, field for field', () => {
        const clock = createClock<DemoEvent>();
        clock.scheduleRepeating(100, POISON);
        clock.schedule(5_000, woke('later'));
        clock.schedule(5_000, woke('later still'));
        clock.cancel(clock.schedule(200, woke('cancelled')));
        clock.advance(250);

        const state = clock.serialize();

        expect(restoreClock<DemoEvent>(state).serialize()).toEqual(state);
    });

    it('survives the trip through a save file', () => {
        const clock = createClock<DemoEvent>();
        clock.scheduleRepeating(100, POISON);
        clock.advance(250);

        const written = JSON.parse(JSON.stringify(clock.serialize()));

        expect(restoreClock<DemoEvent>(written).serialize()).toEqual(clock.serialize());
    });

    it('resumes a timer with the exact remainder', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(8_000, POISON);
        clock.advance(3_000);

        const restored = restoreClock<DemoEvent>(clock.serialize());

        // Five seconds left, to the millisecond: saving is not a way to cure
        // yourself, and it is not a way to be poisoned a millisecond longer
        // either.
        expect(restored.advance(4_999)).toEqual([]);
        expect(restored.advance(1)).toEqual([POISON]);
    });

    it('resumes a repeating timer with its period and its phase', () => {
        const clock = createClock<DemoEvent>();
        clock.scheduleRepeating(100, POISON);
        clock.advance(250);

        const restored = restoreClock<DemoEvent>(clock.serialize());

        // The next deadline is 300, not 350: the repetition is anchored to the
        // deadline, and the save carries the deadline rather than a remainder.
        expect(restored.advance(49)).toEqual([]);
        expect(restored.advance(1)).toEqual([POISON]);
        expect(restored.advance(100)).toEqual([POISON]);
    });

    it('goes on being cancellable, by the ids the saved clock handed out', () => {
        const clock = createClock<DemoEvent>();
        const id = clock.scheduleRepeating(100, POISON);
        clock.advance(50);

        const restored = restoreClock<DemoEvent>(clock.serialize());

        // Whoever kept the id in their own state — which is where TIME-9 puts
        // it — kept a handle that still means the same timer after the reload.
        expect(restored.cancel(id)).toBe(true);
        expect(restored.advance(10_000)).toEqual([]);
    });

    it('takes its calendar again, because the save has none', () => {
        const clock = createClock<DemoEvent>(FAST_DAY);
        clock.advance(60_000);

        const restored = restoreClock<DemoEvent>(clock.serialize(), FAST_DAY);

        expect(restored.worldTime()).toEqual(clock.worldTime());
    });

    it('reads the same elapsed time against a different calendar as a different hour', () => {
        const clock = createClock<DemoEvent>(FAST_DAY);
        clock.advance(60_000);

        const rebalanced = restoreClock<DemoEvent>(clock.serialize(), {
            ...FAST_DAY,
            dayLengthMs: FAST_DAY.dayLengthMs * 2,
        });

        // Stated rather than discovered (CFG-15): world time is derived from the
        // calendar, the calendar is configuration and not state, so changing
        // `dayLengthMs` reinterprets every existing save. The elapsed time is
        // untouched; the world time it is read as is not — a day twice as long
        // makes the same 60 000 ms half an hour instead of a whole one.
        expect(rebalanced.now()).toBe(clock.now());
        expect(clock.worldTime()).toEqual({ day: 1, hour: 7, minute: 30, phase: 'night' });
        expect(rebalanced.worldTime()).toEqual({ day: 1, hour: 7, minute: 0, phase: 'night' });
    });
});

describe('a game saved and resumed', () => {
    it('unfolds exactly as an uninterrupted one', () => {
        const uninterrupted = createClock<DemoEvent>();
        uninterrupted.scheduleRepeating(100, POISON);
        uninterrupted.schedule(250, woke('once'));
        uninterrupted.advance(120);

        const resumed = restoreClock<DemoEvent>(uninterrupted.serialize());

        expect(resumed.advance(400)).toEqual(uninterrupted.advance(400));
    });

    it('breaks a tie the same way between a timer from before the save and one from after', () => {
        const uninterrupted = createClock<DemoEvent>();
        uninterrupted.schedule(200, woke('scheduled before the save'));

        const state = uninterrupted.serialize();
        const resumed = restoreClock<DemoEvent>(state);

        // The same registration, at the same instant, on both clocks. This is
        // the test `nextId` exists for: a counter restarting from zero would
        // give this timer a *lower* id than the one already pending, and the
        // resumed game would come due in the opposite order — at exactly the
        // point where ARC-9.1's test is save, reload, compare.
        uninterrupted.schedule(200, woke('scheduled after the load'));
        resumed.schedule(200, woke('scheduled after the load'));

        expect(resumed.advance(200)).toEqual([
            woke('scheduled before the save'),
            woke('scheduled after the load'),
        ]);
        expect(resumed.advance(0)).toEqual(uninterrupted.advance(0));
    });

    it('hands out no id twice across the save', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(100, woke('one'));
        clock.schedule(100, woke('two'));
        clock.advance(100);

        // Both ids are spent and neither timer is in the save; a restore that
        // derived the counter from the list would hand them out again.
        const resumed = restoreClock<DemoEvent>(clock.serialize());

        expect(resumed.schedule(100, woke('three'))).toBe(3);
    });
});

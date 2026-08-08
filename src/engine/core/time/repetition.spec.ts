import { describe, expect, it } from 'vitest';
import { createClock } from './index';
import type { Clock } from './index';

/**
 * The anchoring rule of TIME-5, which is the whole of this file.
 *
 * After coming due at `D` the next deadline is `D + everyMs`, never `now +
 * everyMs`. The difference is invisible while advances are small and shows up
 * the day a combat turn arrives: an implementation anchored to `now` returns
 * the right *number* of repetitions and puts them all at the end of the batch,
 * and every deadline after that is out of phase.
 *
 * The deadlines are read through the payloads, since `advance()` returns events
 * and nothing else: each repetition carries the count the test expects it to
 * arrive with, and the sequence of counts is the sequence of deadlines.
 */

type Ticked = { readonly type: 'demo/ticked'; readonly of: string };
type Woke = { readonly type: 'demo/woke'; readonly who: string };

type DemoEvent = Ticked | Woke;

const POISON: Ticked = { type: 'demo/ticked', of: 'poison' };

function woke(who: string): Woke {
    return { type: 'demo/woke', who };
}

/**
 * The instants at which something came due over the next `ms`, obtained by
 * advancing one millisecond at a time and reading the clock whenever the batch
 * is not empty.
 *
 * A deadline is not in the batch — `advance()` returns events and nothing else
 * — so this is how a test names one. It leans on the step independence proved
 * in `advance.spec.ts`: the sequence a millisecond at a time is the sequence any
 * other subdivision would have given, so measuring it this way measures the
 * deadlines and not the measurement.
 */
function deadlinesOver(clock: Clock<DemoEvent>, ms: number): number[] {
    const deadlines: number[] = [];

    for (let step = 0; step < ms; step += 1) {
        const due = clock.advance(1);

        // One deadline per event, since two timers may share an instant.
        for (let index = 0; index < due.length; index += 1) {
            deadlines.push(clock.now());
        }
    }

    return deadlines;
}

describe('a repeating timer', () => {
    it('comes due at 100, 200 and 300 over a 350 ms advance', () => {
        const clock = createClock<DemoEvent>();
        clock.scheduleRepeating(100, POISON);

        expect(deadlinesOver(clock, 350)).toEqual([100, 200, 300]);
    });

    it('comes due at 400, 500, 600 and 700 over the next 350 ms', () => {
        const clock = createClock<DemoEvent>();
        clock.scheduleRepeating(100, POISON);
        deadlinesOver(clock, 350);

        // Anchored to the deadline: the second stretch runs from 350 to 700, so
        // it crosses 400, 500, 600 — and 700, which it reaches exactly, a timer
        // being due at the instant its deadline is reached. Anchored to `now`
        // instead, the timer re-armed at 350 + 100 would come due at 450, 550
        // and 650: the same count, and a phase the world never agreed to.
        expect(deadlinesOver(clock, 350)).toEqual([400, 500, 600, 700]);
    });

    it('keeps its phase across advances of wildly different sizes', () => {
        const clock = createClock<DemoEvent>();
        clock.scheduleRepeating(100, POISON);

        // 1 + 6000 + 99 = 6100 ms of game time, so 61 deadlines: 100…6100. The
        // phase is what the last advance proves — it crosses 6100 exactly, and
        // it only does that if the 6000 ms advance left the timer due at 6100
        // rather than at 6001 + 100.
        expect(clock.advance(1)).toHaveLength(0);
        expect(clock.advance(6000)).toHaveLength(60);
        expect(clock.advance(99)).toHaveLength(1);
        expect(clock.now()).toBe(6100);
    });

    it('is interleaved with one-shot timers by deadline, in one batch', () => {
        const clock = createClock<DemoEvent>();
        clock.scheduleRepeating(100, POISON);
        clock.schedule(150, woke('halfway'));
        clock.schedule(250, woke('later'));

        expect(clock.advance(300)).toEqual([
            POISON, // 100
            woke('halfway'), // 150
            POISON, // 200
            woke('later'), // 250
            POISON, // 300
        ]);
    });

    it('comes due before a one-shot registered later for the same instant', () => {
        const clock = createClock<DemoEvent>();
        clock.scheduleRepeating(100, POISON);
        clock.schedule(200, woke('at the same instant'));

        // The repetition due at 200 was registered first and keeps the id it
        // was registered with: repeating does not re-register it, so it does
        // not go to the back of the queue at every deadline.
        expect(clock.advance(200)).toEqual([POISON, POISON, woke('at the same instant')]);
    });

    it('goes on for as long as the clock does', () => {
        const clock = createClock<DemoEvent>();
        clock.scheduleRepeating(1000, POISON);

        clock.advance(10_000);

        expect(clock.advance(10_000)).toHaveLength(10);
    });
});

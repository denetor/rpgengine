import { describe, expect, it } from 'vitest';
import { createClock } from './index';
import type { Clock } from './index';

/**
 * What an advance is: game time moving by exactly the amount it is given, and
 * everything whose deadline the movement crossed coming back in one ordered
 * batch (TIME-2, TIME-4).
 *
 * Every test here enters through the public surface. Nothing reaches for the
 * queue, the id counter or the live set — the lazy cancellation of TIME-12 must
 * stay an implementation choice, and a test that read the queue would freeze it.
 */

/** A made-up union: the service must not be able to tell it from a real one. */
type Woke = { readonly type: 'demo/woke'; readonly who: string };
type Rang = { readonly type: 'demo/rang'; readonly times: number };

type DemoEvent = Woke | Rang;

function woke(who: string): Woke {
    return { type: 'demo/woke', who };
}

/** Four timers, two of them sharing an instant: the schedule the batch tests use. */
function schedule(clock: Clock<DemoEvent>): void {
    clock.schedule(16, woke('a'));
    clock.schedule(100, woke('b'));
    clock.schedule(100, woke('c'));
    clock.schedule(160, woke('d'));
}

describe('a clock nobody has advanced', () => {
    it('is at zero', () => {
        const clock = createClock<DemoEvent>();

        expect(clock.now()).toBe(0);
    });

    it('returns nothing and moves nothing when advanced by zero', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(100, woke('sleeper'));

        expect(clock.advance(0)).toEqual([]);
        expect(clock.now()).toBe(0);
    });

    it('returns nothing when there is nothing pending', () => {
        const clock = createClock<DemoEvent>();

        expect(clock.advance(1000)).toEqual([]);
        expect(clock.now()).toBe(1000);
    });
});

describe('a scheduled timer', () => {
    it('comes due on the advance that crosses its deadline, and not before', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(100, woke('sleeper'));

        expect(clock.advance(99)).toEqual([]);
        expect(clock.advance(1)).toEqual([woke('sleeper')]);
    });

    it('comes due once and not again', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(100, woke('sleeper'));

        clock.advance(100);

        expect(clock.advance(10_000)).toEqual([]);
    });

    it('hands back the very event it was given', () => {
        const clock = createClock<DemoEvent>();
        const event = woke('sleeper');
        clock.schedule(100, event);

        const [due] = clock.advance(100);

        // By identity, not by shape: there is no wrapper type, no envelope and
        // no copy — what was scheduled is what comes back (TIME-6).
        expect(due).toBe(event);
    });
});

/**
 * The instants at which something came due over the next `ms`, obtained by
 * advancing one millisecond at a time and reading the clock whenever the batch
 * is not empty.
 *
 * A deadline is not in the batch — `advance()` returns events and nothing else
 * — so this is how a test names one. A millisecond is the finest subdivision
 * there is, which is what makes `now()` the deadline rather than merely the end
 * of the step that contained it.
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

describe('a batch', () => {
    it('comes back ordered by deadline, whatever order it was registered in', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(300, woke('last'));
        clock.schedule(100, woke('first'));
        clock.schedule(200, woke('middle'));

        expect(clock.advance(1000)).toEqual([woke('first'), woke('middle'), woke('last')]);
    });

    it('breaks a tie at an equal deadline by registration order', () => {
        const clock = createClock<DemoEvent>();
        clock.schedule(100, woke('registered first'));
        clock.schedule(100, woke('registered second'));
        clock.schedule(100, woke('registered third'));

        expect(clock.advance(100)).toEqual([
            woke('registered first'),
            woke('registered second'),
            woke('registered third'),
        ]);
    });

    it('breaks the tie the same way when the three were registered at different instants', () => {
        const clock = createClock<DemoEvent>();

        // The same deadline reached from three different presents: what breaks
        // the tie is *when each was registered*, and nothing about how far away
        // its deadline was when it was.
        clock.schedule(300, woke('registered first'));
        clock.advance(100);
        clock.schedule(200, woke('registered second'));
        clock.advance(100);
        clock.schedule(100, woke('registered third'));

        expect(clock.advance(100)).toEqual([
            woke('registered first'),
            woke('registered second'),
            woke('registered third'),
        ]);
    });

    it('is the same however the same total time was subdivided', () => {
        const stepped = createClock<DemoEvent>();
        const inOneGo = createClock<DemoEvent>();
        schedule(stepped);
        schedule(inOneGo);

        const fromSteps: DemoEvent[] = [];
        for (let step = 0; step < 10; step += 1) {
            fromSteps.push(...stepped.advance(16));
        }

        expect(fromSteps).toEqual(inOneGo.advance(160));
        expect(stepped.now()).toBe(inOneGo.now());
    });

    it('comes due at the deadlines that were asked for, and at no others', () => {
        const clock = createClock<DemoEvent>();
        schedule(clock);

        // The other half of TIME-4's promise: the same events, in the same
        // order, **with the same deadlines**. The events alone cannot say when
        // they were due — the two clocks above would agree even if both were
        // early — so the deadlines are read off the finest subdivision there
        // is, and compared against the four instants that were asked for.
        expect(deadlinesOver(clock, 200)).toEqual([16, 100, 100, 160]);
    });
});

describe("the clock's surface", () => {
    it('is the five doors of the sheet and nothing else', () => {
        const clock = createClock<DemoEvent>();

        // Written as an assertion rather than left to the compiler because half
        // of it is about what is *absent*: there is no `tick`, no `setScale`, no
        // `isPaused` and no `nextDeadline`, and above all no `publish` — what
        // `advance()` returns is the caller's to publish (ARC-4.2), and a clock
        // that could publish would be a second dispatcher beside the bus.
        expect(Object.keys(clock).sort()).toEqual([
            'advance',
            'cancel',
            'now',
            'schedule',
            'scheduleRepeating',
        ]);
    });
});

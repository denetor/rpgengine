import { describe, expect, it } from 'vitest';
import { createClock } from './index';
import type { TimeEvent } from './index';

/**
 * The clock's half of ARC-8.3: two games in one process, each with its own
 * clock, and neither able to observe the other.
 *
 * The property is bought by construction — every piece of state lives inside the
 * closure `createClock` returns, and there is no module-level variable anywhere
 * in the service — which is exactly why it is asserted here rather than trusted:
 * a counter lifted to module scope for a good-looking reason would pass every
 * other test in this directory and break only the day a testbed builds a second
 * context beside the first.
 *
 * **Not** called `isolation.spec.ts`, which is what the shape of this file
 * suggests: in `random/` that name already belongs to the *source scan* — the
 * file that reads the service's own text looking for what it must not do — and
 * here that file is `purity.spec.ts`, following `event-bus/`. One name meaning
 * two things across sibling services is a trap for whoever opens the third.
 */

type Woke = { readonly type: 'demo/woke'; readonly who: string };

function woke(who: string): Woke {
    return { type: 'demo/woke', who };
}

describe('two clocks in one process', () => {
    it('keep their own game time', () => {
        const one = createClock<Woke>();
        const other = createClock<Woke>();

        one.advance(1000);

        expect(one.now()).toBe(1000);
        expect(other.now()).toBe(0);
    });

    it('keep their own timers', () => {
        const one = createClock<Woke>();
        const other = createClock<Woke>();

        one.schedule(100, woke('in the first game'));
        other.schedule(100, woke('in the second game'));

        expect(one.advance(100)).toEqual([woke('in the first game')]);
        expect(other.advance(100)).toEqual([woke('in the second game')]);
    });

    it('hand out ids that mean nothing to each other', () => {
        const one = createClock<Woke>();
        const other = createClock<Woke>();

        const id = one.schedule(100, woke('in the first game'));

        // The two counters run independently, so this id is very probably a
        // live id in the other clock as well. Cancelling it there must not
        // reach across — and must not lie about it either.
        expect(other.cancel(id)).toBe(false);
        expect(one.advance(100)).toEqual([woke('in the first game')]);
    });

    it('are identical games when they are given identical instructions', () => {
        const one = createClock<Woke>();
        const other = createClock<Woke>();

        for (const clock of [one, other]) {
            clock.scheduleRepeating(100, woke('repeating'));
            clock.schedule(250, woke('once'));
        }

        // Advanced differently, so that what is compared is the sequence and
        // not the schedule of advances that produced it (TIME-4).
        const fromOne = one.advance(300);

        const fromOther: (Woke | TimeEvent)[] = [];
        for (let step = 0; step < 30; step += 1) {
            fromOther.push(...other.advance(10));
        }

        expect(fromOne).toEqual(fromOther);
    });
});

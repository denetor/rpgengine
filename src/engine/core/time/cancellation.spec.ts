import { describe, expect, it } from 'vitest';
import { createClock } from './index';
import type { TimerId } from './index';

/**
 * `cancel` reports whether the timer was pending and is unobservable in every
 * other way (TIME-9).
 *
 * "Unobservable in every other way" is what the last two tests here are for,
 * and it is the property that leaves the strategy free: the entry may be left
 * in the queue and discarded when it surfaces, provided nothing else can tell.
 * Nothing in this file knows which strategy was chosen, and nothing should.
 */

type Ticked = { readonly type: 'demo/ticked'; readonly of: string };
type Woke = { readonly type: 'demo/woke'; readonly who: string };

type DemoEvent = Ticked | Woke;

const POISON: Ticked = { type: 'demo/ticked', of: 'poison' };

function woke(who: string): Woke {
    return { type: 'demo/woke', who };
}

describe('a cancelled timer', () => {
    it('never comes due', () => {
        const clock = createClock<DemoEvent>();
        const id = clock.schedule(100, woke('nobody'));

        clock.cancel(id);

        expect(clock.advance(10_000)).toEqual([]);
    });

    it('is reported as having been pending', () => {
        const clock = createClock<DemoEvent>();
        const id = clock.schedule(100, woke('nobody'));

        expect(clock.cancel(id)).toBe(true);
    });

    it('is not pending a second time', () => {
        const clock = createClock<DemoEvent>();
        const id = clock.schedule(100, woke('nobody'));
        clock.cancel(id);

        expect(clock.cancel(id)).toBe(false);
    });

    it('can be cancelled halfway through the advance that would have run it', () => {
        const clock = createClock<DemoEvent>();
        const id = clock.schedule(100, woke('nobody'));

        clock.advance(50);
        clock.cancel(id);

        expect(clock.advance(50)).toEqual([]);
    });
});

describe('a timer that has already come due', () => {
    it('is reported as no longer pending', () => {
        const clock = createClock<DemoEvent>();
        const id = clock.schedule(100, woke('sleeper'));
        clock.advance(100);

        // Which is the whole of what `cancel` is for beyond cancelling: it
        // tells "cancelled" from "already fired" without the caller keeping a
        // second set of bookkeeping beside the one the clock already has.
        expect(clock.cancel(id)).toBe(false);
    });
});

describe('an id this clock never handed out', () => {
    it('is not pending', () => {
        const clock = createClock<DemoEvent>();

        expect(clock.cancel(4321 as TimerId)).toBe(false);
    });
});

describe('a cancelled repeater', () => {
    it('stops for good', () => {
        const clock = createClock<DemoEvent>();
        const id = clock.scheduleRepeating(100, POISON);

        expect(clock.advance(250)).toHaveLength(2);
        expect(clock.cancel(id)).toBe(true);
        expect(clock.advance(10_000)).toEqual([]);
    });

    it('is what cancel is really for', () => {
        const clock = createClock<DemoEvent>();
        const id = clock.scheduleRepeating(100, POISON);
        clock.advance(1000);
        clock.cancel(id);

        // A one-shot that nobody cancels fires once at a character who has been
        // healed and finds nothing to do (TIME-5); a repeater nobody cancels
        // stays in the queue for the rest of the game.
        expect(clock.advance(1_000_000)).toEqual([]);
    });
});

describe('cancelling one timer', () => {
    it('changes nothing about the order or the deadlines of the others', () => {
        const withTheCancelled = createClock<DemoEvent>();
        const withoutIt = createClock<DemoEvent>();

        // The same schedule twice, except that one clock also registers — and
        // then cancels — a timer in the middle of the others. Registering it
        // consumes an id, so the two clocks disagree about every id after it:
        // if anything the caller can see depended on more than `(deadline,
        // registration order)`, these two sequences would differ.
        withTheCancelled.schedule(100, woke('first'));
        const doomed = withTheCancelled.schedule(100, woke('cancelled'));
        withTheCancelled.schedule(100, woke('second'));
        withTheCancelled.schedule(50, woke('early'));
        withTheCancelled.cancel(doomed);

        withoutIt.schedule(100, woke('first'));
        withoutIt.schedule(100, woke('second'));
        withoutIt.schedule(50, woke('early'));

        const expected = [woke('early'), woke('first'), woke('second')];

        expect(withTheCancelled.advance(100)).toEqual(expected);
        expect(withoutIt.advance(100)).toEqual(expected);
    });
});

describe('an id', () => {
    it('is never handed out twice in one clock life', () => {
        const clock = createClock<DemoEvent>();
        const handedOut = new Set<TimerId>();

        // Through everything that might tempt a counter to rewind: timers that
        // came due, timers cancelled while pending, and a repeater that keeps
        // its own id across every repetition.
        for (let round = 0; round < 100; round += 1) {
            handedOut.add(clock.schedule(10, woke('short')));

            const doomed = clock.schedule(10, woke('doomed'));
            clock.cancel(doomed);
            handedOut.add(doomed);

            handedOut.add(clock.scheduleRepeating(5, POISON));

            clock.advance(10);
        }

        expect(handedOut.size).toBe(300);
    });
});

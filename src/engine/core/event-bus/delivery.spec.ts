import { describe, expect, it } from 'vitest';
import { createEventBus } from './index';
import type { EventBus } from './index';

/**
 * The delivery contract, observed at the only seam the bus has: its public
 * surface (BUS-4, BUS-5, BUS-6, BUS-12).
 *
 * Delivery order is the subject matter, so nearly every test here asserts a
 * **sequence** rather than a value. Each one records what it saw into an array
 * and compares the array whole: an assertion that a handler "was called" would
 * pass just as well for a bus that delivered everything twice, in the wrong
 * order, in the wrong phase.
 *
 * The events belong to a made-up producer called `demo`. The prefix is BUS-14's
 * — a type carries the name of the service that produced it — and step 2 has no
 * domain fact to borrow: the game's union grows one type per service from step
 * 3 onward.
 */

type Opened = { readonly type: 'demo/opened'; readonly room: string };

type Lit = { readonly type: 'demo/lit'; readonly lamps: number };

type Closed = { readonly type: 'demo/closed' };

/** The one event a handler publishes a copy of, to build a cascade of known depth. */
type Echoed = { readonly type: 'demo/echoed'; readonly depth: number };

type DemoEvent = Opened | Lit | Closed | Echoed;

/**
 * The error sink every bus in this file is built with.
 *
 * Nothing in the delivery contract calls it — an exception from a handler
 * simply propagates until the failure policy exists — so it rethrows: if a bus
 * ever hands it something, the test that did so fails instead of passing while
 * quietly swallowing a handler's error.
 */
function unreachable(error: unknown): void {
    throw error;
}

function busOf(): EventBus<DemoEvent> {
    return createEventBus<DemoEvent>(unreachable);
}

describe('publish', () => {
    it('queues an event and runs nothing until the flush', () => {
        const bus = busOf();
        const trace: string[] = [];
        bus.on('orchestration', 'demo/opened', (event) => {
            trace.push(event.room);
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });

        expect(trace).toEqual([]);

        bus.flush();

        expect(trace).toEqual(['cellar']);
    });

    it('queues a whole batch and runs nothing until the flush', () => {
        const bus = busOf();
        const trace: string[] = [];
        bus.onAny('orchestration', (event) => {
            trace.push(event.type);
        });

        bus.publishAll([
            { type: 'demo/opened', room: 'cellar' },
            { type: 'demo/lit', lamps: 2 },
        ]);

        expect(trace).toEqual([]);

        bus.flush();

        expect(trace).toEqual(['demo/opened', 'demo/lit']);
    });
});

describe('a subscriber', () => {
    it('receives the events of its own type, narrowed, with no cast', () => {
        const bus = busOf();
        const lamps: number[] = [];

        // `event` is `Lit` here and nowhere is that written down: `lamps` is
        // read straight off it. The day `on` stops narrowing, this line stops
        // compiling (BUS-1).
        bus.on('orchestration', 'demo/lit', (event) => {
            lamps.push(event.lamps);
        });

        bus.publishAll([
            { type: 'demo/opened', room: 'cellar' },
            { type: 'demo/lit', lamps: 3 },
            { type: 'demo/closed' },
        ]);
        bus.flush();

        expect(lamps).toEqual([3]);
    });
});

describe('the order of delivery', () => {
    it('is the order the events were published in', () => {
        const bus = busOf();
        const trace: string[] = [];
        bus.onAny('orchestration', (event) => {
            trace.push(event.type);
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.publish({ type: 'demo/lit', lamps: 1 });
        bus.publish({ type: 'demo/closed' });
        bus.flush();

        expect(trace).toEqual(['demo/opened', 'demo/lit', 'demo/closed']);
    });

    it('puts an event published by a handler after those already queued', () => {
        const bus = busOf();
        const trace: string[] = [];
        bus.onAny('orchestration', (event) => {
            trace.push(event.type);
        });
        bus.on('orchestration', 'demo/opened', () => {
            bus.publish({ type: 'demo/lit', lamps: 4 });
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.publish({ type: 'demo/closed' });
        bus.flush();

        // Not `opened, lit, closed`: `closed` was already queued when the
        // handler published, and delivery is a queue and not a call stack.
        expect(trace).toEqual(['demo/opened', 'demo/closed', 'demo/lit']);
    });

    it('serves a whole generation before anything the generation caused', () => {
        const bus = busOf();
        const trace: number[] = [];
        const lastGeneration = 3;

        // Each echo publishes two of the next depth, so a generation that was
        // delivered out of order shows up as a `2` among the `3`s rather than
        // as a subtly different total.
        bus.on('orchestration', 'demo/echoed', (event) => {
            trace.push(event.depth);
            if (event.depth < lastGeneration) {
                bus.publish({ type: 'demo/echoed', depth: event.depth + 1 });
                bus.publish({ type: 'demo/echoed', depth: event.depth + 1 });
            }
        });

        bus.publish({ type: 'demo/echoed', depth: 0 });
        bus.flush();

        expect(trace).toEqual([0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3]);
    });
});

describe('the phase boundary', () => {
    it('serves the presentation only once the whole cascade has run', () => {
        const bus = busOf();
        const trace: string[] = [];
        bus.on('orchestration', 'demo/opened', () => {
            trace.push('rule: demo/opened');
            bus.publish({ type: 'demo/lit', lamps: 2 });
        });
        bus.on('orchestration', 'demo/lit', () => {
            trace.push('rule: demo/lit');
        });
        bus.onAny('presentation', (event) => {
            trace.push(`panel: ${event.type}`);
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.flush();

        // The whole point of the two phases, in one assertion: a panel woken
        // between the two rules would be reading a world in which half the tick
        // had landed (BUS-6).
        expect(trace).toEqual([
            'rule: demo/opened',
            'rule: demo/lit',
            'panel: demo/opened',
            'panel: demo/lit',
        ]);
    });

    it('hands the presentation every event of the tick, once, in delivery order', () => {
        const bus = busOf();
        const seen: string[] = [];
        bus.on('orchestration', 'demo/opened', () => {
            bus.publish({ type: 'demo/lit', lamps: 2 });
        });
        bus.onAny('presentation', (event) => {
            seen.push(event.type);
        });
        bus.on('presentation', 'demo/lit', (event) => {
            seen.push(`lamps: ${event.lamps}`);
        });

        bus.publishAll([{ type: 'demo/opened', room: 'cellar' }, { type: 'demo/closed' }]);
        bus.flush();

        expect(seen).toEqual([
            'demo/opened',
            'demo/closed',
            'demo/lit',
            'lamps: 2',
        ]);
    });
});

describe('flush', () => {
    it('leaves the queue empty, so a second flush delivers nothing', () => {
        const bus = busOf();
        const trace: string[] = [];
        bus.onAny('orchestration', (event) => {
            trace.push(event.type);
        });
        bus.onAny('presentation', (event) => {
            trace.push(event.type);
        });

        bus.publish({ type: 'demo/closed' });
        bus.flush();
        bus.flush();

        expect(trace).toEqual(['demo/closed', 'demo/closed']);
    });

    it('does nothing when the queue is empty', () => {
        const bus = busOf();
        const trace: string[] = [];
        bus.onAny('orchestration', (event) => {
            trace.push(event.type);
        });

        expect(() => bus.flush()).not.toThrow();
        expect(trace).toEqual([]);
    });

    it('does nothing when nobody is subscribed', () => {
        const bus = busOf();

        bus.publish({ type: 'demo/opened', room: 'cellar' });

        expect(() => bus.flush()).not.toThrow();
    });
});
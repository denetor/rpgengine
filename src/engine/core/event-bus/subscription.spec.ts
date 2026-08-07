import { describe, expect, it } from 'vitest';
import { createEventBus } from './index';
import type { EventBus } from './index';

/**
 * Who is invoked, in what order, and until when (BUS-7, BUS-13).
 *
 * Two rules that react to the same fact must behave the same way on every run,
 * so the order of handlers is as much part of the contract as the order of
 * events is. It is fixed by two things and nothing else: every `onAny` of the
 * phase runs before the typed handlers of the event, and typed handlers run in
 * the order they were subscribed in.
 *
 * A subscription belongs to a **phase**, `onAny` included. That is what keeps a
 * trace honest: a two-phase delivery would otherwise show every line twice, and
 * the reader would be looking at a log of the bus rather than at a log of the
 * tick.
 *
 * The material is the made-up producer of `delivery.spec.ts`, declared again
 * here rather than shared. A spec that can be read from the top without opening
 * another file is worth more than the four lines the import would save.
 */

type Opened = { readonly type: 'demo/opened'; readonly room: string };

type Lit = { readonly type: 'demo/lit'; readonly lamps: number };

type Closed = { readonly type: 'demo/closed' };

type DemoEvent = Opened | Lit | Closed;

/** Rethrows, so that an error handed to it fails the test rather than vanishing. */
function unreachable(error: unknown): void {
    throw error;
}

function busOf(): EventBus<DemoEvent> {
    return createEventBus<DemoEvent>(unreachable);
}

describe('within a phase', () => {
    it('runs the onAny handlers before the typed handlers of the same event', () => {
        const bus = busOf();
        const trace: string[] = [];

        // Subscribed *after* the typed handler on purpose: "first" is a rule
        // about the kind of subscription, not about when it was made.
        bus.on('orchestration', 'demo/opened', () => {
            trace.push('typed');
        });
        bus.onAny('orchestration', () => {
            trace.push('any');
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.flush();

        expect(trace).toEqual(['any', 'typed']);
    });

    it('runs the typed handlers of one event in subscription order', () => {
        const bus = busOf();
        const trace: string[] = [];
        bus.on('orchestration', 'demo/lit', () => {
            trace.push('first');
        });
        bus.on('orchestration', 'demo/lit', () => {
            trace.push('second');
        });
        bus.on('orchestration', 'demo/lit', () => {
            trace.push('third');
        });

        bus.publish({ type: 'demo/lit', lamps: 1 });
        bus.flush();

        expect(trace).toEqual(['first', 'second', 'third']);
    });
});

describe('an onAny subscription', () => {
    it('sees each event of its own phase exactly once, in delivery order', () => {
        const bus = busOf();
        const rules: string[] = [];
        const panels: string[] = [];
        bus.onAny('orchestration', (event) => {
            rules.push(event.type);
        });
        bus.onAny('presentation', (event) => {
            panels.push(event.type);
        });
        bus.on('orchestration', 'demo/opened', () => {
            bus.publish({ type: 'demo/lit', lamps: 2 });
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.flush();

        // Each trace is the whole tick, once. A trace registered in one phase
        // that also caught the other's pass would read `opened, lit, opened,
        // lit` and double every line of a cascade.
        expect(rules).toEqual(['demo/opened', 'demo/lit']);
        expect(panels).toEqual(['demo/opened', 'demo/lit']);
    });
});

describe('unsubscribing', () => {
    it('stops a typed handler from the next flush on', () => {
        const bus = busOf();
        const trace: string[] = [];
        const unsubscribe = bus.on('orchestration', 'demo/closed', () => {
            trace.push('closed');
        });

        bus.publish({ type: 'demo/closed' });
        bus.flush();

        unsubscribe();

        bus.publish({ type: 'demo/closed' });
        bus.flush();

        expect(trace).toEqual(['closed']);
    });

    it('stops an onAny handler from the next flush on', () => {
        const bus = busOf();
        const trace: string[] = [];
        const unsubscribe = bus.onAny('presentation', (event) => {
            trace.push(event.type);
        });

        bus.publish({ type: 'demo/closed' });
        bus.flush();

        unsubscribe();

        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.flush();

        expect(trace).toEqual(['demo/closed']);
    });

    it('leaves the other subscriptions alone', () => {
        const bus = busOf();
        const trace: string[] = [];
        bus.on('orchestration', 'demo/lit', () => {
            trace.push('first');
        });
        const unsubscribe = bus.on('orchestration', 'demo/lit', () => {
            trace.push('second');
        });
        bus.on('orchestration', 'demo/lit', () => {
            trace.push('third');
        });

        unsubscribe();

        bus.publish({ type: 'demo/lit', lamps: 1 });
        bus.flush();

        expect(trace).toEqual(['first', 'third']);
    });
});

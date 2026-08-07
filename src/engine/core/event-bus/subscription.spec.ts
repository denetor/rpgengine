import { describe, expect, it } from 'vitest';
import { createEventBus } from './index';
import type { EventBus } from './index';

/**
 * Who is invoked, in what order, and until when (BUS-7, BUS-10, BUS-13).
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

/**
 * Subscribing and unsubscribing *while the bus is delivering* — the case that
 * decides whether a subscription site can be reasoned about at all (BUS-10).
 *
 * This is not a corner: a panel subscribes when it opens and unsubscribes when
 * it closes, and it opens and closes in reaction to events. The rule is one
 * sentence — the handlers of an event are fixed when delivery of *that event*
 * begins — and everything below is that sentence read out in the four
 * directions a handler can pull it.
 */
describe('the subscriber set during delivery', () => {
    it('still delivers the current event to a handler an earlier handler unsubscribed', () => {
        const bus = busOf();
        const trace: string[] = [];
        const unsubscribe = bus.on('orchestration', 'demo/lit', () => {
            trace.push('the doomed one');
        });

        // Subscribed first, so it runs first and the unsubscription lands
        // *during* the delivery it would otherwise have cut short.
        bus.onAny('orchestration', () => {
            unsubscribe();
        });

        bus.publish({ type: 'demo/lit', lamps: 1 });
        bus.publish({ type: 'demo/lit', lamps: 2 });
        bus.flush();

        // Once: the current event, because the snapshot was already taken, and
        // nothing after it. The alternative — reading the live list and
        // adjusting the index — would make this handler's fate depend on whether
        // some unrelated handler happened to run before or after it.
        expect(trace).toEqual(['the doomed one']);
    });

    it('withholds the current event from a handler subscribed mid-delivery', () => {
        const bus = busOf();
        const trace: string[] = [];
        let subscribed = false;

        bus.on('orchestration', 'demo/lit', (event) => {
            if (subscribed) {
                return;
            }
            subscribed = true;

            bus.on('orchestration', 'demo/lit', (later) => {
                trace.push(`latecomer saw ${later.lamps}`);
            });

            // Published from inside the delivery, so the event it misses and the
            // event it receives are both in this same flush.
            bus.publish({ type: 'demo/lit', lamps: event.lamps + 1 });
        });

        bus.publish({ type: 'demo/lit', lamps: 1 });
        bus.flush();

        // Not `lamps: 1`, whose snapshot was taken before it existed, and
        // `lamps: 2` without waiting for the next flush: the snapshot is per
        // event, so "from the next event on" is the same sentence as "from the
        // next flush on" only when nothing else is in flight.
        expect(trace).toEqual(['latecomer saw 2']);
    });

    it('applies the same rule to an onAny subscribed mid-delivery', () => {
        const bus = busOf();
        const trace: string[] = [];
        let subscribed = false;

        bus.on('orchestration', 'demo/opened', () => {
            if (subscribed) {
                return;
            }
            subscribed = true;

            bus.onAny('orchestration', (event) => {
                trace.push(event.type);
            });

            bus.publish({ type: 'demo/lit', lamps: 2 });
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.flush();

        // An `onAny` runs before the typed handlers of an event (BUS-7), which
        // is an order within the snapshot and not a way around it: the event
        // being delivered when it subscribed is still not its.
        expect(trace).toEqual(['demo/lit']);
    });

    it('applies the same rule to an onAny unsubscribed mid-delivery', () => {
        const bus = busOf();
        const trace: string[] = [];
        const unsubscribe = bus.onAny('orchestration', (event) => {
            trace.push(event.type);
        });

        // The typed handler runs after the `onAny` of the same event, so the
        // unsubscription happens with that `onAny` already delivered — and the
        // question is only whether it stops from the next event or from this
        // one, which the snapshot has already answered.
        bus.on('orchestration', 'demo/opened', () => {
            unsubscribe();
            bus.publish({ type: 'demo/lit', lamps: 2 });
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.flush();

        expect(trace).toEqual(['demo/opened']);
    });
});

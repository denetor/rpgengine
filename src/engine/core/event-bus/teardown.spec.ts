import { describe, expect, it } from 'vitest';
import { createEventBus } from './index';
import type { EventBus } from './index';

/**
 * The two things a caller may do to the bus rather than through it: force a
 * delivery from inside one, and tear the whole thing down (BUS-10, BUS-11).
 *
 * A handler that calls `flush()` throws. It is nearly unreachable — a handler
 * that publishes is already guaranteed that this same flush will deliver what it
 * published, so there is nothing a reentrant call could add — and that is
 * exactly why it must not be a silent no-op: whoever wrote it believes they
 * forced a delivery, and a bus that quietly agreed would leave them debugging
 * the wrong thing.
 *
 * `dispose()` drops every subscription and discards the queue. It is the bus's
 * half of CTX-6 — *after `dispose()`, a context reacts to no event* — and it
 * holds only if it is called **outside** a flush, by the same owner that calls
 * `flush()`. Inside one it throws, for the same reason and off the same flag:
 * `dispose()` swaps the queue the drain is reading, so a context that tore
 * itself down in reaction to an event would end the cascade mid-sentence and
 * leave a tick that looks like it merely finished.
 */

type Opened = { readonly type: 'demo/opened'; readonly room: string };

type Lit = { readonly type: 'demo/lit'; readonly lamps: number };

type Closed = { readonly type: 'demo/closed' };

type DemoEvent = Opened | Lit | Closed;

/** One call of `onHandlerError`, kept whole so that both arguments can be asserted. */
interface Report {
    readonly error: unknown;
    readonly event: DemoEvent;
}

function busWithReports(): { readonly bus: EventBus<DemoEvent>; readonly reports: Report[] } {
    const reports: Report[] = [];
    const bus = createEventBus<DemoEvent>((error, event) => {
        reports.push({ error, event });
    });

    return { bus, reports };
}

describe('a handler that calls flush', () => {
    it('throws, and from the orchestration the throw reaches the caller', () => {
        const { bus } = busWithReports();
        bus.on('orchestration', 'demo/opened', () => {
            bus.flush();
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });

        // The message says what the caller already has rather than only what
        // they may not do: the flush they are inside of will deliver what they
        // publish before it ends (BUS-5).
        expect(() => bus.flush()).toThrow(/already delivering/);
    });

    it('throws from the presentation too, where the failure policy catches it', () => {
        const { bus, reports } = busWithReports();
        const closed: Closed = { type: 'demo/closed' };
        bus.on('presentation', 'demo/closed', () => {
            bus.flush();
        });

        bus.publish(closed);

        // Both rules, meeting: the reentrant call throws like any other, and a
        // panel that throws is reported rather than propagated. A bus that
        // special-cased its own exception here would be the interface phase
        // deciding which failures are serious.
        expect(() => bus.flush()).not.toThrow();
        expect(reports).toHaveLength(1);
        expect(reports[0].event).toEqual(closed);
        expect(String(reports[0].error)).toMatch(/already delivering/);
    });

    it('leaves the bus usable once the flush that refused it is over', () => {
        const { bus } = busWithReports();
        const trace: string[] = [];
        let reentrant = true;

        bus.on('orchestration', 'demo/opened', () => {
            if (reentrant) {
                bus.flush();
            }
            trace.push('opened');
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });

        expect(() => bus.flush()).toThrow(/already delivering/);

        // The guard is a flag, and a flag left standing after a throw would turn
        // one bad handler into a bus that refuses every flush for the rest of
        // the run.
        reentrant = false;
        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.flush();

        expect(trace).toEqual(['opened']);
    });
});

describe('unsubscribing', () => {
    it('twice is a no-op', () => {
        const { bus } = busWithReports();
        const trace: string[] = [];
        const unsubscribe = bus.on('orchestration', 'demo/lit', () => {
            trace.push('first');
        });
        bus.on('orchestration', 'demo/lit', () => {
            trace.push('second');
        });

        unsubscribe();
        unsubscribe();

        bus.publish({ type: 'demo/lit', lamps: 2 });
        bus.flush();

        // The second call finding nothing is only half of it. The half that
        // matters is that it did not find *something else*: an unsubscribe that
        // remembered an index instead of its own subscription would take the
        // handler that moved up into the free slot.
        expect(trace).toEqual(['second']);
    });

    it('after dispose is a no-op', () => {
        const { bus } = busWithReports();
        const trace: string[] = [];
        const unsubscribe = bus.on('orchestration', 'demo/lit', () => {
            trace.push('the disposed one');
        });

        bus.dispose();
        unsubscribe();

        // Subscribed after the teardown, so it is the stale unsubscribe's chance
        // to remove somebody else's registration from a list it no longer
        // belongs to.
        bus.on('orchestration', 'demo/lit', () => {
            trace.push('the new one');
        });

        bus.publish({ type: 'demo/lit', lamps: 2 });
        bus.flush();

        expect(trace).toEqual(['the new one']);
    });
});

describe('dispose', () => {
    it('leaves nothing registered: a later publish and flush reaches no handler', () => {
        const { bus } = busWithReports();
        const trace: string[] = [];
        bus.on('orchestration', 'demo/opened', () => {
            trace.push('a rule');
        });
        bus.onAny('orchestration', () => {
            trace.push('a trace');
        });
        bus.on('presentation', 'demo/opened', () => {
            trace.push('a panel');
        });
        bus.onAny('presentation', () => {
            trace.push('an overlay');
        });

        bus.dispose();

        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.flush();

        // Both phases and both kinds of subscription. A teardown that emptied
        // one list would leave a panel drawing over a game that no longer exists
        // — which is the whole of CTX-6.
        expect(trace).toEqual([]);
    });

    it('refuses to run inside a flush, from either phase', () => {
        const { bus, reports } = busWithReports();
        const trace: string[] = [];

        bus.on('orchestration', 'demo/opened', () => {
            bus.dispose();
        });
        bus.on('orchestration', 'demo/lit', () => {
            trace.push('the rest of the cascade');
        });

        bus.publishAll([
            { type: 'demo/opened', room: 'cellar' },
            { type: 'demo/lit', lamps: 2 },
        ]);

        // The alternative is the silent one: `dispose()` swaps the queue the
        // drain is reading, so the loop would find it empty, stop, and hand the
        // interface a tick that ended two events early with nothing to say so.
        expect(() => bus.flush()).toThrow(/outside a flush/);
        expect(trace).toEqual([]);

        // From the presentation the throw is a panel's throw like any other, and
        // the failure policy reports it rather than propagating it.
        const { bus: second, reports: secondReports } = busWithReports();
        second.on('presentation', 'demo/closed', () => {
            second.dispose();
        });
        second.publish({ type: 'demo/closed' });
        second.flush();

        expect(reports).toEqual([]);
        expect(secondReports).toHaveLength(1);
        expect(String(secondReports[0].error)).toMatch(/outside a flush/);
    });

    it('discards a queued, unflushed event without throwing', () => {
        const { bus } = busWithReports();
        const trace: string[] = [];

        bus.publish({ type: 'demo/closed' });

        expect(() => bus.dispose()).not.toThrow();

        // Subscribed after the teardown, so the only thing that could reach it
        // is an event the bus kept across it.
        bus.onAny('orchestration', (event) => {
            trace.push(event.type);
        });
        bus.flush();

        expect(trace).toEqual([]);
    });
});

import { describe, expect, it } from 'vitest';
import { createEventBus } from './index';
import type { EventBus } from './index';

/**
 * What the bus owes a handler that throws, which is two different things
 * depending on which phase it threw in (BUS-9).
 *
 * A rule that threw is a rule that did not run: the quest did not advance, or
 * the loot was not granted, and the world the player carries on in is quietly
 * missing a consequence. That fails as loudly as a cycle does — the exception
 * propagates and the tick is over. A panel that threw costs a panel: the domain
 * has already finished moving, so the error is reported and the handlers after
 * it still draw.
 *
 * There is no third case for a build under test. The tests here are the same
 * tests the shipped build would pass, because the bus has no branch that tells
 * the two apart (ARC-9.1) — a claim `purity.spec.ts` checks against the source
 * rather than against behaviour, since a build-mode branch is invisible to every
 * test that runs in one build.
 *
 * The made-up `demo` producer of `delivery.spec.ts` again, declared here rather
 * than shared: a spec worth reading from the top is worth the four lines.
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

/**
 * A bus and the reports it made, which is the seam this whole file observes.
 *
 * `onHandlerError` is the only place a caught error surfaces, so a recording
 * function is the only way to prove *which* error was caught and *which* event
 * caused it. A counter would pass for a bus that reported the wrong event, and a
 * rethrowing sink would turn phase two back into phase one.
 */
function busWithReports(): { readonly bus: EventBus<DemoEvent>; readonly reports: Report[] } {
    const reports: Report[] = [];
    const bus = createEventBus<DemoEvent>((error, event) => {
        reports.push({ error, event });
    });

    return { bus, reports };
}

describe('a rule that throws', () => {
    it('aborts the flush, and the exception reaches the caller', () => {
        const { bus } = busWithReports();
        const trace: string[] = [];
        const failure = new Error('the quest could not advance');

        bus.on('orchestration', 'demo/opened', () => {
            throw failure;
        });
        bus.on('orchestration', 'demo/opened', () => {
            trace.push('after it');
        });
        bus.on('orchestration', 'demo/lit', () => {
            trace.push('the next event');
        });

        bus.publishAll([
            { type: 'demo/opened', room: 'cellar' },
            { type: 'demo/lit', lamps: 2 },
        ]);

        expect(() => bus.flush()).toThrow(failure);

        // Not just "the flush threw": the two things that did not happen are the
        // handler standing behind the one that failed, and the event standing
        // behind the one being delivered. Abort means the tick stops there.
        expect(trace).toEqual([]);
    });

    it('never reaches onHandlerError', () => {
        const { bus, reports } = busWithReports();
        bus.on('orchestration', 'demo/closed', () => {
            throw new Error('a rule failed');
        });

        bus.publish({ type: 'demo/closed' });

        expect(() => bus.flush()).toThrow('a rule failed');

        // The sink is for the phase that carries on. A rule reported there
        // instead of thrown would be a consequence lost to a log line.
        expect(reports).toEqual([]);
    });

    it('stops the interface from seeing the tick at all', () => {
        const { bus } = busWithReports();
        const panels: string[] = [];
        bus.onAny('presentation', (event) => {
            panels.push(event.type);
        });
        bus.on('orchestration', 'demo/closed', () => {
            throw new Error('a rule failed');
        });

        bus.publish({ type: 'demo/closed' });

        expect(() => bus.flush()).toThrow('a rule failed');

        // The world stopped half-moved. Handing it to the panels would show the
        // player a state that the rules never finished making (BUS-6).
        expect(panels).toEqual([]);
    });

    it('is still in the onAny trace of its own phase', () => {
        const { bus } = busWithReports();
        const trace: string[] = [];

        bus.onAny('orchestration', (event) => {
            trace.push(event.type);
        });
        bus.on('orchestration', 'demo/closed', () => {
            throw new Error('a rule failed');
        });

        bus.publish({ type: 'demo/closed' });

        expect(() => bus.flush()).toThrow('a rule failed');

        // This is what makes "`onAny` runs first" load-bearing rather than
        // decorative. An exception ends the tick where it happened, so if the
        // trace ran last, the one event anybody debugging this needs to see —
        // the one whose handler just crashed — would be the one event never
        // traced.
        expect(trace).toEqual(['demo/closed']);
    });

    it('leaves the queue empty, so the next flush redelivers nothing', () => {
        const { bus } = busWithReports();
        const trace: string[] = [];
        let failing = true;

        bus.onAny('orchestration', (event) => {
            trace.push(event.type);
        });
        bus.on('orchestration', 'demo/opened', () => {
            if (failing) {
                throw new Error('a rule failed');
            }
        });

        bus.publishAll([
            { type: 'demo/opened', room: 'cellar' },
            { type: 'demo/lit', lamps: 2 },
        ]);

        expect(() => bus.flush()).toThrow('a rule failed');

        failing = false;
        bus.flush();

        // The same answer the depth refusal gives: a failed tick is over, and
        // its queue goes with it. Keeping it would have the next flush deliver
        // `demo/opened` a second time to rules that already ran on it, and would
        // leave the bus sitting outside a flush with something in it (BUS-12).
        expect(trace).toEqual(['demo/opened']);
    });
});

describe('a panel that throws', () => {
    it('does not stop the handlers standing behind it', () => {
        const { bus } = busWithReports();
        const trace: string[] = [];

        bus.on('presentation', 'demo/lit', () => {
            trace.push('first');
        });
        bus.on('presentation', 'demo/lit', () => {
            throw new Error('a panel failed to draw');
        });
        bus.on('presentation', 'demo/lit', () => {
            trace.push('third');
        });

        bus.publish({ type: 'demo/lit', lamps: 2 });
        bus.flush();

        expect(trace).toEqual(['first', 'third']);
    });

    it('does not stop the rest of the tick being delivered', () => {
        const { bus } = busWithReports();
        const panels: string[] = [];

        bus.onAny('presentation', (event) => {
            panels.push(event.type);
            if (event.type === 'demo/opened') {
                throw new Error('a panel failed to draw');
            }
        });
        bus.on('orchestration', 'demo/opened', () => {
            bus.publish({ type: 'demo/lit', lamps: 2 });
        });

        bus.publish({ type: 'demo/opened', room: 'cellar' });
        bus.flush();

        expect(panels).toEqual(['demo/opened', 'demo/lit']);
    });

    it('does not make the flush throw', () => {
        const { bus } = busWithReports();
        bus.onAny('presentation', () => {
            throw new Error('a panel failed to draw');
        });

        bus.publish({ type: 'demo/closed' });

        expect(() => bus.flush()).not.toThrow();
    });

    it('is reported with the error and the event that caused it', () => {
        const { bus, reports } = busWithReports();
        const failure = new Error('a panel failed to draw');
        const lit: Lit = { type: 'demo/lit', lamps: 2 };

        bus.on('presentation', 'demo/lit', () => {
            throw failure;
        });

        bus.publishAll([{ type: 'demo/opened', room: 'cellar' }, lit]);
        bus.flush();

        // The event is the half nobody can reconstruct from a stack trace: the
        // trace names the handler, and the payload it choked on is the thing
        // that says why this run and not the last one.
        expect(reports).toEqual([{ error: failure, event: lit }]);
    });

    it('reports whatever was thrown, unwrapped, even when it is not an Error', () => {
        const { bus, reports } = busWithReports();
        bus.on('presentation', 'demo/closed', () => {
            // Legal, and the reason `onHandlerError` takes `unknown`: a bus that
            // assumed `Error` here would report `undefined.message` from the one
            // place left to report anything.
            throw 'a string, thrown by somebody in a hurry';
        });

        bus.publish({ type: 'demo/closed' });
        bus.flush();

        expect(reports.map((report) => report.error)).toEqual([
            'a string, thrown by somebody in a hurry',
        ]);
    });

    it('reports once per failing handler when several fail on one event', () => {
        const { bus, reports } = busWithReports();
        const first = new Error('the map failed to draw');
        const second = new Error('the inventory failed to draw');
        const closed: Closed = { type: 'demo/closed' };

        bus.onAny('presentation', () => {
            throw first;
        });
        bus.on('presentation', 'demo/closed', () => {
            throw second;
        });

        bus.publish(closed);
        bus.flush();

        // Once each, in delivery order, and both naming the same event: two
        // panels that failed are two bugs, and a bus that reported the first and
        // gave up would hide the second until the first was fixed.
        expect(reports).toEqual([
            { error: first, event: closed },
            { error: second, event: closed },
        ]);
    });
});

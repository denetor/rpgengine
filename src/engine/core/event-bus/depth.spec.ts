import { describe, expect, it } from 'vitest';
import { CausalDepthError, createEventBus } from './index';
import type { EventBus } from './index';

/**
 * The safety rail: causal generations, a fixed limit, and a throw somebody can
 * read (BUS-8).
 *
 * Two rules that publish each other are perfectly legal code. Without this the
 * first one written drains forever and takes the browser and the test runner
 * with it, which is why the tests below are the only ones in this directory that
 * would **hang** rather than fail if the code were wrong.
 *
 * The limit is written out as `32` here and never read off the service. A test
 * that imported the constant would agree with it whatever it became, and the
 * number is exactly the thing this file is meant to hold still.
 */

type Ping = { readonly type: 'demo/ping' };

type Pong = { readonly type: 'demo/pong' };

type Pang = { readonly type: 'demo/pang' };

/** The event a handler publishes a copy of, for a cycle of one. */
type Tick = { readonly type: 'demo/tick' };

/** The event that carries its own depth, for a cascade of a known length. */
type Echoed = { readonly type: 'demo/echoed'; readonly depth: number };

type DemoEvent = Ping | Pong | Pang | Tick | Echoed;

/** Rethrows: nothing in this file is meant to hand it anything. */
function unreachable(error: unknown): void {
    throw error;
}

function busOf(): EventBus<DemoEvent> {
    return createEventBus<DemoEvent>(unreachable);
}

/**
 * A handler that carries an echo down to `generations` in all, counting the one
 * that was published before the flush.
 *
 * One event per generation, so the count of events delivered is the count of
 * generations — which is what makes the assertions below say what they mean.
 */
function cascadeOf(bus: EventBus<DemoEvent>, generations: number, trace: number[]): void {
    bus.on('orchestration', 'demo/echoed', (event) => {
        trace.push(event.depth);
        if (event.depth < generations - 1) {
            bus.publish({ type: 'demo/echoed', depth: event.depth + 1 });
        }
    });
}

/** The one throw a flush is expected to make. */
function depthErrorOf(flush: () => void): CausalDepthError {
    try {
        flush();
    } catch (error) {
        if (error instanceof CausalDepthError) {
            return error;
        }
        throw error;
    }
    throw new Error('the flush was expected to refuse a cascade and did not');
}

describe('a cycle', () => {
    it('of two events throws instead of running forever', () => {
        const bus = busOf();
        bus.on('orchestration', 'demo/ping', () => {
            bus.publish({ type: 'demo/pong' });
        });
        bus.on('orchestration', 'demo/pong', () => {
            bus.publish({ type: 'demo/ping' });
        });

        bus.publish({ type: 'demo/ping' });

        expect(() => bus.flush()).toThrow(CausalDepthError);
    });

    it('of three events throws', () => {
        const bus = busOf();
        bus.on('orchestration', 'demo/ping', () => {
            bus.publish({ type: 'demo/pong' });
        });
        bus.on('orchestration', 'demo/pong', () => {
            bus.publish({ type: 'demo/pang' });
        });
        bus.on('orchestration', 'demo/pang', () => {
            bus.publish({ type: 'demo/ping' });
        });

        bus.publish({ type: 'demo/ping' });

        expect(() => bus.flush()).toThrow(CausalDepthError);
    });

    it('of one — a handler publishing its own event — throws', () => {
        const bus = busOf();
        bus.on('orchestration', 'demo/tick', () => {
            bus.publish({ type: 'demo/tick' });
        });

        bus.publish({ type: 'demo/tick' });

        expect(() => bus.flush()).toThrow(CausalDepthError);
    });
});

describe('the message', () => {
    it('names the event types of each of the last three generations, in order', () => {
        const bus = busOf();
        bus.on('orchestration', 'demo/ping', () => {
            bus.publish({ type: 'demo/pong' });
        });
        bus.on('orchestration', 'demo/pong', () => {
            bus.publish({ type: 'demo/ping' });
        });

        bus.publish({ type: 'demo/ping' });
        const error = depthErrorOf(() => bus.flush());

        // The ping-pong, readable off the error with nothing else to hand: the
        // generations alternate, so the three most recent are the loop itself.
        expect(error.generations).toEqual([['demo/ping'], ['demo/pong'], ['demo/ping']]);
        expect(error.message).toContain('[demo/ping] [demo/pong] [demo/ping]');
    });

    it('names each type once, however many events of it a generation carried', () => {
        const bus = busOf();
        const width = 3;

        // One in, one out, so the generations stay three events wide all the way
        // down instead of doubling into a test that never finishes.
        bus.on('orchestration', 'demo/ping', () => {
            bus.publish({ type: 'demo/ping' });
        });
        for (let copy = 0; copy < width; copy += 1) {
            bus.publish({ type: 'demo/ping' });
        }

        const error = depthErrorOf(() => bus.flush());

        // A generation of hundreds of events reads as one type, or the message
        // is a wall nobody finishes.
        expect(error.generations).toEqual([['demo/ping'], ['demo/ping'], ['demo/ping']]);
    });

    it('says what the limit was, and that it is not a knob', () => {
        const bus = busOf();
        bus.on('orchestration', 'demo/tick', () => {
            bus.publish({ type: 'demo/tick' });
        });

        bus.publish({ type: 'demo/tick' });
        const error = depthErrorOf(() => bus.flush());

        expect(error.message).toContain('32');
        expect(error.name).toBe('CausalDepthError');
    });
});

describe('the limit', () => {
    it('lets a legitimate cascade of ten generations through', () => {
        const bus = busOf();
        const trace: number[] = [];
        cascadeOf(bus, 10, trace);

        bus.publish({ type: 'demo/echoed', depth: 0 });
        bus.flush();

        expect(trace).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('lets exactly 32 generations through', () => {
        const bus = busOf();
        const trace: number[] = [];
        cascadeOf(bus, 32, trace);

        bus.publish({ type: 'demo/echoed', depth: 0 });
        bus.flush();

        expect(trace.length).toBe(32);
    });

    it('refuses the 33rd', () => {
        const bus = busOf();
        const trace: number[] = [];
        cascadeOf(bus, 33, trace);

        bus.publish({ type: 'demo/echoed', depth: 0 });

        expect(() => bus.flush()).toThrow(CausalDepthError);
    });

    it('counts depth and not events: a wide generation is not a deep one', () => {
        const bus = busOf();
        const width = 400;
        const delivered: string[] = [];
        bus.onAny('orchestration', (event) => {
            delivered.push(event.type);
        });

        // One generation fanning out into a second, and nothing after it: eight
        // hundred events, two generations deep.
        bus.on('orchestration', 'demo/ping', () => {
            bus.publish({ type: 'demo/pong' });
        });
        for (let event = 0; event < width; event += 1) {
            bus.publish({ type: 'demo/ping' });
        }

        expect(() => bus.flush()).not.toThrow();
        expect(delivered.length).toBe(width * 2);
    });
});

describe('after the refusal', () => {
    it('leaves nothing queued, so the next flush is a no-op', () => {
        const bus = busOf();
        const trace: string[] = [];
        bus.onAny('orchestration', (event) => {
            trace.push(event.type);
        });
        bus.on('orchestration', 'demo/tick', () => {
            bus.publish({ type: 'demo/tick' });
        });

        bus.publish({ type: 'demo/tick' });
        expect(() => bus.flush()).toThrow(CausalDepthError);

        const afterTheThrow = trace.length;
        bus.flush();

        // The failed tick is over. Keeping its queue would mean the next flush
        // redelivered events that already ran once, and then threw again.
        expect(trace.length).toBe(afterTheThrow);
    });

    it('has told the presentation nothing about the tick that failed', () => {
        const bus = busOf();
        const panels: string[] = [];
        bus.onAny('presentation', (event) => {
            panels.push(event.type);
        });
        bus.on('orchestration', 'demo/tick', () => {
            bus.publish({ type: 'demo/tick' });
        });

        bus.publish({ type: 'demo/tick' });

        expect(() => bus.flush()).toThrow(CausalDepthError);
        expect(panels).toEqual([]);
    });
});

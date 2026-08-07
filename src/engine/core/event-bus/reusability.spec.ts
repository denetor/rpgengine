import { describe, expect, it } from 'vitest';
import { CausalDepthError, createEventBus } from './index';
import type { EventBus } from './index';

/**
 * The reusability proof (ARC-3.4, ARC-8.3).
 *
 * `BUS` is declared **generic**, and that is a promise which degrades in
 * silence: one event type the bus knows the name of, one phase that means
 * something only to the game it was written beside, one default that only makes
 * sense next to that game's rules, and the service is domain-specific before
 * anybody notices. This file is the test that would notice.
 *
 * Everything below belongs to **a signal box on a single-track branch line**:
 * track circuits that report a train, an interlocking that decides which signal
 * may show what, barriers at a level crossing, and — quite separately — the
 * departure board on the platform and the row of lamps in front of the
 * signaller. Nothing in it comes from this project. The only imports are the
 * service's own door and vitest; there is no helper, no fixture and no builder
 * borrowed from the specs beside it, because a proof that the bus can be lifted
 * into another project must not lean on the project it is being lifted out of.
 *
 * The domain was chosen for its shape and not for the joke. A signal box is
 * genuinely two-phase: the interlocking must reach its conclusion — every
 * consequence of a train arriving worked through — *before* anything is
 * displayed, or the board shows a departure the interlocking is still in the
 * middle of forbidding. That is BUS-6 in somebody else's vocabulary, which is
 * the only convincing way to show that BUS-6 is not about this game's panels.
 *
 * The criterion, stated so that a later edit cannot quietly fail it: **if making
 * this file pass ever requires changing the service, the service was not
 * generic**.
 */

/** A track circuit has detected a train in a section of line. */
type TrainEntered = { readonly type: 'trk/train-entered'; readonly section: string };

/** The last vehicle has left a section, and the circuit has gone clear again. */
type SectionCleared = { readonly type: 'trk/section-cleared'; readonly section: string };

/** The interlocking has decided what a signal may show. */
type AspectChanged = {
    readonly type: 'sig/aspect-changed';
    readonly signal: string;
    readonly aspect: 'danger' | 'caution' | 'clear';
};

/** The barriers at a level crossing have finished moving. */
type BarriersMoved = {
    readonly type: 'xng/barriers-moved';
    readonly crossing: string;
    readonly lowered: boolean;
};

/**
 * The union the box is wired with, assembled here exactly as BUS-14 says a game
 * assembles its own: each type carries the prefix of the equipment that produced
 * it, and the bus is told about the union only through its type parameter.
 */
type BoxEvent = TrainEntered | SectionCleared | AspectChanged | BarriersMoved;

/** One report of something that failed while the box was being displayed. */
interface Fault {
    readonly error: unknown;
    readonly event: BoxEvent;
}

/**
 * A signal box: a bus, and the fault log the signaller reads in the morning.
 *
 * The two travel together everywhere below — a box whose faults were somebody
 * else's would prove nothing about isolation — so they are one named thing
 * rather than two variables that happen to be declared next to each other.
 */
interface SignalBox {
    readonly box: EventBus<BoxEvent>;
    readonly faults: Fault[];
}

/**
 * Opens a box, with its fault log wired up.
 *
 * The fault log is what `onHandlerError` is in this domain — the required
 * argument answered by somebody who has never heard of this game, which is a
 * small part of the proof on its own. Built here rather than imported: this is
 * the fixture the ticket permits, in the invented domain's own vocabulary.
 */
function signalBox(): SignalBox {
    const faults: Fault[] = [];
    const box = createEventBus<BoxEvent>((error, event) => {
        faults.push({ error, event });
    });

    return { box, faults };
}

/**
 * The interlocking of this branch line, as one wiring function.
 *
 * A train entering the section beyond the home signal puts that signal back to
 * danger and lowers the barriers behind it; the section going clear releases
 * both again. Three generations of consequence from one track circuit, which is
 * what makes the delivery order below worth asserting rather than obvious.
 */
function interlockingOf(box: EventBus<BoxEvent>): void {
    box.on('orchestration', 'trk/train-entered', (event) => {
        box.publish({ type: 'sig/aspect-changed', signal: event.section, aspect: 'danger' });
    });

    box.on('orchestration', 'sig/aspect-changed', (event) => {
        // The payload's own fields, read with no cast at the subscription site:
        // the handler was given the one member of the union that carries this
        // discriminant, and `aspect` exists only on that member.
        if (event.aspect === 'danger') {
            box.publish({ type: 'xng/barriers-moved', crossing: event.signal, lowered: true });
        }
    });
}

describe('a signal box that has never heard of this game', () => {
    it('delivers a cascade in the order the consequences happened', () => {
        const { box } = signalBox();
        const worked: string[] = [];

        interlockingOf(box);
        box.onAny('orchestration', (event) => {
            worked.push(event.type);
        });

        box.publish({ type: 'trk/train-entered', section: 'weir-lane' });
        box.flush();

        // Generation by generation, and not down the call stack: the track
        // circuit, then what the interlocking made of it, then what that made of
        // the crossing.
        expect(worked).toEqual(['trk/train-entered', 'sig/aspect-changed', 'xng/barriers-moved']);
    });

    it('keeps the whole line of consequence in front of the interlocking before showing any of it', () => {
        const { box } = signalBox();
        const order: string[] = [];

        interlockingOf(box);
        box.onAny('orchestration', (event) => {
            order.push(`interlocking: ${event.type}`);
        });
        box.onAny('presentation', (event) => {
            order.push(`board: ${event.type}`);
        });

        box.publish({ type: 'trk/train-entered', section: 'weir-lane' });
        box.flush();

        // The whole point of the two phases, in a domain where getting it wrong
        // is a departure board announcing a train the interlocking was still
        // deciding about. Everything the equipment concluded comes first; the
        // board is shown the finished tick, in the same order, afterwards.
        expect(order).toEqual([
            'interlocking: trk/train-entered',
            'interlocking: sig/aspect-changed',
            'interlocking: xng/barriers-moved',
            'board: trk/train-entered',
            'board: sig/aspect-changed',
            'board: xng/barriers-moved',
        ]);
    });

    it('runs the box\'s own handlers in the order the box registered them', () => {
        const { box } = signalBox();
        const order: string[] = [];

        box.on('orchestration', 'trk/section-cleared', () => {
            order.push('release the crossing');
        });
        box.on('orchestration', 'trk/section-cleared', () => {
            order.push('clear the home signal');
        });
        box.onAny('orchestration', () => {
            order.push('the train register');
        });

        box.publish({ type: 'trk/section-cleared', section: 'weir-lane' });
        box.flush();

        // The register is written before anything acts on the movement, though
        // it was wired last: `onAny` first is a rule about the kind of
        // subscription, not about when the box happened to make it.
        expect(order).toEqual([
            'the train register',
            'release the crossing',
            'clear the home signal',
        ]);
    });

    it('takes a batch of movements in the order the line reported them', () => {
        const { box } = signalBox();
        const register: string[] = [];

        box.onAny('orchestration', (event) => {
            register.push(event.type);
        });

        box.publishAll([
            { type: 'trk/train-entered', section: 'weir-lane' },
            { type: 'trk/section-cleared', section: 'ashgate' },
        ]);

        // Queued and not yet delivered: a track circuit reporting does not, by
        // itself, run the interlocking.
        expect(register).toEqual([]);

        box.flush();

        expect(register).toEqual(['trk/train-entered', 'trk/section-cleared']);
    });

    it('records every movement of the tick once in the register, in order', () => {
        const { box } = signalBox();
        const register: string[] = [];

        interlockingOf(box);
        box.onAny('presentation', (event) => {
            register.push(event.type);
        });

        box.publish({ type: 'trk/train-entered', section: 'weir-lane' });
        box.publish({ type: 'trk/section-cleared', section: 'ashgate' });
        box.flush();

        // Once each, though the box was told about the movements in two calls
        // and the cascade added a third and a fourth. A register that showed the
        // tick twice would be a register of the bus rather than of the line.
        expect(register).toEqual([
            'trk/train-entered',
            'trk/section-cleared',
            'sig/aspect-changed',
            'xng/barriers-moved',
        ]);
    });

    it('lets the box take a lamp out of circuit and put it back', () => {
        const { box } = signalBox();
        const lit: string[] = [];

        const disconnect = box.on('presentation', 'sig/aspect-changed', (event) => {
            lit.push(event.aspect);
        });

        box.publish({ type: 'sig/aspect-changed', signal: 'weir-lane', aspect: 'danger' });
        box.flush();

        disconnect();

        box.publish({ type: 'sig/aspect-changed', signal: 'weir-lane', aspect: 'clear' });
        box.flush();

        // And again, on a lamp that is already out: the second disconnection
        // finds nothing and takes nothing else with it.
        disconnect();

        expect(lit).toEqual(['danger']);
    });
});

describe('when something in the box fails', () => {
    it('stops the tick when the interlocking itself fails', () => {
        const { box, faults } = signalBox();
        const worked: string[] = [];
        const relayStuck = new Error('the crossing relay did not answer');

        box.on('orchestration', 'trk/train-entered', () => {
            throw relayStuck;
        });
        box.on('orchestration', 'trk/train-entered', () => {
            worked.push('lower the barriers');
        });
        box.onAny('presentation', () => {
            worked.push('the board');
        });

        box.publish({ type: 'trk/train-entered', section: 'weir-lane' });

        // A rule of the interlocking that did not run is a consequence the line
        // is now missing, and a signal box that carried on regardless is the one
        // outcome nobody wants. The same sentence as this game's, with the
        // stakes supplied by somebody else's domain.
        expect(() => box.flush()).toThrow(relayStuck);
        expect(worked).toEqual([]);
        expect(faults).toEqual([]);
    });

    it('logs a fault and keeps the rest of the display alive when a lamp fails', () => {
        const { box, faults } = signalBox();
        const shown: string[] = [];
        const lampBurntOut = new Error('the danger lamp is dark');
        const cleared: SectionCleared = { type: 'trk/section-cleared', section: 'ashgate' };

        box.on('presentation', 'trk/section-cleared', () => {
            shown.push('the platform board');
        });
        box.on('presentation', 'trk/section-cleared', () => {
            throw lampBurntOut;
        });
        box.on('presentation', 'trk/section-cleared', () => {
            shown.push('the panel diagram');
        });

        box.publish(cleared);

        expect(() => box.flush()).not.toThrow();
        expect(shown).toEqual(['the platform board', 'the panel diagram']);

        // With the movement that caused it, which is the half the stack trace
        // cannot supply: the trace names the lamp, the payload names the
        // section it was showing.
        expect(faults).toEqual([{ error: lampBurntOut, event: cleared }]);
    });
});

describe('a cycle in the interlocking', () => {
    it('is refused, and the refusal names the equipment that is arguing', () => {
        const { box } = signalBox();

        // A wiring fault of a kind signal engineers really make: the signal
        // lowers the barriers, and the barriers put the signal back to danger.
        // Both halves are reasonable on their own and neither one ever settles.
        box.on('orchestration', 'sig/aspect-changed', (event) => {
            box.publish({ type: 'xng/barriers-moved', crossing: event.signal, lowered: true });
        });
        box.on('orchestration', 'xng/barriers-moved', (event) => {
            box.publish({
                type: 'sig/aspect-changed',
                signal: event.crossing,
                aspect: 'danger',
            });
        });

        box.publish({ type: 'sig/aspect-changed', signal: 'weir-lane', aspect: 'danger' });

        let thrown: unknown;
        try {
            box.flush();
        } catch (error) {
            thrown = error;
        }

        // This is the test in the file that would **hang** rather than fail if
        // the rail were not there, in an invented domain as much as in this one.
        expect(thrown).toBeInstanceOf(CausalDepthError);

        const refusal = thrown as CausalDepthError;

        expect(refusal.generations).toEqual([
            ['sig/aspect-changed'],
            ['xng/barriers-moved'],
            ['sig/aspect-changed'],
        ]);

        // The message is the whole diagnostic for somebody looking at a box that
        // has stopped answering, so it has to carry the invented names too — a
        // rail that could only name this game's events would be a rail for this
        // game.
        expect(refusal.message).toContain('sig/aspect-changed');
        expect(refusal.message).toContain('xng/barriers-moved');
    });
});

describe('two boxes on the same line', () => {
    it('do not observe each other', () => {
        // Ashgate and Weir Lane: neighbouring boxes on one branch, each with its
        // own frame, its own lamps and its own fault log. Everything the bus
        // keeps is inside one of them, and the practical test of that claim is
        // that neither can hear the other work.
        const ashgate = signalBox();
        const weirLane = signalBox();
        const atAshgate: string[] = [];
        const atWeirLane: string[] = [];

        ashgate.box.onAny('orchestration', (event) => {
            atAshgate.push(event.type);
        });
        ashgate.box.onAny('presentation', (event) => {
            atAshgate.push(event.type);
        });
        weirLane.box.onAny('orchestration', (event) => {
            atWeirLane.push(event.type);
        });
        weirLane.box.onAny('presentation', (event) => {
            atWeirLane.push(event.type);
        });

        ashgate.box.publish({ type: 'trk/train-entered', section: 'ashgate' });
        ashgate.box.flush();

        expect(atAshgate).toEqual(['trk/train-entered', 'trk/train-entered']);
        expect(atWeirLane).toEqual([]);

        // And the other way, on a bus that has already run a tick: a queue
        // shared through a module-level variable would show up here even if it
        // had survived the first half.
        weirLane.box.publish({ type: 'trk/section-cleared', section: 'weir-lane' });
        weirLane.box.flush();

        expect(atAshgate).toEqual(['trk/train-entered', 'trk/train-entered']);
        expect(atWeirLane).toEqual(['trk/section-cleared', 'trk/section-cleared']);
    });

    it('keep their faults to themselves', () => {
        const ashgate = signalBox();
        const weirLane = signalBox();
        const lampBurntOut = new Error('the danger lamp is dark');

        ashgate.box.onAny('presentation', () => {
            throw lampBurntOut;
        });
        weirLane.box.onAny('presentation', () => {
            // Ashgate's lamp is not Weir Lane's problem.
        });

        ashgate.box.publish({ type: 'trk/section-cleared', section: 'ashgate' });
        ashgate.box.flush();

        expect(ashgate.faults.map((fault) => fault.error)).toEqual([lampBurntOut]);
        expect(weirLane.faults).toEqual([]);
    });
});

describe('closing the box for the night', () => {
    it('leaves it wired to nothing', () => {
        const { box } = signalBox();
        const worked: string[] = [];

        interlockingOf(box);
        box.onAny('orchestration', (event) => {
            worked.push(event.type);
        });
        box.onAny('presentation', (event) => {
            worked.push(event.type);
        });

        box.dispose();

        box.publish({ type: 'trk/train-entered', section: 'weir-lane' });
        box.flush();

        expect(worked).toEqual([]);
    });

    it('throws away a movement reported after the box was closed down', () => {
        const { box } = signalBox();
        const worked: string[] = [];

        box.publish({ type: 'trk/train-entered', section: 'weir-lane' });
        box.dispose();

        // Wired after the shutdown, so the only thing that could reach it is a
        // movement the bus kept across it.
        box.onAny('orchestration', (event) => {
            worked.push(event.type);
        });
        box.flush();

        expect(worked).toEqual([]);
    });
});

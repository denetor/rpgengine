import { describe, expect, it } from 'vitest';
import { createEventBus } from './index';
import type { EventBus } from './index';

/**
 * The type-level spec (BUS-1, BUS-2).
 *
 * Two of the bus's rules are enforced by nothing that runs. *A payload is plain
 * data* and *a type outside the union cannot be subscribed to* are properties of
 * the compiler, and the only thing that can fail when they stop holding is a
 * compilation. That is what the `@ts-expect-error` directives below are: `npm
 * run typecheck` covers this file, and `tsc` fails on a directive that
 * suppressed nothing — so an assertion that has stopped catching anything breaks
 * the build instead of passing quietly.
 *
 * If these comments are ever deleted as redundant, both rules go unguarded at
 * once and nothing will say so.
 *
 * The runtime expectations at the bottom are there for a different reason: a
 * `*.spec.ts` with no test in it is a file nobody notices has stopped being run.
 */

/**
 * An identifier as the rest of the project will spell one: a branded `number`.
 *
 * It is here because the constraint has to reject what it rejects *without*
 * rejecting this. A brand is an intersection, so the value is still a `number`
 * and still plain data — and an event that could not carry an id would have
 * nothing to say about an entity (ARC-5.2).
 */
type EntityId = number & { readonly __brand: 'EntityId' };

/** What an event may carry: primitives, ids, nesting, arrays. */
type Furnished = {
    readonly type: 'demo/furnished';
    readonly room: EntityId;
    readonly lit: boolean;
    readonly nothing: null;
    readonly lamps: readonly string[];
    readonly light: { readonly warmth: number; readonly corners: readonly number[] };
};

type Closed = { readonly type: 'demo/closed' };

type DemoEvent = Furnished | Closed;

/** A payload holding a clock reading, whose methods are not plain data. */
type WithATimestamp = { readonly type: 'demo/closed'; readonly at: Date };

/** A payload holding a keyed collection, whose iteration order is nobody's (ARC-9.4). */
type WithAMap = { readonly type: 'demo/closed'; readonly lamps: ReadonlyMap<string, number> };

/** The same, without the values. */
type WithASet = { readonly type: 'demo/closed'; readonly rooms: ReadonlySet<string> };

/** A payload holding behaviour — a door out of the domain, handed over in a fact. */
type WithAFunction = { readonly type: 'demo/closed'; readonly measure: () => number };

/**
 * The same fields as `Closed`, declared the way most people declare a type.
 *
 * Only a `type` alias with an object literal gets the implicit index signature
 * the constraint needs; an `interface` does not, however impeccable its fields.
 * The compiler's error explains none of that, which is why the trap is asserted
 * here and why every event type in this project is a `type` alias.
 */
interface Interfaced {
    readonly type: 'demo/closed';
    readonly lamps: number;
}

/** Rethrows: nothing in this file is meant to hand it anything. */
function unreachable(error: unknown): void {
    throw error;
}

/**
 * The compile-time claims, gathered in a function that is referenced and never
 * called.
 *
 * They are assertions about a **compilation**: `tsc` has read this body by the
 * time any test runs, and each directive fails the build the day the error it
 * expects stops happening. Running it would add nothing and could not work
 * anyway — a phase that does not exist has no list of subscriptions to be added
 * to, which is precisely what the directive on that line is asserting.
 */
function compileTimeClaims(bus: EventBus<DemoEvent>): void {
    // No directive on this one, and that is the assertion: ids, nesting and
    // arrays go through. The day they stop, this line fails to compile.
    createEventBus<DemoEvent>(unreachable);

    // @ts-expect-error — a clock reading carries methods, and a method is not plain data.
    createEventBus<WithATimestamp>(unreachable);

    // @ts-expect-error — a keyed collection carries methods, and an iteration order nobody fixed.
    createEventBus<WithAMap>(unreachable);

    // @ts-expect-error — the same, without the values.
    createEventBus<WithASet>(unreachable);

    // @ts-expect-error — behaviour in a payload is a reference the domain would be handing out.
    createEventBus<WithAFunction>(unreachable);

    // @ts-expect-error — an `interface` gets no implicit index signature, so it is not a DomainEvent.
    createEventBus<Interfaced>(unreachable);

    // @ts-expect-error — no member of the union carries this type, so there is nothing to subscribe to.
    bus.on('orchestration', 'demo/opened', () => {});

    // @ts-expect-error — and a phase the bus does not have is not a phase.
    bus.onAny('rendering', () => {});
}

describe('the compile-time claims', () => {
    it('are checked by the compiler rather than by this run', () => {
        expect(compileTimeClaims).toBeTypeOf('function');
    });
});

describe('a subscriber', () => {
    it('is handed its own member of the union, narrowed', () => {
        const bus = createEventBus<DemoEvent>(unreachable);
        const seen: number[] = [];
        const room = 7 as EntityId;

        bus.on('orchestration', 'demo/furnished', (event) => {
            // Read without a cast, off a parameter nothing in this file typed:
            // `on` narrowed it to the one member with this discriminant.
            seen.push(event.light.warmth, event.light.corners.length, event.room);
        });

        bus.publish({
            type: 'demo/furnished',
            room,
            lit: true,
            nothing: null,
            lamps: ['sconce', 'lantern'],
            light: { warmth: 2, corners: [0, 1, 2] },
        });
        bus.flush();

        expect(seen).toEqual([2, 3, 7]);
    });
});

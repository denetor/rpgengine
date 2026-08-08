import { describe, expect, it } from 'vitest';
import { createClock } from './index';
import type { Clock, TimerId } from './index';

/**
 * The type-level spec (TIME-6, TIME-8).
 *
 * Two of the clock's rules are enforced by nothing that runs. *A timer's payload
 * is a domain event, and therefore plain data* and *a `TimerId` is opaque* are
 * properties of the compiler, and the only thing that can fail when they stop
 * holding is a compilation. That is what the `@ts-expect-error` directives below
 * are: `npm run typecheck` covers this file, and `tsc` fails on a directive that
 * suppressed nothing — so an assertion that has stopped catching anything breaks
 * the build instead of passing quietly.
 *
 * The first rule is what makes serializability a property of the type rather
 * than a promise in prose: a payload that a save could not hold is refused at
 * the `schedule()` call site, months before `SAVE` exists. If these directives
 * are ever deleted as redundant, that guarantee goes with them and nothing will
 * say so.
 *
 * The runtime expectations at the bottom are there for a different reason: a
 * `*.spec.ts` with no test in it is a file nobody notices has stopped being run.
 */

/**
 * An identifier as the rest of the project spells one: a branded `number`.
 *
 * It is here because the payload constraint has to reject what it rejects
 * *without* rejecting this. A brand is an intersection, so the value is still a
 * `number` and still plain data — and a timer that could not carry an id would
 * have nothing to say about the entity it is about (ARC-5.2).
 */
type EntityId = number & { readonly __brand: 'EntityId' };

/** What a timer may carry: primitives, ids, nesting, arrays. */
type Poisoned = {
    readonly type: 'demo/poisoned';
    readonly victim: EntityId;
    readonly lethal: boolean;
    readonly cure: null;
    readonly stacks: readonly string[];
    readonly dose: { readonly amount: number; readonly ticks: readonly number[] };
};

type Respawned = { readonly type: 'demo/respawned' };

type DemoEvent = Poisoned | Respawned;

/** A payload holding a clock reading, whose methods are not plain data. */
type WithATimestamp = { readonly type: 'demo/respawned'; readonly at: Date };

/** A payload holding a keyed collection, whose iteration order is nobody's (ARC-9.4). */
type WithAMap = { readonly type: 'demo/respawned'; readonly stacks: ReadonlyMap<string, number> };

/** The same, without the values. */
type WithASet = { readonly type: 'demo/respawned'; readonly victims: ReadonlySet<number> };

/**
 * A payload holding behaviour — the scheduler-with-callbacks this service was
 * built instead of, arriving by the back door.
 */
type WithAFunction = { readonly type: 'demo/respawned'; readonly onDue: () => void };

/**
 * The same fields as `Respawned`, declared the way most people declare a type.
 *
 * Only a `type` alias with an object literal gets the implicit index signature
 * the constraint needs; an `interface` does not, however impeccable its fields.
 * The compiler's error explains none of that, which is why the trap is asserted
 * here and why every event type in this project is a `type` alias.
 */
interface Interfaced {
    readonly type: 'demo/respawned';
    readonly attempts: number;
}

/**
 * The compile-time claims, gathered in a function that is referenced and never
 * called.
 *
 * They are assertions about a **compilation**: `tsc` has read this body by the
 * time any test runs, and each directive fails the build the day the error it
 * expects stops happening.
 */
function compileTimeClaims(clock: Clock<DemoEvent>, id: TimerId): void {
    // No directive on these two, and that is the assertion: ids, nesting and
    // arrays go through, and so does an event with no fields of its own. The
    // day they stop, these lines fail to compile.
    createClock<DemoEvent>();
    clock.schedule(100, { type: 'demo/respawned' });

    // @ts-expect-error — a clock reading carries methods, and a method is not plain data.
    createClock<WithATimestamp>();

    // @ts-expect-error — a keyed collection carries methods, and an iteration order nobody fixed.
    createClock<WithAMap>();

    // @ts-expect-error — the same, without the values.
    createClock<WithASet>();

    // @ts-expect-error — a callback in a payload is the scheduler this service was built instead of.
    createClock<WithAFunction>();

    // @ts-expect-error — an `interface` gets no implicit index signature, so it is not a DomainEvent.
    createClock<Interfaced>();

    // @ts-expect-error — a type outside the union is a timer nothing could ever be listening for.
    clock.schedule(100, { type: 'demo/looted' });

    // @ts-expect-error — an id is handed out by the clock, never computed by a caller.
    clock.cancel(1);

    // Which is the point of the brand rather than a nuisance: the id the clock
    // did hand out goes through with no cast at the call site.
    clock.cancel(id);
}

describe('the compile-time claims', () => {
    it('are checked by the compiler rather than by this run', () => {
        expect(compileTimeClaims).toBeTypeOf('function');
    });
});

describe('a scheduled event', () => {
    it('is handed back as the member of the union it was, narrowed', () => {
        const clock = createClock<DemoEvent>();
        const victim = 42 as EntityId;

        clock.schedule(100, {
            type: 'demo/poisoned',
            victim,
            lethal: false,
            cure: null,
            stacks: ['nightshade', 'nightshade'],
            dose: { amount: 3, ticks: [100, 200, 300] },
        });

        const [due] = clock.advance(100);

        // Read off the discriminant, with no cast: the batch is typed as the
        // game's own union, which is what makes a `switch` over it exhaustive
        // at the publishing site.
        expect(due.type).toBe('demo/poisoned');
        if (due.type === 'demo/poisoned') {
            expect(due.dose.ticks).toEqual([100, 200, 300]);
            expect(due.victim).toBe(42);
        }
    });
});

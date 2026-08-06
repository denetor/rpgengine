import { describe, expect, it } from 'vitest';
import { composeConfig } from './index';
import type { Problem } from './index';

/**
 * The type-level spec (CFG-8).
 *
 * What is asserted here is mostly asserted by **the compiler**: `npm run
 * typecheck` covers this file, and every `@ts-expect-error` below fails the
 * build the day the error it expects stops happening. The runtime expectations
 * are there because a `*.spec.ts` with no test in it is a file nobody notices
 * has stopped being run.
 *
 * The two details it pins are the ones a reader is most likely to "simplify",
 * and both were established by compiling the contract rather than by reasoning
 * about it: the `const` type parameter that makes the result a **tuple** rather
 * than an array of the union of every service's parameters, and the fallback —
 * and not the check — being where a slice's type comes from.
 */

interface OvenParameters {
    readonly temperature: number;
}

interface DeliveryParameters {
    readonly vans: number;
}

const OVEN_FALLBACK: OvenParameters = { temperature: 220 };

const DELIVERY_FALLBACK: DeliveryParameters = { vans: 2 };

/** A check that accepts anything: this file is about types, not about values. */
function accepts(): readonly Problem[] {
    return [];
}

const OVEN_SECTION = { key: 'oven', fallback: OVEN_FALLBACK, validate: accepts };

const DELIVERY_SECTION = { key: 'delivery', fallback: DELIVERY_FALLBACK, validate: accepts };

describe('the slices', () => {
    it('are typed one by one, in the order the shapes were given', () => {
        const [oven, delivery] = composeConfig([OVEN_SECTION, DELIVERY_SECTION], []);

        const anOven: OvenParameters = oven;
        const aDelivery: DeliveryParameters = delivery;

        expect([anOven.temperature, aDelivery.vans]).toEqual([220, 2]);
    });

    it('do not fit one another: a service cannot be handed somebody else’s', () => {
        const [, delivery] = composeConfig([OVEN_SECTION, DELIVERY_SECTION], []);

        // @ts-expect-error — the second slice is the deliveries', and the tuple knows it.
        const notAnOven: OvenParameters = delivery;

        expect(notAnOven).toEqual({ vans: 2 });
    });
});

describe('where a slice’s type comes from', () => {
    it('is the fallback, so a bare `undefined` types the slice `undefined`', () => {
        const [bare] = composeConfig([{ key: 'flour', fallback: undefined, validate: accepts }], []);

        // @ts-expect-error — `undefined` is the whole of that slice's type: a service
        // whose absent configuration is legitimate has to write the type out.
        const stillBare: typeof bare = 'type 00';

        expect(stillBare).toBe('type 00');
    });

    it('keeps the service’s own type when the fallback declares one', () => {
        const NO_FLOUR: string | undefined = undefined;

        const [flour] = composeConfig([{ key: 'flour', fallback: NO_FLOUR, validate: accepts }], [
            { name: 'bakery.json', values: { flour: 'type 00' } },
        ]);

        const kindOfFlour: string | undefined = flour;

        expect(kindOfFlour).toBe('type 00');
    });
});

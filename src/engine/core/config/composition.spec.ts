import { describe, expect, it } from 'vitest';
import { composeConfig } from './index';
import type { Problem } from './index';

/**
 * The composition itself: what a slice is made of, and in what order (CFG-4).
 *
 * Everything below enters through the service's one door, and the sections are
 * invented here — a bakery's oven and its deliveries — with checks of two or
 * three lines. A test that borrowed a real service's section would be
 * exercising two services at once and would fail for reasons belonging to
 * neither.
 *
 * No source is read: the sources are values, written in the file (CFG-14).
 */

interface OvenParameters {
    readonly temperature: number;
    readonly shelves: number;
}

/** The oven as it stands when nobody writes anything about it. */
const OVEN_FALLBACK: OvenParameters = { temperature: 220, shelves: 3 };

/** A check that accepts anything: this file is about composition, not refusal. */
function accepts(): readonly Problem[] {
    return [];
}

const OVEN_SECTION = {
    key: 'oven',
    fallback: OVEN_FALLBACK,
    validate: accepts,
};

interface DeliveryParameters {
    readonly vans: number;
    readonly routes: readonly string[];
    readonly stops: Readonly<Record<string, number>>;
}

/** A second section, carrying the two nested shapes a source might replace. */
const DELIVERY_FALLBACK: DeliveryParameters = {
    vans: 2,
    routes: ['north', 'south'],
    stops: { market: 3, station: 1 },
};

const DELIVERY_SECTION = {
    key: 'delivery',
    fallback: DELIVERY_FALLBACK,
    validate: accepts,
};

describe('the fallback', () => {
    it('composes a section no source mentions to the shape’s own fallback', () => {
        const [oven] = composeConfig([OVEN_SECTION], []);

        expect(oven).toEqual({ temperature: 220, shelves: 3 });
    });
});

describe('the precedence', () => {
    it('overlays a source that mentions the section onto the fallback', () => {
        const [oven] = composeConfig(
            [OVEN_SECTION],
            [{ name: 'bakery.json', values: { oven: { temperature: 240, shelves: 5 } } }],
        );

        expect(oven).toEqual({ temperature: 240, shelves: 5 });
    });

    it('applies the sources in the order they are given, each overriding the previous', () => {
        const [oven] = composeConfig(
            [OVEN_SECTION],
            [
                { name: 'base.json', values: { oven: { temperature: 240 } } },
                { name: 'local.json', values: { oven: { temperature: 260 } } },
            ],
        );

        expect(oven).toEqual({ temperature: 260, shelves: 3 });
    });

    it('leaves the keys a partial source does not mention at their previous value', () => {
        const [oven] = composeConfig(
            [OVEN_SECTION],
            [{ name: 'bakery.json', values: { oven: { shelves: 5 } } }],
        );

        expect(oven).toEqual({ temperature: 220, shelves: 5 });
    });

    it('leaves a section no source mentions alone while composing the one they do', () => {
        const [oven, delivery] = composeConfig(
            [OVEN_SECTION, DELIVERY_SECTION],
            [{ name: 'bakery.json', values: { oven: { temperature: 240 } } }],
        );

        expect(oven).toEqual({ temperature: 240, shelves: 3 });
        expect(delivery).toEqual(DELIVERY_FALLBACK);
    });
});

describe('the depth of the overlay', () => {
    it('replaces a list whole rather than merging it into the one it stands in for', () => {
        const [delivery] = composeConfig(
            [DELIVERY_SECTION],
            [{ name: 'bakery.json', values: { delivery: { routes: ['east'] } } }],
        );

        expect(delivery.routes).toEqual(['east']);
    });

    it('replaces a map whole, so that an entry can be removed and not only added', () => {
        const [delivery] = composeConfig(
            [DELIVERY_SECTION],
            [{ name: 'bakery.json', values: { delivery: { stops: { market: 4 } } } }],
        );

        expect(delivery.stops).toEqual({ market: 4 });
    });

    it('treats a section written as `undefined` as a value, and not as a silence', () => {
        const [delivery] = composeConfig(
            [DELIVERY_SECTION],
            [{ name: 'bakery.json', values: { delivery: undefined } }],
        );

        expect(delivery).toBeUndefined();
    });

    it('lets a value that is not an object replace whatever was there', () => {
        const [delivery] = composeConfig(
            [DELIVERY_SECTION],
            [{ name: 'bakery.json', values: { delivery: 'none' } }],
        );

        expect(delivery).toBe('none');
    });
});
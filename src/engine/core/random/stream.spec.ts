import { describe, expect, it } from 'vitest';
import { Random } from './index';
import type { RandomStream } from './index';

/**
 * The drawing primitives, observed through a constructed service: the same
 * seam as `random.spec.ts`. Nothing here knows how a uniform value becomes an
 * integer or a permutation.
 */

function streamOf(seed: number, id = 'test'): RandomStream {
    return new Random(seed).stream(id);
}

describe('shuffle', () => {
    it('returns a permutation without touching the input', () => {
        const stream = streamOf(14);
        const items = [1, 2, 3, 4, 5];

        const shuffled = stream.shuffle(items);

        expect(items).toEqual([1, 2, 3, 4, 5]);
        expect(shuffled).not.toBe(items);
        expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    });

    it('reaches every permutation about as often', () => {
        const stream = streamOf(15);
        const items = [0, 1, 2, 3];
        const permutations = 24;
        const rounds = 60_000;
        const counts = new Map<string, number>();

        for (let round = 0; round < rounds; round += 1) {
            const key = stream.shuffle(items).join('');
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        const expectedCount = rounds / permutations;
        expect(counts.size).toBe(permutations);
        for (const count of counts.values()) {
            expect(count).toBeGreaterThan(expectedCount * 0.85);
            expect(count).toBeLessThan(expectedCount * 1.15);
        }
    });

    it('consumes one value per element beyond the first', () => {
        const stream = streamOf(16);
        stream.shuffle([1, 2, 3, 4]);
        const afterShuffle = stream.next();

        const reference = streamOf(16);
        reference.next();
        reference.next();
        reference.next();

        expect(afterShuffle).toBe(reference.next());
    });

    it('leaves the sequence alone for a list too short to shuffle', () => {
        const stream = streamOf(17);
        expect(stream.shuffle([])).toEqual([]);
        expect(stream.shuffle(['only'])).toEqual(['only']);

        expect(stream.next()).toBe(streamOf(17).next());
    });
});

describe('weighted', () => {
    it('draws each outcome in proportion to its weight', () => {
        const stream = streamOf(10);
        const entries = [
            { value: 'common', weight: 3 },
            { value: 'rare', weight: 1 },
        ];
        const draws = 100_000;
        let rareCount = 0;

        for (let draw = 0; draw < draws; draw += 1) {
            if (stream.weighted(entries) === 'rare') {
                rareCount += 1;
            }
        }

        expect(rareCount / draws).toBeCloseTo(0.25, 2);
    });

    it('never draws an outcome of weight zero', () => {
        const stream = streamOf(11);
        const entries = [
            { value: 'possible', weight: 1 },
            { value: 'impossible', weight: 0 },
        ];

        for (let draw = 0; draw < 10_000; draw += 1) {
            expect(stream.weighted(entries)).toBe('possible');
        }
    });

    it('refuses an empty table and a table of no weight', () => {
        expect(() => streamOf(12).weighted([])).toThrow(/empty/);
        expect(() => streamOf(12).weighted([{ value: 'x', weight: 0 }])).toThrow(/weight/);
    });

    it('consumes exactly one value of the sequence', () => {
        const stream = streamOf(13);
        stream.weighted([
            { value: 'a', weight: 1 },
            { value: 'b', weight: 2 },
        ]);
        const afterWeighted = stream.next();

        const reference = streamOf(13);
        reference.next();

        expect(afterWeighted).toBe(reference.next());
    });
});

describe('pick', () => {
    it('returns an element of the list and reaches all of them', () => {
        const stream = streamOf(7);
        const items = ['sword', 'shield', 'potion'] as const;
        const seen = new Set<string>();

        for (let draw = 0; draw < 1000; draw += 1) {
            const picked = stream.pick(items);
            expect(items).toContain(picked);
            seen.add(picked);
        }

        expect(seen.size).toBe(items.length);
    });

    it('refuses an empty list', () => {
        expect(() => streamOf(8).pick([])).toThrow(/empty/);
    });

    it('consumes exactly one value of the sequence', () => {
        const stream = streamOf(9);
        stream.pick([1, 2, 3]);
        const afterPick = stream.next();

        const reference = streamOf(9);
        reference.next();

        expect(afterPick).toBe(reference.next());
    });
});

describe('bool', () => {
    it('is always false at probability 0 and always true at probability 1', () => {
        const stream = streamOf(4);

        for (let draw = 0; draw < 1000; draw += 1) {
            expect(stream.bool(0)).toBe(false);
            expect(stream.bool(1)).toBe(true);
        }
    });

    it('comes up true about as often as the probability says', () => {
        const stream = streamOf(5);
        const draws = 100_000;
        let trueCount = 0;

        for (let draw = 0; draw < draws; draw += 1) {
            if (stream.bool(0.25)) {
                trueCount += 1;
            }
        }

        expect(trueCount / draws).toBeCloseTo(0.25, 2);
    });

    it('consumes exactly one value of the sequence', () => {
        const stream = streamOf(6);
        stream.bool(0.5);
        const afterBool = stream.next();

        const reference = streamOf(6);
        reference.next();

        expect(afterBool).toBe(reference.next());
    });
});

describe('diceRoll', () => {
    it('stays inside [1, faces] for a single die', () => {
        const stream = streamOf(18);

        for (let roll = 0; roll < 10_000; roll += 1) {
            const value = stream.diceRoll(6);
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(1);
            expect(value).toBeLessThanOrEqual(6);
        }
    });

    it('reaches every face, the highest one included', () => {
        const stream = streamOf(19);
        const seen = new Set<number>();

        for (let roll = 0; roll < 1000; roll += 1) {
            seen.add(stream.diceRoll(6));
        }

        expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('rolls one die when the count is left out', () => {
        const stream = streamOf(20);
        const afterDefault = stream.diceRoll(20);

        const reference = streamOf(20);
        expect(reference.diceRoll(20, 1)).toBe(afterDefault);
    });

    it('sums the dice it rolls, and stays inside the reachable range', () => {
        const stream = streamOf(21);
        const faces = 6;
        const count = 3;

        for (let roll = 0; roll < 10_000; roll += 1) {
            const value = stream.diceRoll(faces, count);
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(count);
            expect(value).toBeLessThanOrEqual(faces * count);
        }
    });

    it('reaches both ends of the sum of several dice', () => {
        const stream = streamOf(22);
        const seen = new Set<number>();

        for (let roll = 0; roll < 20_000; roll += 1) {
            seen.add(stream.diceRoll(4, 2));
        }

        expect([...seen].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    });

    it('is flat over the faces of a single die', () => {
        const stream = streamOf(23);
        const faces = 6;
        const rolls = 60_000;
        const counts = new Map<number, number>();

        for (let roll = 0; roll < rolls; roll += 1) {
            const value = stream.diceRoll(faces);
            counts.set(value, (counts.get(value) ?? 0) + 1);
        }

        const expectedCount = rolls / faces;
        expect(counts.size).toBe(faces);
        for (const count of counts.values()) {
            expect(count).toBeGreaterThan(expectedCount * 0.9);
            expect(count).toBeLessThan(expectedCount * 1.1);
        }
    });

    it('peaks in the middle for two dice, as a sum should', () => {
        const stream = streamOf(24);
        const rolls = 60_000;
        const counts = new Map<number, number>();

        for (let roll = 0; roll < rolls; roll += 1) {
            const value = stream.diceRoll(6, 2);
            counts.set(value, (counts.get(value) ?? 0) + 1);
        }

        // Of the 36 outcomes of 2d6, one sums to 2 and six sum to 7.
        expect((counts.get(7) ?? 0) / rolls).toBeCloseTo(6 / 36, 2);
        expect((counts.get(2) ?? 0) / rolls).toBeCloseTo(1 / 36, 2);
    });

    it('always gives one face back for a one-faced die', () => {
        const stream = streamOf(25);

        for (let roll = 0; roll < 1000; roll += 1) {
            expect(stream.diceRoll(1)).toBe(1);
            expect(stream.diceRoll(1, 4)).toBe(4);
        }
    });

    it('consumes one value of the sequence per die', () => {
        const stream = streamOf(26);
        stream.diceRoll(6, 3);
        const afterRoll = stream.next();

        const reference = streamOf(26);
        reference.next();
        reference.next();
        reference.next();

        expect(afterRoll).toBe(reference.next());
    });

    it('leaves the sequence alone for a count of zero', () => {
        const stream = streamOf(27);

        expect(stream.diceRoll(6, 0)).toBe(0);
        expect(stream.next()).toBe(streamOf(27).next());
    });

    it('refuses a die that has no faces to land on', () => {
        const stream = streamOf(28);

        expect(() => stream.diceRoll(0)).toThrow(/faces/);
        expect(() => stream.diceRoll(-6)).toThrow(/faces/);
    });

    it('refuses a die whose faces are not whole', () => {
        const stream = streamOf(29);

        expect(() => stream.diceRoll(6.5)).toThrow(/faces/);
        expect(() => stream.diceRoll(Number.NaN)).toThrow(/faces/);
        expect(() => stream.diceRoll(Number.POSITIVE_INFINITY)).toThrow(/faces/);
    });

    it('refuses a count that is negative or not whole', () => {
        const stream = streamOf(30);

        expect(() => stream.diceRoll(6, -1)).toThrow(/dice/);
        expect(() => stream.diceRoll(6, 2.5)).toThrow(/dice/);
        expect(() => stream.diceRoll(6, Number.NaN)).toThrow(/dice/);
        expect(() => stream.diceRoll(6, Number.POSITIVE_INFINITY)).toThrow(/dice/);
    });

    it('reports the value it refused', () => {
        expect(() => streamOf(31).diceRoll(0)).toThrow(/got 0/);
        expect(() => streamOf(31).diceRoll(6, -2)).toThrow(/got -2/);
    });

    it('leaves the sequence untouched when it refuses a roll', () => {
        const stream = streamOf(32);

        expect(() => stream.diceRoll(0)).toThrow();
        expect(() => stream.diceRoll(6, -1)).toThrow();
        expect(() => stream.diceRoll(-1, 3)).toThrow();

        expect(stream.next()).toBe(streamOf(32).next());
    });

    it('checks the faces before rolling any die at all', () => {
        const stream = streamOf(33);

        // A count of zero would consume nothing anyway: the point is that the
        // faces are refused on their own merits, not because nothing was rolled.
        expect(() => stream.diceRoll(0, 0)).toThrow(/faces/);
    });
});

describe('int', () => {
    it('stays inside the half-open range', () => {
        const stream = streamOf(1);

        for (let draw = 0; draw < 10_000; draw += 1) {
            const value = stream.int(3, 7);
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(3);
            expect(value).toBeLessThan(7);
        }
    });

    it('reaches every value of the range', () => {
        const stream = streamOf(2);
        const seen = new Set<number>();

        for (let draw = 0; draw < 1000; draw += 1) {
            seen.add(stream.int(0, 6));
        }

        expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('consumes exactly one value of the sequence', () => {
        const stream = streamOf(3);
        stream.int(0, 100);
        const afterInt = stream.next();

        const reference = streamOf(3);
        reference.next();

        expect(afterInt).toBe(reference.next());
    });
});

describe('gaussian', () => {
    it('centres its values on the mean', () => {
        const stream = streamOf(34);
        let sum = 0;

        for (let draw = 0; draw < 10_000; draw += 1) {
            sum += stream.gaussian(10, 2);
        }

        expect(sum / 10_000).toBeGreaterThan(9.9);
        expect(sum / 10_000).toBeLessThan(10.1);
    });

    it('never leaves the six standard deviations the method can reach', () => {
        const stream = streamOf(35);

        for (let draw = 0; draw < 20_000; draw += 1) {
            const value = stream.gaussian(0, 1);
            expect(value).toBeGreaterThanOrEqual(-6);
            expect(value).toBeLessThanOrEqual(6);
        }
    });

    it('returns the mean itself for a standard deviation of zero', () => {
        const stream = streamOf(36);

        expect(stream.gaussian(7, 0)).toBe(7);
    });

    it('keeps every value inside the truncation interval', () => {
        const stream = streamOf(37);
        let touchedLow = 0;
        let touchedHigh = 0;

        for (let draw = 0; draw < 10_000; draw += 1) {
            const value = stream.gaussian(0, 3, [-1, 2]);
            expect(value).toBeGreaterThanOrEqual(-1);
            expect(value).toBeLessThanOrEqual(2);
            if (value === -1) {
                touchedLow += 1;
            }
            if (value === 2) {
                touchedHigh += 1;
            }
        }

        // Truncation is a clamp, so both bounds are reached rather than avoided.
        expect(touchedLow).toBeGreaterThan(0);
        expect(touchedHigh).toBeGreaterThan(0);
    });

    it('consumes twelve values of the sequence, truncated or not', () => {
        const stream = streamOf(38);
        stream.gaussian(0, 1);
        stream.gaussian(50, 12, [40, 60]);
        const afterGaussians = stream.next();

        const reference = streamOf(38);
        for (let draw = 0; draw < 24; draw += 1) {
            reference.next();
        }

        expect(afterGaussians).toBe(reference.next());
    });

    it('refuses a standard deviation that is negative or not finite', () => {
        const stream = streamOf(39);

        expect(() => stream.gaussian(0, -1)).toThrow(/standard deviation/);
        expect(() => stream.gaussian(0, Number.NaN)).toThrow(/standard deviation/);
        expect(() => stream.gaussian(0, Number.POSITIVE_INFINITY)).toThrow(/standard deviation/);
    });

    it('refuses a mean that is not finite', () => {
        const stream = streamOf(40);

        expect(() => stream.gaussian(Number.NaN, 1)).toThrow(/mean/);
        expect(() => stream.gaussian(Number.POSITIVE_INFINITY, 1)).toThrow(/mean/);
    });

    it('refuses a truncation interval that is empty or not finite', () => {
        const stream = streamOf(41);

        expect(() => stream.gaussian(0, 1, [2, -2])).toThrow(/truncation/);
        expect(() => stream.gaussian(0, 1, [Number.NaN, 2])).toThrow(/truncation/);
        expect(() => stream.gaussian(0, 1, [-2, Number.POSITIVE_INFINITY])).toThrow(/truncation/);
    });

    it('accepts a truncation interval of a single point', () => {
        const stream = streamOf(42);

        expect(stream.gaussian(0, 1, [3, 3])).toBe(3);
    });

    it('reports the value it refused', () => {
        expect(() => streamOf(43).gaussian(0, -2)).toThrow(/got -2/);
    });

    it('leaves the sequence untouched when it refuses a call', () => {
        const stream = streamOf(44);

        expect(() => stream.gaussian(0, -1)).toThrow();
        expect(() => stream.gaussian(Number.NaN, 1)).toThrow();
        expect(() => stream.gaussian(0, 1, [2, -2])).toThrow();

        expect(stream.next()).toBe(streamOf(44).next());
    });
});

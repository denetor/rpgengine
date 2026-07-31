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

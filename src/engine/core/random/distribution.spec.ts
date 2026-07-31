import { describe, expect, it } from 'vitest';
import { Random } from './index';

/**
 * Uniformity of the values the service produces, measured with Pearson's χ²
 * on buckets.
 *
 * The bounds are the two-sided 0.1% critical values of the χ² distribution for
 * the given degrees of freedom: a statistic above the upper bound means the
 * buckets are too uneven, one below the lower bound means they are too even —
 * a sequence that spreads itself more regularly than chance would is not
 * random either. The seed is fixed, so the outcome does not vary from run to
 * run.
 */

/** χ² critical values for the bucket counts used here, at p = 0.001. */
const CRITICAL_VALUES = {
    /** 99 degrees of freedom: 100 buckets. */
    hundredBuckets: { lower: 61.92, upper: 148.23 },
    /** 5 degrees of freedom: 6 buckets. */
    sixBuckets: { lower: 0.21, upper: 20.52 },
};

function chiSquared(counts: readonly number[], expectedCount: number): number {
    let statistic = 0;
    for (const count of counts) {
        const deviation = count - expectedCount;
        statistic += (deviation * deviation) / expectedCount;
    }
    return statistic;
}

describe('uniformity', () => {
    it('spreads next() evenly over one hundred buckets', () => {
        const stream = new Random(20250731).stream('uniformity');
        const buckets = 100;
        const draws = 1_000_000;
        const counts = new Array<number>(buckets).fill(0);
        let lowest = Number.POSITIVE_INFINITY;
        let highest = Number.NEGATIVE_INFINITY;

        for (let draw = 0; draw < draws; draw += 1) {
            const value = stream.next();
            lowest = Math.min(lowest, value);
            highest = Math.max(highest, value);
            counts[Math.floor(value * buckets)] += 1;
        }

        expect(lowest).toBeGreaterThanOrEqual(0);
        expect(highest).toBeLessThan(1);

        const statistic = chiSquared(counts, draws / buckets);
        expect(statistic).toBeGreaterThan(CRITICAL_VALUES.hundredBuckets.lower);
        expect(statistic).toBeLessThan(CRITICAL_VALUES.hundredBuckets.upper);
    }, 30_000);

    it('spreads int() evenly over the values of its range', () => {
        const stream = new Random(20250731).stream('uniformity');
        const buckets = 6;
        const draws = 600_000;
        const counts = new Array<number>(buckets).fill(0);

        for (let draw = 0; draw < draws; draw += 1) {
            counts[stream.int(0, buckets)] += 1;
        }

        const statistic = chiSquared(counts, draws / buckets);
        expect(statistic).toBeGreaterThan(CRITICAL_VALUES.sixBuckets.lower);
        expect(statistic).toBeLessThan(CRITICAL_VALUES.sixBuckets.upper);
    });
});

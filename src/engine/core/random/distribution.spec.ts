import { describe, expect, it } from 'vitest';
import { Random } from './index';
import type { RandomStream, Truncation } from './index';

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

/**
 * The shape of the Gaussian, measured over the 10⁵ samples RND-6 asks for.
 *
 * The tolerances are wide compared with the standard error of an estimate over
 * that many samples — 1/√10⁵ ≈ 0.003 σ for the mean — so a passing run means
 * the shape is right, not that the seed was kind.
 */
describe('gaussian', () => {
    const SAMPLES = 100_000;

    it('has the mean and the standard deviation it was asked for', () => {
        const stream = new Random(20250801).stream('gaussian');
        const values = sampleGaussians(stream, SAMPLES, 20, 4);

        expect(meanOf(values)).toBeCloseTo(20, 1);
        expect(standardDeviationOf(values)).toBeCloseTo(4, 1);
    });

    it('puts about two thirds of its samples within one standard deviation', () => {
        const stream = new Random(20250801).stream('gaussian');
        const values = sampleGaussians(stream, SAMPLES, 0, 1);

        const withinOne = proportionWithin(values, 1);
        const withinTwo = proportionWithin(values, 2);

        // A true normal gives 0.6827 and 0.9545. The sum of twelve uniforms is
        // marginally flatter around one σ — its excess kurtosis is -0.1 — and
        // lands near 0.679 instead: the same family of accepted deviation as
        // the ±6σ tails (ADR 0001), and far below what any of RND-6's uses can
        // tell apart. The tolerance covers that gap and the sampling error.
        expect(withinOne).toBeCloseTo(0.679, 2);
        expect(withinTwo).toBeCloseTo(0.9545, 2);
    });

    it('reaches neither below -6σ nor above +6σ', () => {
        const stream = new Random(20250801).stream('gaussian');
        const values = sampleGaussians(stream, SAMPLES, 0, 1);

        expect(lowestOf(values)).toBeGreaterThanOrEqual(-6);
        expect(highestOf(values)).toBeLessThanOrEqual(6);
    });

    it('leaves the mean where it was when the truncation is symmetric', () => {
        const stream = new Random(20250801).stream('gaussian');
        const values = sampleGaussians(stream, SAMPLES, 20, 4, [12, 28]);

        expect(meanOf(values)).toBeCloseTo(20, 1);
        // The clamp folds the tails onto the bounds: the spread shrinks, which
        // is what truncation is for, while the centre stays put.
        expect(standardDeviationOf(values)).toBeLessThan(4);
    });

    it('shifts the mean towards the interval when the truncation is one-sided', () => {
        const stream = new Random(20250801).stream('gaussian');
        const values = sampleGaussians(stream, SAMPLES, 20, 4, [20, 40]);

        // Asked for by the caller, not an error of the method: half the
        // distribution is folded onto the lower bound.
        expect(meanOf(values)).toBeGreaterThan(21);
        expect(lowestOf(values)).toBeGreaterThanOrEqual(20);
    });
});

function sampleGaussians(
    stream: RandomStream,
    count: number,
    mean: number,
    stdDev: number,
    clamp?: Truncation,
): number[] {
    const values: number[] = [];
    for (let sample = 0; sample < count; sample += 1) {
        values.push(stream.gaussian(mean, stdDev, clamp));
    }
    return values;
}

function meanOf(values: readonly number[]): number {
    let sum = 0;
    for (const value of values) {
        sum += value;
    }
    return sum / values.length;
}

/** The share of the samples that fall within `deviations` of zero. */
function proportionWithin(values: readonly number[], deviations: number): number {
    let inside = 0;
    for (const value of values) {
        if (value > -deviations && value < deviations) {
            inside += 1;
        }
    }
    return inside / values.length;
}

function lowestOf(values: readonly number[]): number {
    let lowest = Number.POSITIVE_INFINITY;
    for (const value of values) {
        lowest = Math.min(lowest, value);
    }
    return lowest;
}

function highestOf(values: readonly number[]): number {
    let highest = Number.NEGATIVE_INFINITY;
    for (const value of values) {
        highest = Math.max(highest, value);
    }
    return highest;
}

function standardDeviationOf(values: readonly number[]): number {
    const mean = meanOf(values);
    let sumOfSquares = 0;
    for (const value of values) {
        sumOfSquares += (value - mean) * (value - mean);
    }
    return Math.sqrt(sumOfSquares / values.length);
}

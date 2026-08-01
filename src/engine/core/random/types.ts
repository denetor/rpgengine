/** The name of a stream: a usage domain, chosen by the caller. */
export type StreamId = string;

/** One entry of a weighted table. */
export interface WeightedEntry<T> {
    value: T;
    weight: number;
}

/**
 * The interval a Gaussian may be truncated to: **low bound first**.
 *
 * A pair and not a `{ low, high }` object, because that is the shape the
 * contract sheet fixes; naming the type is what keeps the order of the two
 * numbers written down in one place instead of at every call site.
 */
export type Truncation = readonly [number, number];

/**
 * One independent sequence of random values.
 *
 * Every primitive listed here **advances** the stream (RND-18): they are the
 * sequence. The primitives that do not — `noise2`, `fbm2` — are not part of
 * this interface yet.
 */
export interface RandomStream {
    /** A uniform value in [0, 1). */
    next(): number;

    /** An integer in [minIncl, maxExcl). */
    int(minIncl: number, maxExcl: number): number;

    /** True with the given probability. */
    bool(probability: number): boolean;

    /**
     * The sum of `count` dice of `faces` faces each, every die in [1, faces].
     * One die by default; a count of zero rolls nothing and sums to zero.
     */
    diceRoll(faces: number, count?: number): number;

    /**
     * A value drawn from a normal distribution of the given mean and standard
     * deviation, optionally clamped to `[low, high]`.
     *
     * It is a **sum of twelve uniforms**, not Box–Muller, and it consumes
     * twelve values of the sequence. The tails therefore stop at ±6σ, and the
     * truncation clamps rather than redraws — both accepted, both explained in
     * ADR 0001 and at `toGaussian`.
     */
    gaussian(mean: number, stdDev: number, clamp?: Truncation): number;

    /** One element of the list, uniformly. Throws on an empty list. */
    pick<T>(items: readonly T[]): T;

    /**
     * One value of the table, with probability proportional to its weight.
     * An entry of weight zero never comes up.
     */
    weighted<T>(entries: readonly WeightedEntry<T>[]): T;

    /** A permutation of the list, in a new array: the input is not touched. */
    shuffle<T>(items: readonly T[]): T[];
}

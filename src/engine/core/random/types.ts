/** The name of a stream: a usage domain, chosen by the caller. */
export type StreamId = string;

/** One entry of a weighted table. */
export interface WeightedEntry<T> {
    value: T;
    weight: number;
}

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

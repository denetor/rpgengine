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
 * How a single sample of coherent noise is placed.
 *
 * `frequency` scales the coordinates before sampling: sampling at frequency 2
 * is the same as sampling twice as far out. It is the one knob a plain sample
 * has — the size of the features, in coordinates the caller already thinks in.
 */
export interface NoiseOptions {
    /** Coordinate scale. Default 1; must be finite and positive. */
    frequency?: number;
}

/**
 * How a sum of octaves is built, on top of where it is sampled.
 *
 * The two extra knobs belong to `fbm2` alone, and they are a separate type on
 * purpose: passing a `persistence` to `noise2`, which has no octaves to spread
 * it over, is a mistake worth catching when the code is written rather than
 * ignoring when it runs.
 */
export interface FbmOptions extends NoiseOptions {
    /** How much faster each octave is than the one before. Default 2. */
    lacunarity?: number;

    /** How much quieter each octave is than the one before. Default 0.5. */
    persistence?: number;
}

/**
 * One independent sequence of random values.
 *
 * Every primitive listed here **advances** the stream (RND-18) — they are the
 * sequence — **except `noise2` and `fbm2`**, which are pure functions of the
 * stream's seed and the coordinates given, and read nothing that moves.
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

    /**
     * Coherent noise at `(x, y)`, in [-1, 1]: a value that varies **gradually**
     * from one point to the next, for elevation, biomes, resource density.
     *
     * It **consumes nothing** (RND-18). It depends only on the stream's seed
     * and the coordinates, never on how many samples came before or in which
     * order they were taken, so a portion of a map can be regenerated on its
     * own and comes out identical (RND-7).
     */
    noise2(x: number, y: number, options?: NoiseOptions): number;

    /**
     * `octaves` octaves of `noise2` summed at `(x, y)`, in [-1, 1]: detail at
     * several scales at once, each octave `lacunarity` times faster and
     * `persistence` times quieter than the one before.
     *
     * Consumes nothing, exactly like `noise2`.
     */
    fbm2(x: number, y: number, octaves: number, options?: FbmOptions): number;
}

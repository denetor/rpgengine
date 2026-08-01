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
 * How hard a filtered channel pushes back against repetition (RND-10).
 *
 * The two numbers are read together: a draw costs an outcome `1 - reduction` of
 * its weight, and `recovery` says over how many draws it gets that back. They
 * are **placeholders to be tuned by watching the sequences produced**, not
 * balancing constants the service is entitled to have an opinion about
 * (ARC-3.2) — which is why they arrive as data and have no defaults here.
 */
export interface FilterProfile {
    /**
     * What an outcome's weight is multiplied by when it comes up. In (0, 1]:
     * zero would rule the outcome out for ever, which is the re-roll rule ADR
     * 0002 rejects, wearing a different hat.
     */
    reduction: number;

    /**
     * Over how many draws an outcome reduced **once, from full weight** returns
     * to its nominal weight. At least one.
     *
     * It sets a fixed step, `(1 - reduction) / recovery`, added on every draw
     * that lands elsewhere. An outcome that has come up several times therefore
     * climbs back in fewer draws than the number of reductions would suggest:
     * the filter leans hard on a repeat and then lets go.
     */
    recovery: number;
}

/**
 * One channel→profile rule (RND-10).
 *
 * Channel names are invented at runtime and cannot be listed in a file, so a
 * rule matches a **prefix**: `'lockpick:*'` governs every channel that begins
 * with `'lockpick:'`. Without the `*` it matches the whole name and nothing
 * else. The most specific match wins.
 */
export interface FilterRule {
    channel: string;
    profile: string;
}

/**
 * The filter's data (RND-10), which the game keeps in `game/balance/random.json`
 * and hands to the constructor already parsed: the service reads no files
 * (ARC-4.1).
 *
 * The configuration as a whole is **optional**, and without it the filter is
 * inactive — `filtered()` is then exactly `weighted()` (RND-21). That is the
 * absence of the feature, not a balancing default in disguise, and it is what
 * lets the reusability proof run with no configuration at all (ARC-3.4).
 */
export interface FilterConfig {
    /** The profile for a channel no rule claims. Mandatory, and must exist. */
    default: string;

    profiles: Record<string, FilterProfile>;

    /** Matched most-specific-first; ties go to the one declared earlier. */
    rules?: FilterRule[];
}

/**
 * One live channel and the profile resolved for it — the answer `channels()`
 * gives (RND-21).
 *
 * `profile` is `UNFILTERED_PROFILE` when the service was built without a
 * configuration, which is the case this diagnostic exists to make visible.
 */
export interface ChannelReport {
    channel: string;
    profile: string;
}

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
     * One value of the table, drawn against the **current** weights that the
     * service remembers for `channel` rather than the nominal ones: what has
     * just come up is less likely to come up again, and recovers over the
     * following draws (RND-9).
     *
     * Consumes exactly one value of the sequence, like `weighted` — there is no
     * re-roll loop, and there must never be one (ADR 0002).
     *
     * **The channel is the caller's choice of granularity** (RND-15).
     * `'lockpick:door:42'` gives that door an anti-repetition memory of its
     * own; `'lockpick'` makes every door share one. The service infers nothing:
     * it keeps one memory per distinct name, and the boundary between sequences
     * is where the caller puts it.
     *
     * With no filter configuration this is exactly `weighted` (RND-21).
     */
    filtered<T>(channel: string, entries: readonly WeightedEntry<T>[]): T;

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

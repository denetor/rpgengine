import {
    assertFbm2,
    assertNoise2,
    buildPermutation,
    DEFAULT_FREQUENCY,
    DEFAULT_LACUNARITY,
    DEFAULT_PERSISTENCE,
    fbmNoise,
    perlin2,
} from './noise';
import {
    assertDiceRoll,
    assertGaussian,
    assertWeightedTable,
    GAUSSIAN_DRAWS,
    toBool,
    toGaussian,
    toInt,
    toPick,
    toShuffle,
    toWeighted,
} from './transforms';
import type { Channels } from './channels';
import { nextUint32, stateFromSeed, toUnitInterval } from './xoshiro128';
import type { Permutation } from './noise';
import type { FbmOptions, NoiseOptions, RandomStream, Truncation, WeightedEntry } from './types';

/**
 * A single stream: a generator state, plus the transformations that read
 * values out of it.
 *
 * The impurity is confined to `next()` — the only method that advances the
 * state (RND-17).
 *
 * A stream is built either from a seed or from a saved position, never from
 * nothing: the two factories are the only ways in, so no stream can exist
 * without a state of its own. Both ways in need the **seed** as well as the
 * position, because the noise permutation table is derived from the seed and
 * is deliberately absent from the save (RND-22).
 */
export class Stream implements RandomStream {
    private readonly state: Uint32Array;

    /**
     * Built **once, here**, when the stream comes into existence (RND-18), and
     * read-only from then on: that is what makes `noise2` a pure function of
     * the seed and the coordinates.
     */
    private readonly permutation: Permutation;

    /**
     * The service's channel memories, shared with every other stream: a channel
     * is named by the caller and belongs to the service, not to whichever
     * stream happened to draw from it (RND-15).
     */
    private readonly channels: Channels;

    private constructor(state: Uint32Array, seed: number, channels: Channels) {
        this.state = state;
        this.permutation = buildPermutation(seed);
        this.channels = channels;
    }

    /** A stream at the start of the sequence the seed identifies. */
    static fromSeed(seed: number, channels: Channels): Stream {
        return new Stream(stateFromSeed(seed), seed, channels);
    }

    /**
     * A stream at the position a saved state describes (RND-22), belonging to
     * the stream that `seed` identifies.
     *
     * The words are taken as they are: whoever calls this has already had them
     * checked by `assertRandomState`, the one place that knows what a usable
     * generator state looks like. The seed comes from the caller too — it is
     * not in the save unless it was explicit, because it is `hash(root seed,
     * id)` and restore recomputes it (RND-19).
     */
    static fromWords(words: readonly number[], seed: number, channels: Channels): Stream {
        return new Stream(Uint32Array.from(words), seed, channels);
    }

    /**
     * The current position in the sequence, as plain numbers: a copy, so that
     * drawing afterwards does not move a state already handed out.
     */
    snapshot(): number[] {
        return Array.from(this.state);
    }

    next(): number {
        return toUnitInterval(nextUint32(this.state));
    }

    int(minIncl: number, maxExcl: number): number {
        return toInt(this.next(), minIncl, maxExcl);
    }

    bool(probability: number): boolean {
        return toBool(this.next(), probability);
    }

    diceRoll(faces: number, count: number = 1): number {
        assertDiceRoll(faces, count);

        let sum: number = 0;
        for (let i = 0; i < count; i++) {
            sum += toInt(this.next(), 1, faces+1);
        }
        return sum;
    }

    gaussian(mean: number, stdDev: number, clamp?: Truncation): number {
        assertGaussian(mean, stdDev, clamp);

        const uniforms: number[] = [];
        for (let draw = 0; draw < GAUSSIAN_DRAWS; draw += 1) {
            uniforms.push(this.next());
        }
        return toGaussian(uniforms, mean, stdDev, clamp);
    }

    pick<T>(items: readonly T[]): T {
        return toPick(this.next(), items);
    }

    /**
     * The table is checked **before** the draw, like a dice roll's bounds: a
     * refused table must leave the sequence exactly where it was, or the same
     * seed would produce different games depending on whether a caller's bug
     * was hit (RND-18).
     */
    weighted<T>(entries: readonly WeightedEntry<T>[]): T {
        assertWeightedTable(entries);

        return toWeighted(this.next(), entries);
    }

    /**
     * Checked before the draw for the same reason as `weighted` — and, on top
     * of that, so that the message names the caller's own weight rather than
     * the weight after the channel's memory has scaled it.
     *
     * Then exactly one value, once, for the whole draw: no re-roll loop
     * (ADR 0002).
     */
    filtered<T>(channel: string, entries: readonly WeightedEntry<T>[]): T {
        assertWeightedTable(entries);

        return this.channels.draw(channel, entries, this.next());
    }

    shuffle<T>(items: readonly T[]): T[] {
        const draws = Math.max(0, items.length - 1);
        const uniforms: number[] = [];
        for (let index = 0; index < draws; index += 1) {
            uniforms.push(this.next());
        }
        return toShuffle(items, uniforms);
    }

    /**
     * Note what is missing: no call to `this.next()`. Sampling reads the
     * permutation table and the coordinates, and nothing else (RND-18).
     *
     * The defaults are filled in **here**, once, and settled numbers are what
     * travel onwards: the check and the sample then read the same values, and
     * neither re-resolves the options bag on a path the sheet sizes at 10⁶
     * samples per generated map.
     */
    noise2(x: number, y: number, options?: NoiseOptions): number {
        const frequency = options?.frequency ?? DEFAULT_FREQUENCY;
        assertNoise2(x, y, frequency);

        return perlin2(this.permutation, x, y, frequency);
    }

    fbm2(x: number, y: number, octaves: number, options?: FbmOptions): number {
        const frequency = options?.frequency ?? DEFAULT_FREQUENCY;
        const lacunarity = options?.lacunarity ?? DEFAULT_LACUNARITY;
        const persistence = options?.persistence ?? DEFAULT_PERSISTENCE;
        assertFbm2(x, y, octaves, frequency, lacunarity, persistence);

        return fbmNoise(
            this.permutation,
            x,
            y,
            octaves,
            frequency,
            lacunarity,
            persistence,
        );
    }
}

import {
    assertDiceRoll,
    assertGaussian,
    GAUSSIAN_DRAWS,
    toBool,
    toGaussian,
    toInt,
    toPick,
    toShuffle,
    toWeighted,
} from './transforms';
import { nextUint32, stateFromSeed, toUnitInterval } from './xoshiro128';
import type { RandomStream, Truncation, WeightedEntry } from './types';

/**
 * A single stream: a generator state, plus the transformations that read
 * values out of it.
 *
 * The impurity is confined to `next()` — the only method that advances the
 * state (RND-17).
 *
 * A stream is built either from a seed or from a saved position, never from
 * nothing: the two factories are the only ways in, so no stream can exist
 * without a state of its own.
 */
export class Stream implements RandomStream {
    private readonly state: Uint32Array;

    private constructor(state: Uint32Array) {
        this.state = state;
    }

    /** A stream at the start of the sequence the seed identifies. */
    static fromSeed(seed: number): Stream {
        return new Stream(stateFromSeed(seed));
    }

    /**
     * A stream at the position a saved state describes (RND-22).
     *
     * The words are taken as they are: whoever calls this has already had them
     * checked by `assertRandomState`, the one place that knows what a usable
     * generator state looks like.
     */
    static fromWords(words: readonly number[]): Stream {
        return new Stream(Uint32Array.from(words));
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

    weighted<T>(entries: readonly WeightedEntry<T>[]): T {
        return toWeighted(this.next(), entries);
    }

    shuffle<T>(items: readonly T[]): T[] {
        const draws = Math.max(0, items.length - 1);
        const uniforms: number[] = [];
        for (let index = 0; index < draws; index += 1) {
            uniforms.push(this.next());
        }
        return toShuffle(items, uniforms);
    }
}

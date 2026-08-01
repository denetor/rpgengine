import { assertDiceRoll, toBool, toInt, toPick, toShuffle, toWeighted } from './transforms';
import { nextUint32, stateFromSeed, toUnitInterval } from './xoshiro128';
import type { RandomStream, WeightedEntry } from './types';

/**
 * A single stream: a generator state, plus the transformations that read
 * values out of it.
 *
 * The impurity is confined to `next()` — the only method that advances the
 * state (RND-17).
 */
export class Stream implements RandomStream {
    private readonly state: Uint32Array;

    constructor(seed: number) {
        this.state = stateFromSeed(seed);
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

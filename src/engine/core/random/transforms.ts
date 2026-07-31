/**
 * The transformations: uniform values in, results out.
 *
 * Every function here is pure (RND-17). None of them touches a generator
 * state, and none of them uses a transcendental `Math` function (ADR 0001).
 */

import type { WeightedEntry } from './types';

/** An integer in [minIncl, maxExcl), from one uniform value. */
export function toInt(uniform: number, minIncl: number, maxExcl: number): number {
    return minIncl + Math.floor(uniform * (maxExcl - minIncl));
}

/**
 * True with the given probability, from one uniform value.
 *
 * The comparison is strict and the uniform value never reaches 1, so
 * probability 0 is never true and probability 1 always is.
 */
export function toBool(uniform: number, probability: number): boolean {
    return uniform < probability;
}

/**
 * The entry the uniform value lands on, each entry occupying a share of
 * [0, total) proportional to its weight.
 *
 * The comparison is strict on the running total, so an entry of weight zero
 * occupies no share at all and can never come up.
 */
export function toWeighted<T>(uniform: number, entries: readonly WeightedEntry<T>[]): T {
    if (entries.length === 0) {
        throw new Error('cannot draw from an empty weighted table');
    }

    let total = 0;
    for (const entry of entries) {
        if (!(entry.weight >= 0) || !Number.isFinite(entry.weight)) {
            throw new Error(`a weight must be a finite number, at least zero: got ${entry.weight}`);
        }
        total += entry.weight;
    }
    if (total <= 0) {
        throw new Error('a weighted table must have at least one entry of positive weight');
    }

    const target = uniform * total;
    let cumulative = 0;
    for (const entry of entries) {
        cumulative += entry.weight;
        if (target < cumulative) {
            return entry.value;
        }
    }

    // Unreachable for a uniform value in [0, 1): the last cumulative total
    // equals `total`, and `target` is strictly below it. Kept because floating
    // point addition is not exact and the loop must have an answer.
    return entries[entries.length - 1].value;
}

/**
 * A permutation of `items`, by Fisher–Yates, in a new array: the input is left
 * alone.
 *
 * It needs one uniform value per element beyond the first — element `i` is
 * swapped with one drawn from [0, i] — and every permutation is equally
 * likely.
 */
export function toShuffle<T>(items: readonly T[], uniforms: readonly number[]): T[] {
    const shuffled = [...items];
    const draws = Math.max(0, items.length - 1);
    if (uniforms.length < draws) {
        throw new Error(`shuffling ${items.length} elements needs ${draws} uniform values`);
    }

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const target = toInt(uniforms[shuffled.length - 1 - index], 0, index + 1);
        const held = shuffled[index];
        shuffled[index] = shuffled[target];
        shuffled[target] = held;
    }

    return shuffled;
}

/** The element the uniform value lands on. An empty list has no answer. */
export function toPick<T>(uniform: number, items: readonly T[]): T {
    if (items.length === 0) {
        throw new Error('cannot pick from an empty list');
    }
    return items[toInt(uniform, 0, items.length)];
}

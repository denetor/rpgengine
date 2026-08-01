/**
 * The transformations: uniform values in, results out.
 *
 * Every function here is pure (RND-17). None of them touches a generator
 * state, and none of them uses a transcendental `Math` function (ADR 0001).
 */

import type { Truncation, WeightedEntry } from './types';

/** An integer in [minIncl, maxExcl), from one uniform value. */
export function toInt(uniform: number, minIncl: number, maxExcl: number): number {
    return minIncl + Math.floor(uniform * (maxExcl - minIncl));
}

/**
 * The parameters of a dice roll, or an error.
 *
 * It is checked apart from the roll itself, and before it, because the roll
 * consumes one value of the sequence per die: a refused roll must leave the
 * stream exactly where it was (RND-18).
 */
export function assertDiceRoll(faces: number, count: number): void {
    if (!Number.isInteger(faces) || faces < 1) {
        throw new Error(`a die must have a whole number of faces, at least one: got ${faces}`);
    }
    if (!Number.isInteger(count) || count < 0) {
        throw new Error(`a roll must be a whole number of dice, at least zero: got ${count}`);
    }
}

/**
 * How many uniform values one Gaussian sample consumes (RND-18). Twelve is not
 * a tunable number: it is what makes the sum's variance exactly one.
 */
export const GAUSSIAN_DRAWS = 12;

/** Half of `GAUSSIAN_DRAWS`: the shift that brings the sum's mean to zero. */
const GAUSSIAN_OFFSET = GAUSSIAN_DRAWS / 2;

/**
 * A normal value of the given mean and standard deviation, optionally clamped
 * to `[low, high]`, from twelve uniform values.
 *
 * **This is the Irwin–Hall method — a sum of uniforms — and it is deliberate
 * (ADR 0001).** Box–Muller is the textbook answer and it is forbidden here: it
 * needs a logarithm and a cosine, which ECMAScript leaves
 * *implementation-approximated*, so V8, SpiderMonkey and JavaScriptCore
 * disagree in the last bits. A browser update would then change games already
 * saved. Whoever is about to "fix" this into Box–Muller: that is the bug, and
 * it is silent.
 *
 * The sum of twelve uniforms over [0, 1) has mean 6 and variance 1 exactly, so
 * subtracting six gives a standard normal in **closed form and with additions
 * only**. The price, accepted in ADR 0001: the tails stop at ±6σ. None of the
 * uses RND-6 foresees — damage variation, spread, jitter, inaccuracy — means
 * anything out there.
 *
 * Truncation is a **clamp**, not a redraw: a redraw loop would consume a
 * variable number of values and move every later draw of the stream, so the
 * same seed would produce a different game depending on how the tails fell.
 * The bounds are therefore reached rather than avoided, and a one-sided
 * interval shifts the mean towards itself by construction.
 */
export function toGaussian(
    uniforms: readonly number[],
    mean: number,
    stdDev: number,
    clamp?: Truncation,
): number {
    if (uniforms.length < GAUSSIAN_DRAWS) {
        throw new Error(`a gaussian sample needs ${GAUSSIAN_DRAWS} uniform values`);
    }

    let sum = 0;
    for (let draw = 0; draw < GAUSSIAN_DRAWS; draw += 1) {
        sum += uniforms[draw];
    }

    const value = mean + stdDev * (sum - GAUSSIAN_OFFSET);
    if (clamp === undefined) {
        return value;
    }
    return Math.min(Math.max(value, clamp[0]), clamp[1]);
}

/**
 * The parameters of a Gaussian draw, or an error.
 *
 * Checked apart from the draw and before it, like a dice roll: the draw
 * consumes twelve values of the sequence, and a refused call must leave the
 * stream exactly where it was (RND-18).
 */
export function assertGaussian(mean: number, stdDev: number, clamp?: Truncation): void {
    if (!Number.isFinite(mean)) {
        throw new Error(`a gaussian mean must be a finite number: got ${mean}`);
    }
    if (!Number.isFinite(stdDev) || stdDev < 0) {
        throw new Error(
            `a gaussian standard deviation must be a finite number, at least zero: got ${stdDev}`,
        );
    }
    if (clamp === undefined) {
        return;
    }
    if (!Number.isFinite(clamp[0]) || !Number.isFinite(clamp[1]) || clamp[0] > clamp[1]) {
        throw new Error(
            `a gaussian truncation must be a finite interval, low bound first: got [${clamp[0]}, ${clamp[1]}]`,
        );
    }
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
 * The weights of a table, or an error.
 *
 * Checked apart from the draw and before it, like a dice roll: `filtered` needs
 * the caller's own numbers named in the message, before it has adjusted them by
 * anything the channel remembers, and before it has consumed a value (RND-18).
 */
export function assertWeightedTable<T>(entries: readonly WeightedEntry<T>[]): void {
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
}

/**
 * The position the uniform value lands on, each weight occupying a share of
 * [0, total) proportional to itself.
 *
 * The comparison is strict on the running total, so a weight of zero occupies
 * no share at all and can never come up.
 *
 * This is where `weighted` and `filtered` meet: one passes the caller's nominal
 * weights, the other the same weights scaled by what its channel remembers. The
 * weights are expected to have been checked already — by `assertWeightedTable`,
 * on the caller's own numbers.
 */
export function toWeightedIndex(uniform: number, weights: readonly number[]): number {
    let total = 0;
    for (const weight of weights) {
        total += weight;
    }

    const target = uniform * total;
    let cumulative = 0;
    for (let index = 0; index < weights.length; index += 1) {
        cumulative += weights[index];
        if (target < cumulative) {
            return index;
        }
    }

    // Unreachable for a uniform value in [0, 1): the last cumulative total
    // equals `total`, and `target` is strictly below it. Kept because floating
    // point addition is not exact and the loop must have an answer.
    return weights.length - 1;
}

/** A table's weights on their own, which is all a draw needs from it. */
export function weightsOf<T>(entries: readonly WeightedEntry<T>[]): number[] {
    const weights: number[] = [];
    for (const entry of entries) {
        weights.push(entry.weight);
    }
    return weights;
}

/**
 * The entry the uniform value lands on, with probability proportional to its
 * weight.
 *
 * The table is expected to have been checked already, by `assertWeightedTable`
 * and **before** the caller drew the uniform value: a refused table must leave
 * the sequence exactly where it was (RND-18).
 */
export function toWeighted<T>(uniform: number, entries: readonly WeightedEntry<T>[]): T {
    return entries[toWeightedIndex(uniform, weightsOf(entries))].value;
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

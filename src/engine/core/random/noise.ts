/**
 * Coherent noise: Perlin in two dimensions, plus the sum of octaves (fBm).
 *
 * Everything here is a **pure function of (permutation table, coordinates)**
 * (RND-17, RND-18). Nothing reads or advances a generator state, which is what
 * makes RND-7 true: a map can be sampled cell by cell in any order, or in
 * patches, and always comes out the same.
 *
 * No transcendental function appears — not in the interpolation, which is a
 * polynomial, and not in the octave loop, where the frequency is obtained by
 * **repeated multiplication, never by raising the lacunarity to a power**
 * (RND-4, ADR 0001). The standard library's exponentiation is
 * implementation-approximated: a browser update would move the last bits of
 * every octave beyond the first, and every map generated from a seed with it.
 *
 * (The forbidden names are spelled out in prose here rather than as `Math`
 * tokens: `isolation.spec.ts` scans these sources by substring and cannot tell
 * a comment from a call. Issue 09's lint rule lifts that constraint.)
 */

import { toShuffle } from './transforms';
import { nextUint32, stateFromSeed, toUnitInterval } from './xoshiro128';

/** Entries of the permutation table before it is doubled. A power of two. */
const PERMUTATION_SIZE = 256;

/** Wraps a lattice coordinate into the table: `& 255`, so no division. */
const PERMUTATION_MASK = PERMUTATION_SIZE - 1;

/**
 * The component of a unit vector at 45°, written as a literal.
 *
 * `Math.SQRT1_2` is a constant ECMAScript specifies only to "approximately"
 * this value, so an engine is free to disagree in the last bit (ADR 0001). A
 * decimal literal is parsed to the nearest double by a rule the standard *does*
 * pin down, and is therefore the same number everywhere.
 */
const HALF_ROOT_TWO = 0.7071067811865476;

/**
 * The eight gradient directions, as unit vectors: the four axes and the four
 * diagonals.
 *
 * They are all of length one on purpose. The textbook Perlin gradient set uses
 * the unnormalised diagonals `(±1, ±1)`, which are √2 times longer than the
 * axes and make the noise visibly stronger along the diagonals — a bias that
 * shows up as a diamond pattern in generated terrain.
 *
 * The set is frozen: changing it re-draws every map generated from a seed
 * (ADR 0001).
 */
const GRADIENTS: readonly (readonly [number, number])[] = [
    [1, 0],
    [HALF_ROOT_TWO, HALF_ROOT_TWO],
    [0, 1],
    [-HALF_ROOT_TWO, HALF_ROOT_TWO],
    [-1, 0],
    [-HALF_ROOT_TWO, -HALF_ROOT_TWO],
    [0, -1],
    [HALF_ROOT_TWO, -HALF_ROOT_TWO],
];

/** Selects one of the eight gradients from a hash: `& 7`, so no division. */
const GRADIENT_MASK = GRADIENTS.length - 1;

/**
 * √2, the factor that spreads the raw noise over the declared [-1, 1].
 *
 * Two-dimensional Perlin with unit gradients reaches at most √½ in absolute
 * value, so this scales the interval up without ever letting a sample leave it.
 * Written as a literal for the same reason as `HALF_ROOT_TWO`, and frozen for
 * the same reason as `GRADIENTS`.
 */
const RANGE_SCALE = 1.4142135623730951;

/**
 * The declared continuity bound: two samples one unit of noise space apart
 * differ by no more than this (RND-7 — "varies gradually").
 *
 * This is the number a caller needs in order to choose a sampling step: at
 * frequency `f` and step `d`, neighbouring cells differ by at most
 * `NOISE_MAX_SLOPE × f × d`. `fbm2` obeys the same bound at the frequency of
 * its **last** octave, which is the fastest-varying one.
 *
 * It is a declared ceiling, not a measurement. The quintic fade is steepest in
 * the middle of a cell, where its derivative is 15/8, and the corner gradients
 * add to that; bounding both terms crudely gives about 9. Sweeping 200 tables
 * across lines and cell interiors finds 2.84 at the worst, and the value below
 * leaves that real room rather than hugging it — a bound that a seed nobody has
 * tried yet can step over is worse than no bound at all.
 */
export const NOISE_MAX_SLOPE = 4;

/** The default octave settings: each octave twice as fast, half as loud. */
export const DEFAULT_FREQUENCY = 1;
export const DEFAULT_LACUNARITY = 2;
export const DEFAULT_PERSISTENCE = 0.5;

/**
 * A stream's permutation table: `PERMUTATION_SIZE` values doubled end to end,
 * so that `table[table[x] + y]` never needs a second wrap.
 */
export type Permutation = Uint8Array;

/**
 * The permutation table of the stream that `seed` identifies.
 *
 * It is shuffled with a generator of its own, started at the stream's own
 * seed — the same words the stream begins with, drawn from a **copy**, so the
 * stream itself never moves (RND-18). Building it from the seed rather than
 * from the live position is also what lets RND-22 leave the table out of the
 * save: a restored stream sits somewhere in the middle of its sequence, and a
 * table built from *there* could never be rebuilt after a reload.
 */
export function buildPermutation(seed: number): Permutation {
    const state = stateFromSeed(seed);
    const order: number[] = [];
    for (let index = 0; index < PERMUTATION_SIZE; index += 1) {
        order.push(index);
    }

    const uniforms: number[] = [];
    for (let draw = 0; draw < PERMUTATION_SIZE - 1; draw += 1) {
        uniforms.push(toUnitInterval(nextUint32(state)));
    }
    const shuffled = toShuffle(order, uniforms);

    const table = new Uint8Array(PERMUTATION_SIZE * 2);
    for (let index = 0; index < PERMUTATION_SIZE; index += 1) {
        table[index] = shuffled[index];
        table[PERMUTATION_SIZE + index] = shuffled[index];
    }
    return table;
}

/**
 * The noise at `(x, y)`, sampled at `frequency`, in [-1, 1].
 *
 * The frequency scales the coordinates and is applied **here**, in the one
 * place, so that `fbm2` can hand each octave its own without the caller's
 * `frequency` being applied twice.
 *
 * The classic construction: the point sits in a lattice cell, each of the four
 * corners contributes the dot product of its gradient with the offset to the
 * point, and the four contributions are blended with a quintic fade. On a
 * lattice point every offset is zero, so the value there is exactly zero.
 *
 * The lattice wraps every `PERMUTATION_SIZE` units, so the field **repeats**
 * with period 256 at frequency 1. That is far larger than any map GEN will ask
 * for, and it is the standard trade: the alternative is a hash per lattice
 * corner on every sample.
 */
export function perlin2(table: Permutation, x: number, y: number, frequency: number): number {
    const scaledX = x * frequency;
    const scaledY = y * frequency;

    const cellX = Math.floor(scaledX);
    const cellY = Math.floor(scaledY);
    const offsetX = scaledX - cellX;
    const offsetY = scaledY - cellY;

    const left = cellX & PERMUTATION_MASK;
    const bottom = cellY & PERMUTATION_MASK;
    const right = (cellX + 1) & PERMUTATION_MASK;
    const top = (cellY + 1) & PERMUTATION_MASK;

    const bottomLeft = gradientDot(table[table[left] + bottom], offsetX, offsetY);
    const bottomRight = gradientDot(table[table[right] + bottom], offsetX - 1, offsetY);
    const topLeft = gradientDot(table[table[left] + top], offsetX, offsetY - 1);
    const topRight = gradientDot(table[table[right] + top], offsetX - 1, offsetY - 1);

    const alongX = fade(offsetX);
    const alongY = fade(offsetY);
    const lower = lerp(bottomLeft, bottomRight, alongX);
    const upper = lerp(topLeft, topRight, alongX);

    return RANGE_SCALE * lerp(lower, upper, alongY);
}

/**
 * The sum of `octaves` octaves at `(x, y)`, in [-1, 1].
 *
 * Each octave is the same noise sampled `lacunarity` times faster and weighted
 * `persistence` times more quietly than the one before. The sum is divided by
 * the total of the weights, so the result keeps the declared interval however
 * many octaves are asked for.
 *
 * The frequency and the amplitude are carried forward by **multiplying the
 * previous one** — see the note at the top of this file on why raising them to
 * the octave's power is not an option here.
 *
 * Every argument is already settled and already checked: `assertFbm2` has run,
 * so the last octave's frequency is known to be a finite number and the loop
 * cannot run off the end of the number line.
 */
export function fbmNoise(
    table: Permutation,
    x: number,
    y: number,
    octaves: number,
    frequency: number,
    lacunarity: number,
    persistence: number,
): number {
    let currentFrequency = frequency;
    let amplitude = 1;
    let sum = 0;
    let amplitudeTotal = 0;

    for (let octave = 0; octave < octaves; octave += 1) {
        sum += amplitude * perlin2(table, x, y, currentFrequency);
        amplitudeTotal += amplitude;
        currentFrequency *= lacunarity;
        amplitude *= persistence;
    }

    return sum / amplitudeTotal;
}

/**
 * The arguments of a noise sample, or an error. The frequency arrives already
 * settled: the defaults are filled in once, by the caller, not here and again
 * at the sample.
 *
 * Sampling consumes nothing, so a refused sample cannot shift the sequence the
 * way a refused `diceRoll` would (RND-18). It is checked up front all the same,
 * because a `NaN` coordinate would otherwise travel silently into a whole map
 * of `NaN` cells.
 */
export function assertNoise2(x: number, y: number, frequency: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`noise coordinates must be finite numbers: got (${x}, ${y})`);
    }
    if (!Number.isFinite(frequency) || frequency <= 0) {
        throw new Error(`a noise frequency must be a finite positive number: got ${frequency}`);
    }
}

/**
 * The arguments of an fBm sample, or an error.
 *
 * The last check is the one that is easy to miss: each octave multiplies the
 * frequency by the lacunarity, and enough octaves of a large enough lacunarity
 * walk off the end of the number line. An infinite frequency makes the lattice
 * cell `NaN`, and the sample comes back `NaN` — outside the interval `fbm2`
 * promises, and silent. The progression is therefore walked here, with the same
 * repeated multiplication the sum itself uses, so what is checked is exactly
 * what will run.
 */
export function assertFbm2(
    x: number,
    y: number,
    octaves: number,
    frequency: number,
    lacunarity: number,
    persistence: number,
): void {
    assertNoise2(x, y, frequency);

    if (!Number.isInteger(octaves) || octaves < 1) {
        throw new Error(
            `a sum of octaves needs a whole number of octaves, at least one: got ${octaves}`,
        );
    }
    if (!Number.isFinite(lacunarity) || lacunarity <= 0) {
        throw new Error(`a lacunarity must be a finite positive number: got ${lacunarity}`);
    }
    if (!Number.isFinite(persistence) || persistence < 0) {
        throw new Error(`a persistence must be a finite number, at least zero: got ${persistence}`);
    }

    let lastFrequency = frequency;
    for (let octave = 1; octave < octaves; octave += 1) {
        lastFrequency *= lacunarity;
    }
    if (!Number.isFinite(lastFrequency)) {
        throw new Error(
            `${octaves} octaves from frequency ${frequency} at lacunarity ${lacunarity} run past the largest number there is`,
        );
    }
}

/** The dot product of the gradient a hash selects with the offset given. */
function gradientDot(hash: number, offsetX: number, offsetY: number): number {
    const gradient = GRADIENTS[hash & GRADIENT_MASK];
    return gradient[0] * offsetX + gradient[1] * offsetY;
}

/**
 * Perlin's quintic fade over a fraction of a cell, `6t⁵ - 15t⁴ + 10t³`, in
 * Horner form.
 *
 * It is flat at both ends in the first *and* second derivative, which is what
 * keeps the noise smooth across cell boundaries; the cubic `3t² - 2t³` of the
 * 1985 paper leaves a visible crease there.
 */
function fade(fraction: number): number {
    return fraction * fraction * fraction * (fraction * (fraction * 6 - 15) + 10);
}

/** Straight-line interpolation between two values. */
function lerp(from: number, to: number, weight: number): number {
    return from + weight * (to - from);
}

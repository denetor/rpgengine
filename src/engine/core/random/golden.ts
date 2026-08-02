/**
 * The golden vectors: the values `RND` is expected to produce, exactly (RND-4,
 * ADR 0001).
 *
 * Everywhere else the tests describe *properties* — a mean within tolerance,
 * continuity between nearby samples — and a test that broke when the
 * implementation was replaced by an equivalent one would be a wrong test. Here
 * the exactness **is** the contract: the service promises that a browser update
 * will not change anyone's game, and a test that breaks when the generator
 * changes is doing precisely its job.
 *
 * This file exists apart from `golden.spec.ts` because the same vectors have to
 * run in two places. Reproducibility **across engines** is not observable from
 * one engine, so the same measurement is taken by the headless suite in Node
 * and by a page loaded into chromium, firefox and webkit. A `.spec.ts` can only
 * be reached by Vitest and a Playwright test can only be reached by Playwright;
 * what they share has to live somewhere both can import, and this is it.
 *
 * It is **not** a service primitive, and no game code should ever call it.
 */

import { Random } from './random';
import type { RandomStream } from './types';

/** The vectors, in the order they are measured and written. */
export const GOLDEN_VECTORS = ['next', 'int', 'gaussian', 'noise2', 'fbm2'] as const;

export type GoldenVectorName = (typeof GOLDEN_VECTORS)[number];

/**
 * Everything needed to reproduce the vectors, and nothing that is not: the root
 * seed, the streams' names, the parameters of each primitive and the points the
 * noise is sampled at.
 *
 * It is carried in the same file as the numbers it produced, so that a diff on
 * the numbers is read next to the parameters that produced them. **The stream
 * names are part of it**: a stream's seed is `hash(root seed, name)`, so
 * renaming one moves every value below it.
 */
export interface GoldenPlan {
    rootSeed: number;

    /** How many values are taken from each of the three sequential vectors. */
    draws: number;

    /**
     * The stream each vector draws from. One stream per vector, so that
     * changing how many values one of them takes does not shift the others.
     */
    streams: {
        next: string;
        int: string;
        gaussian: string;
        noise: string;
    };

    int: { minIncl: number; maxExcl: number };
    gaussian: { mean: number; stdDev: number };
    noise2: { frequency: number };
    fbm2: { octaves: number; frequency: number; lacunarity: number; persistence: number };

    /** The `(x, y)` pairs both noise vectors are sampled at. */
    points: readonly (readonly number[])[];
}

/** The measured values, one array per vector. */
export type GoldenVectors = Record<GoldenVectorName, number[]>;

/** A golden vector file: the plan, the numbers, and the note that explains them. */
export interface GoldenFile {
    version: number;
    about: readonly string[];
    plan: GoldenPlan;
    vectors: GoldenVectors;
}

/**
 * Runs the plan and returns what this engine produced.
 *
 * Every value on the path here is arrived at by integer arithmetic, `Math.imul`,
 * addition and multiplication of doubles — all of them specified exactly by
 * ECMAScript. That is the whole reason the numbers can be compared for equality
 * across engines rather than within a tolerance, and the reason ADR 0001 bans
 * the transcendental functions that would not be.
 */
export function measureGolden(plan: GoldenPlan): GoldenVectors {
    const service = new Random(plan.rootSeed);
    const noise = service.stream(plan.streams.noise);

    return {
        next: sequence(service.stream(plan.streams.next), plan.draws, (stream) => stream.next()),
        int: sequence(service.stream(plan.streams.int), plan.draws, (stream) =>
            stream.int(plan.int.minIncl, plan.int.maxExcl),
        ),
        gaussian: sequence(service.stream(plan.streams.gaussian), plan.draws, (stream) =>
            stream.gaussian(plan.gaussian.mean, plan.gaussian.stdDev),
        ),
        noise2: plan.points.map(([x, y]) => noise.noise2(x, y, plan.noise2)),
        fbm2: plan.points.map(([x, y]) => noise.fbm2(x, y, plan.fbm2.octaves, plan.fbm2)),
    };
}

/**
 * What this engine got wrong, one line per value, empty when it got everything
 * right.
 *
 * Lines rather than a thrown error, and rather than a bare boolean: the same
 * check runs inside a browser, where what comes back out is text, and a report
 * that says only "failed" would leave whoever reads it no better off than
 * before running it.
 */
export function goldenMismatches(expected: GoldenVectors, measured: GoldenVectors): string[] {
    const found: string[] = [];
    for (const name of GOLDEN_VECTORS) {
        found.push(...vectorMismatches(name, expected[name] ?? [], measured[name] ?? []));
    }
    return found;
}

/** One vector's mismatches, named so that the line can be read on its own. */
function vectorMismatches(
    name: GoldenVectorName,
    expected: readonly number[],
    measured: readonly number[],
): string[] {
    if (expected.length !== measured.length) {
        return [`${name}: expected ${expected.length} values, measured ${measured.length}`];
    }

    const found: string[] = [];
    for (let index = 0; index < expected.length; index += 1) {
        // Strict equality, never a tolerance: a value that is nearly right is a
        // different game (ADR 0001).
        if (measured[index] !== expected[index]) {
            found.push(
                `${name}[${index}]: expected ${String(expected[index])}, measured ${String(measured[index])}`,
            );
        }
    }
    return found;
}

/** `count` values taken from `stream`, in order. */
function sequence(
    stream: RandomStream,
    count: number,
    draw: (stream: RandomStream) => number,
): number[] {
    const values: number[] = [];
    for (let index = 0; index < count; index += 1) {
        values.push(draw(stream));
    }
    return values;
}
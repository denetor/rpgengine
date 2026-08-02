import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import golden from './primitives-golden.json';
import { GOLDEN_VECTORS, goldenMismatches, measureGolden } from './index';
import type { GoldenFile, GoldenVectors } from './index';

/**
 * The golden vectors, in Node (RND-4, ADR 0001).
 *
 * This is half of the check. The other half runs the *same* measurement inside
 * chromium, firefox and webkit — `tests/golden-vectors.spec.ts` — because
 * agreement between engines is the promise, and one engine cannot observe it.
 * What this half adds is speed and a readable diff: it fails in a second, on
 * the developer's machine, before the browsers are ever started.
 *
 * **To regenerate the numbers: `npm run golden:update`.** That is a deliberate
 * act. The vectors move only when the generator, the seed hash, a
 * transformation or the plan changes, and every one of those invalidates every
 * save and every map generated from a seed. A failing test here is a question —
 * *did I mean to do that?* — not a file to be refreshed until it goes quiet.
 */

const file = golden as GoldenFile;

const GOLDEN_PATH = new URL('./primitives-golden.json', import.meta.url);

describe('the golden vectors', () => {
    it('are the values this engine produces', () => {
        const measured = measureGolden(file.plan);
        const expected = regenerating() ? writeGolden(measured) : file.vectors;

        expect(goldenMismatches(expected, measured)).toEqual([]);
    });

    it('cover every primitive whose exactness is promised', () => {
        // Vacuity is the failure mode of a golden vector: an empty list matches
        // an empty list, and the test goes green having checked nothing.
        expect([...GOLDEN_VECTORS]).toEqual(['next', 'int', 'gaussian', 'noise2', 'fbm2']);

        for (const name of GOLDEN_VECTORS) {
            expect(file.vectors[name].length).toBeGreaterThan(0);
        }
    });

    it('measure the same values twice running', () => {
        // Not a tautology: it is what says the vectors describe the service and
        // not the state some earlier test left behind.
        expect(measureGolden(file.plan)).toEqual(measureGolden(file.plan));
    });
});

/**
 * The comparison itself, checked against measurements rather than against the
 * file: what it does with a value that has moved must not depend on whether the
 * committed numbers happen to be up to date.
 */
describe('the comparison', () => {
    it('reports a value that has moved, with both numbers in the line', () => {
        const measured = measureGolden(file.plan);
        const drifted = { ...measured, next: [...measured.next] };
        drifted.next[3] = 0.5;

        const found = goldenMismatches(measured, drifted);

        expect(found).toHaveLength(1);
        expect(found[0]).toContain('next[3]');
        expect(found[0]).toContain('0.5');
    });

    it('reports a vector of the wrong length rather than comparing what it can', () => {
        const measured = measureGolden(file.plan);
        const truncated = { ...measured, gaussian: measured.gaussian.slice(0, 2) };

        expect(goldenMismatches(measured, truncated)).toEqual([
            `gaussian: expected ${measured.gaussian.length} values, measured 2`,
        ]);
    });

    it('accepts nothing but exact equality', () => {
        const measured = measureGolden(file.plan);
        const nudged = { ...measured, fbm2: [...measured.fbm2] };
        nudged.fbm2[0] = measured.fbm2[0] + Number.EPSILON * 4;

        expect(goldenMismatches(measured, nudged)).toHaveLength(1);
    });
});

/**
 * Whether this run is regenerating the vectors rather than checking them.
 *
 * The pattern is `--update-snapshots`', and so is its danger: with the variable
 * set, the check above proves nothing. It is therefore refused outright where
 * nobody would be reading the output — regenerating the vectors is a decision,
 * and CI does not get to take it.
 */
function regenerating(): boolean {
    if (process.env.UPDATE_GOLDEN !== '1') {
        return false;
    }
    if (process.env.CI) {
        throw new Error(
            'UPDATE_GOLDEN is set on CI: the golden vectors are regenerated deliberately, by a person who then says why in the commit',
        );
    }
    return true;
}

/**
 * Writes the measured values back into the vector file, keeping the plan and
 * the note that explains it, and returns what it wrote.
 *
 * The version is **not** bumped here: whoever regenerates has to say what
 * changed and why, and a number the tooling moves on its own says nothing.
 */
function writeGolden(measured: GoldenVectors): GoldenVectors {
    const updated: GoldenFile = { ...file, vectors: measured };
    writeFileSync(GOLDEN_PATH, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    return measured;
}
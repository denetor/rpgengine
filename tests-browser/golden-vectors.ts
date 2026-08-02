/**
 * Runs the golden vectors in whatever browser loaded this page, and writes the
 * result where a Playwright test can read it (RND-4).
 *
 * The measurement is the one from the service — `measureGolden` — and not a
 * copy of it: a second implementation would test the copy. The only thing that
 * happens here is the reporting, because a browser has no test runner to throw
 * an assertion at.
 */

import golden from '../src/engine/core/random/primitives-golden.json';
import { GOLDEN_VECTORS, goldenMismatches, measureGolden } from '../src/engine/core/random';
import type { GoldenFile } from '../src/engine/core/random';

/** Where `tests/golden-vectors.spec.ts` looks for the verdict. */
const REPORT_ELEMENT = 'golden-report';

/**
 * What the page says about itself.
 *
 * `checked` and `values` are here so that a run which measured *nothing* cannot
 * be read as a run which found nothing wrong — the failure mode of every golden
 * vector, and the one a page that reports a bare "ok" would walk straight into.
 */
interface BrowserReport {
    version: number;
    checked: readonly string[];
    values: number;
    mismatches: string[];
}

function report(): BrowserReport {
    const file = golden as GoldenFile;
    const measured = measureGolden(file.plan);

    let values = 0;
    for (const name of GOLDEN_VECTORS) {
        values += measured[name].length;
    }

    return {
        version: file.version,
        checked: GOLDEN_VECTORS,
        values,
        mismatches: goldenMismatches(file.vectors, measured),
    };
}

const element = document.getElementById(REPORT_ELEMENT);
if (element === null) {
    throw new Error(`the page has no #${REPORT_ELEMENT} to write the report into`);
}

// No try/catch: an engine that cannot run the vectors must fail loudly. The
// element keeps saying that the script has not run, and Playwright fails on the
// page error as well.
element.textContent = JSON.stringify(report(), null, 2);

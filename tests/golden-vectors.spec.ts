import { expect, test } from '@playwright/test';
import golden from '../src/engine/core/random/primitives-golden.json';

/**
 * The golden vectors, inside a real browser (RND-4, ADR 0001).
 *
 * This file is the only thing in the project that can fail for the reason it
 * exists to catch. "Two instances with the same seed produce the same sequence"
 * runs on one engine and passes whatever the implementation does; the promise
 * the service actually makes is that a **browser update will not change
 * anyone's game**, and that is a statement about engines disagreeing, which one
 * engine cannot observe.
 *
 * It is run by three Playwright projects — `vectors-chromium`,
 * `vectors-firefox`, `vectors-webkit` — over the same page. The measurement
 * happens in the page; all that happens here is reading the verdict out of it.
 */

const REPORT_PAGE = 'http://localhost:5174/tests-browser/golden-vectors.html';

/** How many numbers the committed vectors hold, all told. */
const EXPECTED_VALUES = Object.values(golden.vectors).reduce(
  (total, values) => total + values.length,
  0,
);

test('the engine produces the golden vectors, exactly', async ({ page }) => {
  // A page that threw is a page that measured nothing, and its report would
  // still be the placeholder. Collected before navigating, or the error would
  // have happened before anybody was listening.
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(REPORT_PAGE);

  const report = page.locator('#golden-report');
  await expect(report).toContainText('mismatches');

  const verdict = JSON.parse((await report.textContent()) ?? '');

  expect(errors).toEqual([]);
  expect(verdict.mismatches).toEqual([]);

  // Vacuity is what a golden vector fails at: an empty measurement matches an
  // empty expectation and reports nothing wrong. These two say the browser
  // measured the same primitives, and the same number of values, as the file
  // in the repository.
  expect(verdict.checked).toEqual(['next', 'int', 'gaussian', 'noise2', 'fbm2']);
  expect(verdict.values).toBe(EXPECTED_VALUES);
  expect(verdict.version).toBe(golden.version);
});

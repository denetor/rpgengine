import { expect, Page, test } from '@playwright/test';

/**
 * The testbed, entered the way a person enters it: by URL, against the **built**
 * page — the same one the visual snapshot photographs, so what is checked here
 * is what ships.
 *
 * No unit seam is opened on the registry. Its resolution would be a pure
 * function and convenient to call directly, but it would be a second door into
 * behaviour that is already fully observable from this one. That is also why
 * the error for an unknown name has to be in the DOM: a message in the console
 * would be invisible from here.
 *
 * The tests know two things only, both of which a person also knows: the name
 * of the query parameter, and the name of the scene the plain URL opens. They
 * do not know how the registry stores anything.
 */

const PAGE = 'http://localhost:4173/';

/** Opens the page and clicks past Excalibur's play gate, as a player would. */
async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.click('#excalibur-play');
}

test('no scene parameter opens the sandbox', async ({ page }) => {
  await open(page, '');

  // The tab is named after the scene Excalibur actually activated, so the title
  // says which scene ran rather than which one was asked for. What that scene
  // looks like is the visual snapshot's business, in `main.spec.ts`.
  await expect(page).toHaveTitle(/sandbox/);
  await expect(page.locator('canvas')).toBeVisible();
});

test('a registered scene name opens that scene', async ({ page }) => {
  await open(page, '?scene=sandbox');

  await expect(page).toHaveTitle(/sandbox/);
  await expect(page.locator('canvas')).toBeVisible();
});

test('an unregistered scene name is reported in the page', async ({ page }) => {
  await page.goto(`${PAGE}?scene=nonexistent`);

  const error = page.getByRole('alert');
  await expect(error).toContainText('scene');
  await expect(error).toContainText('nonexistent');
  await expect(error).toContainText('sandbox');

  // And nothing starts. A silent fallback to the sandbox is the failure this
  // error exists to prevent: a mistyped registration would show the template
  // and the scene that was asked for would look broken.
  await expect(page.locator('#excalibur-play')).toHaveCount(0);
});
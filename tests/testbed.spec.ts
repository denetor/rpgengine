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

test('the bus scene traces a cascade it published', async ({ page }) => {
  await open(page, '?scene=bus');

  await expect(page).toHaveTitle(/bus/);
  await page.getByRole('button', { name: 'Drop a pebble' }).click();

  // What is checked is that the scene is wired to a real bus and shows what came
  // back: the fact that was published, and the fact at the far end of the
  // cascade it caused. How the bus ordered them in between is proved at the
  // bus's own surface, and asserting it again from here would be testing the
  // overlay.
  const trace = page.getByLabel('trace');
  await expect(trace).toContainText('demo/pebble-dropped');
  await expect(trace).toContainText('demo/shore-reached');

  // The other half of step 2, in the same scene: parameters composed by `CFG`,
  // resolved by the service that declared the section.
  await expect(page.getByText(/composed by CFG/)).toContainText('demo:ripple → patient');
});

test('the bus scene shows the diagnostic instead of freezing on a cycle', async ({ page }) => {
  await open(page, '?scene=bus');

  await page.getByRole('button', { name: 'Ring the echo (a cycle)' }).click();

  // The test that would **hang** rather than fail if the rail were not there.
  // The message has to name the types, because a person looking at a frozen
  // game has nothing else to go on.
  const refusal = page.getByRole('alert');
  await expect(refusal).toContainText('generations');
  await expect(refusal).toContainText('demo/echo-heard');
  await expect(refusal).toContainText('demo/echo-returned');

  // And the scene is still usable: the refused tick took its queue with it
  // rather than leaving the next flush to redeliver it (BUS-12).
  await page.getByRole('button', { name: 'Drop a pebble' }).click();
  await expect(page.getByLabel('trace')).toContainText('demo/shore-reached');
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
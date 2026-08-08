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
/**
 * The `clock` scene: the presentation driving the domain.
 *
 * Everything the clock does is proved at its own surface, headless, in the specs
 * beside it. What is checked from here is only what a person can see by looking
 * at the page — that the world runs, that it stops without the page stopping,
 * and that a jump delivers its whole batch at once. Anything deeper would be
 * testing the overlay.
 *
 * The scene's calendar makes a day 24 real minutes long, so an hour of world
 * time passes in a minute and a minute in a second. That is what makes these
 * tests possible at all: a real 24-hour day would give them nothing to watch.
 */

/** What the page says the game time is, in milliseconds. */
async function gameTime(page: Page): Promise<number> {
  const reading = await page.getByLabel('game time').textContent();

  return Number.parseInt(reading ?? '', 10);
}

test('the clock scene runs the world and reads it while drawing', async ({ page }) => {
  await open(page, '?scene=clock');

  await expect(page).toHaveTitle(/clock/);

  const first = await gameTime(page);
  await expect
    .poll(async () => await gameTime(page), { message: 'game time advances' })
    .toBeGreaterThan(first);

  // The world clock is a projection of the same instant, so it moves too — a
  // minute of world time per second of real time, on this game's calendar.
  const world = page.getByLabel('world time');
  const before = await world.textContent();
  await expect.poll(async () => await world.textContent()).not.toBe(before);
  await expect(world).toContainText(/day \d+, \d\d:\d\d — (night|dawn|day|dusk)/);
});

test('the clock scene rings a one-shot timer once', async ({ page }) => {
  await open(page, '?scene=clock');

  await page.getByRole('button', { name: 'Ring the bell once' }).click();

  const bells = page.getByLabel('bells');
  await expect(bells).toContainText('once ×1', { timeout: 30_000 });

  // And once only: the timer came due, and a timer that has come due is gone.
  await page.waitForTimeout(3_000);
  await expect(bells).toContainText('once ×1');
});

test('the clock scene rings a repeater until it is cancelled', async ({ page }) => {
  await open(page, '?scene=clock');

  await page.getByRole('button', { name: 'Ring the bell every minute' }).click();

  const bells = page.getByLabel('bells');
  await expect(bells).toContainText('every minute ×3', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Stop the bell' }).click();
  const whenCancelled = await bells.textContent();

  // A repeater nobody cancels stays in the queue for the rest of the game, so
  // this is the control that has to work: after it, the count stops.
  await page.waitForTimeout(3_000);
  await expect(bells).toHaveText(whenCancelled ?? '');
});

test('the clock scene stops the world without stopping the page', async ({ page }) => {
  await open(page, '?scene=clock');

  await page.getByRole('button', { name: 'Pause the world' }).click();
  await expect(page.getByLabel('world state')).toHaveText('paused');

  const stopped = await gameTime(page);
  await page.waitForTimeout(2_000);

  // Two seconds of real time, and not one millisecond of game time: pause is
  // the orchestration not advancing the clock, and the page has been drawing
  // over a stopped world the whole time.
  expect(await gameTime(page)).toBe(stopped);

  // Still responsive, which is the other half of the claim: the interface keeps
  // running, so this button still answers.
  const resumedAt = Date.now();
  await page.getByRole('button', { name: 'Resume the world' }).click();
  await expect(page.getByLabel('world state')).toHaveText('running');

  // Resumed from where it stopped, with the two paused seconds nowhere in the
  // world's history. Measured against the wall clock this test itself spent,
  // rather than against a fixed budget: both sides scale together under load,
  // so the assertion stays sensitive to a clock that caught up — which would
  // show as two whole seconds more than the wall time — without being fragile
  // about how long a click took.
  const wallClockSpent = Date.now() - resumedAt;
  const resumed = await gameTime(page);
  expect(resumed).toBeGreaterThanOrEqual(stopped);
  expect(resumed - stopped).toBeLessThanOrEqual(wallClockSpent + 500);

  await expect.poll(async () => await gameTime(page)).toBeGreaterThan(resumed);
});

/** The hour the world clock is showing. */
async function worldHour(page: Page): Promise<number> {
  const reading = (await page.getByLabel('world time').textContent()) ?? '';
  const shown = /(\d\d):\d\d/.exec(reading);

  return Number.parseInt(shown?.[1] ?? '', 10);
}

test('the clock scene delivers a six-hour jump as one batch', async ({ page }) => {
  await open(page, '?scene=clock');

  await page.getByRole('button', { name: 'Ring the bell every minute' }).click();
  const before = await worldHour(page);

  await page.getByRole('button', { name: 'Jump six hours' }).click();

  const trace = page.getByLabel('trace');

  // One beat worth six hours, and a person sees a long list appear at once.
  // Counted per kind rather than as one total, so that a failure says which
  // part of the batch changed.
  //
  // The three counts are stable and not a photograph of one run. Six hours is a
  // whole number of the bell's periods and of the calendar's hours, so any
  // window of that length crosses exactly 360 and 6 of them wherever it starts.
  // The phase boundary is the one that depends on where the jump began: the
  // world starts at 06:30 and dawn gives way to day at 08:00, so a jump crossing
  // it needs the page to have been open for less than 90 real seconds — which
  // the test's own 30-second timeout already guarantees, since the world clock
  // runs at a minute a second.
  await expect(trace.getByText('testbed/bell-rung')).toHaveCount(360);
  await expect(trace.getByText('time/hour-changed')).toHaveCount(6);
  await expect(trace.getByText('time/day-phase-changed')).toHaveCount(1);
  await expect(trace.getByRole('listitem')).toHaveCount(367);

  // And the world clock followed the jump rather than crawling after it.
  expect((await worldHour(page)) - before).toBe(6);
});

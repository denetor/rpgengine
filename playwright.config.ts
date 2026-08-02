import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Two kinds of test live here, and they do not want the same browsers:
 *
 * - the **visual snapshot** of the main page, which is compared against a
 *   committed PNG and therefore runs on **chromium alone**. A snapshot is a
 *   picture of one renderer; running it on three would need three baselines,
 *   and that is a decision to be taken deliberately, not a side effect of
 *   wanting the golden vectors checked elsewhere.
 * - the **golden vectors** (RND-4), which have to run on chromium, firefox and
 *   webkit, because agreement between engines is the whole promise and no
 *   single engine can observe it.
 *
 * Hence one project per engine per purpose, each with its own `testMatch`. The
 * chromium project keeps its name: the snapshot files are named after it.
 */

/** The visual snapshot: chromium only, deliberately. */
const VISUAL_TESTS = /main\.spec\.ts/;

/** The golden vectors: every engine. */
const VECTOR_TESTS = /golden-vectors\.spec\.ts/;

export default defineConfig({
  testDir: './tests',
  webServer: [
    {
      // The built game, for the visual snapshot: it must be photographed as it
      // ships, not as the dev server serves it.
      command: 'npm run serve',
      timeout: 240 * 1000, // linux takes a long time
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // The vector page, from source. It cannot come from the build: `vite
      // build` emits a single UMD bundle for the game, and UMD has no room for
      // a second entry point. Nothing of this page ships.
      command: 'npm run serve:vectors',
      timeout: 240 * 1000,
      url: 'http://localhost:5174/tests-browser/golden-vectors.html',
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      testMatch: VISUAL_TESTS,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ["--no-sandbox", '--disable-web-security', "--use-angle=gl"]
        }
      },
    },

    {
      name: 'vectors-chromium',
      testMatch: VECTOR_TESTS,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ["--no-sandbox"]
        }
      },
    },

    {
      name: 'vectors-firefox',
      testMatch: VECTOR_TESTS,
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'vectors-webkit',
      testMatch: VECTOR_TESTS,
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],
});

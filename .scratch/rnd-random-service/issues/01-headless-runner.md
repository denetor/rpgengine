# 01 — Separate headless test runner

**What to build:** the project has a single way of running tests — Playwright, which starts a server
and a browser — while ARC-11.1 requires a separate headless runner. Without it, no service can be
tested in isolation, and `RND` is the first one that needs it. When this ticket is done, two
distinct suites exist: a headless one for the services, and the existing integration suite,
unchanged.

**Blocked by:** none — work can start right away.

**Status:** done

- [x] A dedicated command exists that runs the headless suite
- [x] The headless suite starts no browser and does not bring up the development server
- [x] The existing integration suite stays separate, with its own command (see note)
- [x] A sample test proves that the runner really does catch a failure
- [x] The runner shares the project's TypeScript configuration: a type error in the tests is an
      error

## Closing notes

- Commands: `npm run test:unit` (headless), `npm run test:integration` (Playwright), `npm test`
  (both). The old `npm test` became `npm run test:integration`, with an identical body.
- Service tests will live in `src/**/*.spec.ts`, as REQUIREMENTS §5 mandates. `tests-headless/`
  only holds the scaffolding that belongs to no service: the runner's meta-test and the fixture
  that fails on purpose. `tsconfig.json` includes both folders plus the two Vitest configuration
  files, so a type error in a test — or in the runner's configuration — stops `npm run test:unit`
  before Vitest even starts.
- The integration suite is untouched: `playwright.config.ts` was not modified,
  `npx playwright test --list` still sees only `tests/main.spec.ts`. Inside the container the
  browsers were not installed (`/root/.cache/ms-playwright` did not exist); after
  `npx playwright install chromium` + `install-deps chromium` the test runs but fails on the visual
  snapshot, 265 pixels out of ~26,000 differing: the committed PNG baseline was produced with a
  different renderer. This is a pre-existing environment mismatch, independent of this work; the
  snapshots were **not** regenerated.

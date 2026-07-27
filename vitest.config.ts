import { defineConfig } from 'vitest/config';

/**
 * Headless test suite (ARC-11.1).
 *
 * Runs the engine services in plain Node: no browser, no dev server. The
 * Playwright integration suite lives in `tests/` and is not touched here.
 *
 * Vitest replaces `vite.config.js` with this file, it does not merge the two:
 * the headless suite runs without the tiled plugin and without the excalibur
 * exclusion. That is deliberate — a service under `src/engine/` must not
 * import excalibur (ARC-14) — but a spec that needs either will have to add it
 * here.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.spec.ts', 'tests-headless/**/*.spec.ts'],
    },
});

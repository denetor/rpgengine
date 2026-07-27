import { defineConfig } from 'vitest/config';

/**
 * Fixture suite: test files that fail on purpose.
 *
 * It is never part of the normal headless run — those files live outside the
 * `*.spec.ts` pattern of `vitest.config.ts`. Only the meta test in
 * `tests-headless/runner.spec.ts` starts it, in a separate process, to check
 * that the runner really reports a failure.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests-headless/fixtures/*.ts'],
    },
});

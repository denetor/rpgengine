import { expect, it } from 'vitest';

/**
 * This test fails on purpose, and must keep failing.
 *
 * It is the subject of `../runner.spec.ts`, which starts it through
 * `vitest.fixtures.config.ts` and checks that the runner reports the failure.
 * The normal headless run only matches `*.spec.ts`, so this file never takes
 * part in it.
 */
it('fails on purpose', () => {
    const answer = 41;

    expect(answer).toBe(42);
});

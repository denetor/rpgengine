/**
 * This file breaks a prohibition on purpose, and must keep breaking it.
 *
 * It stands for any file in the project outside the randomness service, where
 * `Math.random()` is forbidden (ARC-9.2). `../../../lint.spec.ts` lints it
 * through `eslint.fixtures.config.mjs` and checks that the linter says so.
 */
export function damageRoll(): number {
    return Math.random() * 10;
}

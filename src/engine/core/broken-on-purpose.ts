/**
 * Broken on purpose, to prove the pull-request check goes red.
 *
 * `Math.random()` outside the randomness service is forbidden by ADR 0001 and
 * caught by `npm run lint`, the first step of the unit lane. This file exists
 * only on the `ci/prove-red` branch and must never reach `master`: delete the
 * branch once the red check has been seen.
 */
export function roll(): number {
    return Math.random();
}

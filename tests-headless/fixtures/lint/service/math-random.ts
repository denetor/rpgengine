/**
 * This file must stay clean, and is the other half of the check.
 *
 * ARC-9.2 forbids `Math.random()` *outside* the randomness service: the
 * service is where an unseeded game gets its seed from, and it is the one
 * place the rule must not fire.
 */
export function unseededRootSeed(): number {
    return Math.floor(Math.random() * 0xffffffff);
}

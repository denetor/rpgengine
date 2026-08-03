/**
 * This file must stay clean, and is the other half of the check.
 *
 * ECMAScript specifies `Math.sqrt` and `Math.imul` exactly, and `Math.floor`,
 * `Math.min`, `Math.max` and `Math.abs` are comparisons and truncations: all
 * of them are allowed on the deterministic path, and a rule that flagged them
 * would be turned off within the week.
 */
export function exactArithmetic(value: number, other: number): number {
    const scrambled = Math.imul(value, 0x2545f491);
    const magnitude = Math.sqrt(Math.abs(scrambled));

    return Math.floor(Math.min(magnitude, Math.max(value, other)));
}

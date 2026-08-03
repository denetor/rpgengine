/**
 * This file breaks a prohibition on purpose, and must keep breaking it.
 *
 * The `Math` constants are specified only to "approximately" the value the
 * standard prints, so an engine may disagree in the last bit — which is why
 * the noise writes `0.7071067811865476` and `1.4142135623730951` as literals
 * rather than reaching for `Math.SQRT1_2` and `Math.SQRT2` (ADR 0001).
 */
export function approximatedConstants(): number {
    return Math.SQRT2 + Math.SQRT1_2 + Math.PI;
}

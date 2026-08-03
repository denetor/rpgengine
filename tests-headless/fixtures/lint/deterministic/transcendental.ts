/**
 * This file breaks a prohibition on purpose, and must keep breaking it.
 *
 * It stands for a file on the deterministic path reaching for the
 * transcendental `Math` functions named by ADR 0001 — the Box–Muller Gaussian
 * a reader is most likely to "fix" back in, among others.
 */
export function approximated(value: number): number {
    const gaussian = Math.sqrt(-2 * Math.log(value)) * Math.cos(value);
    const wave = Math.sin(value) + Math.exp(value);

    return gaussian + wave + Math.pow(value, 3);
}

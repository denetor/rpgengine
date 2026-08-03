/* eslint-disable no-restricted-properties, no-restricted-syntax */

/**
 * This file breaks a prohibition on purpose, and must keep breaking it.
 *
 * A rule that can be switched off in the file that breaks it protects nothing
 * — and this is the rule most likely to be switched off, because its violation
 * looks harmless on the machine of whoever writes it. ADR 0001 admits no
 * exception on the deterministic path, so neither does the linter there.
 */
export function silenced(value: number): number {
    return Math.cos(value) + value ** 2;
}

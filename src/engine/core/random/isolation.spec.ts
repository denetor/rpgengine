import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The service's isolation, read off its own source.
 *
 * These are the only tests here that look at the code instead of at its
 * behaviour, and they exist because what they check has **no observable
 * effect until it is violated**: a `Math.cos` on the deterministic path
 * changes nothing on this machine and changes the last bits on another engine
 * (ADR 0001). Issue 09 replaces them with a lint rule, which catches the same
 * mistakes in the rest of the project too.
 */

const serviceDirectory = dirname(fileURLToPath(import.meta.url));

/**
 * `Math.random` breaks reproducibility outright; the others are
 * *implementation-approximated* by ECMAScript and differ between engines
 * (ADR 0001). `Math.floor`, `Math.sqrt`, `Math.imul`, `Math.min` and
 * `Math.max` are exact, and allowed.
 */
const FORBIDDEN_MATH = ['random', 'log', 'log2', 'log10', 'cos', 'sin', 'tan', 'exp', 'pow'];

/** Reading files, or reaching for the DOM, would break ARC-4.1 and ARC-1.2. */
const FORBIDDEN_ENVIRONMENT = [
    'node:fs',
    'require(',
    'localStorage',
    'document.',
    'window.',
    'fetch(',
];

interface Source {
    file: string;
    text: string;
}

function serviceSources(): Source[] {
    return readdirSync(serviceDirectory)
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
        .map((file) => ({ file, text: readFileSync(join(serviceDirectory, file), 'utf-8') }));
}

function occurrencesOf(names: readonly string[], prefix: string): string[] {
    const found: string[] = [];
    for (const { file, text } of serviceSources()) {
        for (const name of names) {
            if (text.includes(`${prefix}${name}`)) {
                found.push(`${file}: ${prefix}${name}`);
            }
        }
    }
    return found;
}

describe('isolation', () => {
    it('reads its own sources', () => {
        expect(serviceSources().length).toBeGreaterThan(0);
    });

    it('uses no forbidden Math function', () => {
        expect(occurrencesOf(FORBIDDEN_MATH, 'Math.')).toEqual([]);
    });

    it('reads no files and touches no browser global', () => {
        expect(occurrencesOf(FORBIDDEN_ENVIRONMENT, '')).toEqual([]);
    });

    it('imports nothing but its own files', () => {
        const importPattern = /(?:^|\n)\s*import[^'"]*['"]([^'"]+)['"]/g;
        const foreign: string[] = [];

        for (const { file, text } of serviceSources()) {
            for (const match of text.matchAll(importPattern)) {
                const specifier = match[1];
                if (!specifier.startsWith('./')) {
                    foreign.push(`${file} imports ${specifier}`);
                }
            }
        }

        expect(foreign).toEqual([]);
    });
});

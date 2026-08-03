import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The service's isolation, read off its own source.
 *
 * These are the only tests here that look at the code instead of at its
 * behaviour, and they exist because what they check has **no observable
 * effect until it is violated**.
 *
 * The prohibition on the `Math` functions that ADR 0001 freezes used to be
 * checked here too, by searching this text. It has moved to the linter —
 * `eslint.determinism.mjs`, run by `npm run lint` — which reads the syntax
 * rather than the characters, covers the rest of the project as well, and no
 * longer trips over a doc comment that merely *names* a forbidden function.
 */

const serviceDirectory = dirname(fileURLToPath(import.meta.url));

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

function occurrencesOfAny(names: readonly string[]): string[] {
    const found: string[] = [];
    for (const { file, text } of serviceSources()) {
        for (const name of names) {
            if (text.includes(name)) {
                found.push(`${file}: ${name}`);
            }
        }
    }
    return found;
}

describe('isolation', () => {
    it('reads its own sources', () => {
        expect(serviceSources().length).toBeGreaterThan(0);
    });

    it('reads no files and touches no browser global', () => {
        expect(occurrencesOfAny(FORBIDDEN_ENVIRONMENT)).toEqual([]);
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

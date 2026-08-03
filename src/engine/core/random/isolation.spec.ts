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

/**
 * Words that belong to **this** game, and to no generic service (ARC-3.2).
 *
 * Taken from `docs/GAMEPLAY.md`: they are the things this project's designers talk
 * about. A generic service may be *used* for any of them and must know none of
 * them — a constant named after one, a default channel called `'loot'`, a
 * profile that only makes sense next to a goblin, and the service has quietly
 * stopped being liftable into another project.
 *
 * Words that are ordinary English are deliberately **not** here: `pick(items)`
 * takes items in the sense of "the elements of a list", not in `INV`'s sense,
 * and a list of words that flagged it would be turned off by the next person
 * who tripped over it.
 */
const DOMAIN_WORDS = [
    'alchemy',
    'chest',
    'combat',
    'damage',
    'dialogue',
    'dungeon',
    'enemy',
    'goblin',
    'hitpoints',
    'inventory',
    'lockpick',
    'loot',
    'mana',
    'npc',
    'perk',
    'player',
    'potion',
    'quest',
    'respawn',
    'spell',
    'sword',
    'tavern',
    'weapon',
];

interface Source {
    file: string;
    text: string;
}

/**
 * Every source the service ships, subdirectories included.
 *
 * Recursive on purpose: a check that reads one directory goes quiet the day
 * somebody adds a folder, and goes quiet in exactly the way that looks like
 * passing.
 */
function serviceSources(): Source[] {
    return readdirSync(serviceDirectory, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile())
        .filter((entry) => entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts'))
        .map((entry) => ({
            file: entry.name,
            text: readFileSync(join(entry.parentPath, entry.name), 'utf-8'),
        }));
}

/**
 * A source with its comments taken out — what the service actually *is*, as
 * opposed to how it explains itself.
 *
 * The distinction is the same one that moved the `Math` prohibition to the
 * linter: a doc comment that says "loot from that enemy" to make a paragraph
 * concrete has not made the code domain-specific, and a check that could not
 * tell the two apart would be answered by deleting the sentence.
 *
 * This is a regex and not a parser, so the thing to be careful about is a
 * comment marker **inside a string literal**: stripping from there to the end
 * of the line would delete real code, and deleting code from a scan that
 * reports what it finds is a **silent pass**, not a false alarm. Hence the
 * quote count — a `//` is only a comment when the quotes before it on that line
 * are balanced. A block comment cannot open inside a string for the same
 * reason, and is left to the simpler rule.
 */
function withoutComments(text: string): string {
    const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, ' ');

    return withoutBlocks
        .split('\n')
        .map((line) => codeBefore(line))
        .join('\n');
}

/** The part of one line that is not a trailing `//` comment. */
function codeBefore(line: string): string {
    for (let index = 0; index < line.length - 1; index += 1) {
        if (line[index] === '/' && line[index + 1] === '/' && quotesBalanced(line.slice(0, index))) {
            return line.slice(0, index);
        }
    }
    return line;
}

/** True when every quote in `text` has been closed again. */
function quotesBalanced(text: string): boolean {
    let quotes = 0;
    for (const character of text) {
        if (character === "'" || character === '"' || character === '`') {
            quotes += 1;
        }
    }
    return quotes % 2 === 0;
}

/**
 * Every word of `words` that `text` uses — as a word of its own, wherever the
 * code puts word boundaries.
 *
 * `\b` is not enough, and that is the whole of why this is written out: it does
 * not break at an underscore or at a change of case, so `LOOT_CHANNEL_CAP` and
 * `defaultCombatReduction` — the two shapes a domain name most often actually
 * takes — would both go through a regex scan untouched. The text is split into
 * runs of letters, those runs are split again at every lowercase→uppercase
 * step, and each piece is compared whole.
 */
function wordsIn(text: string, words: readonly string[]): string[] {
    const used = new Set<string>();
    for (const run of text.match(/[A-Za-z]+/g) ?? []) {
        for (const piece of run.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ')) {
            used.add(singular(piece.toLowerCase()));
        }
    }

    return words.filter((word) => used.has(word));
}

/** A word without its plural `s`, so that one entry in the list covers both. */
function singular(word: string): string {
    return word.endsWith('s') ? word.slice(0, word.length - 1) : word;
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
        const read = serviceSources().map((source) => source.file);

        // Named files, not a count: `length > 0` would still pass if the walk
        // came back with one file out of fifteen, and every scan below would
        // then be reporting on almost nothing.
        expect(read).toContain('random.ts');
        expect(read).toContain('index.ts');
        expect(read.length).toBeGreaterThan(10);
    });

    it('reads no files and touches no browser global', () => {
        expect(occurrencesOfAny(FORBIDDEN_ENVIRONMENT)).toEqual([]);
    });

    it('would notice a word from this game if there were one', () => {
        // The scan is the kind of test that passes by finding nothing, which is
        // also how it passes when it has stopped working. This is the sample
        // that says it still reads what it claims to read — and it is written
        // in the shapes a domain name really takes, not only the easy one: a
        // screaming-snake constant, a camelCase identifier, a call, a string.
        const code = [
            "const LOOT_CHANNEL_CAP = 512;",
            'const defaultCombatReduction = 0.6;',
            'function questRepeatFloor() { return goblinFight; }',
            "const drop = 'sword:iron';",
        ].join('\n');

        expect(wordsIn(withoutComments(code), DOMAIN_WORDS).sort()).toEqual([
            'combat',
            'goblin',
            'loot',
            'quest',
            'sword',
        ]);
    });

    it('leaves an explanation alone, and does not lose code to a comment marker', () => {
        const explanation = '/** The loot a player takes from an enemy. */\nconst x = 1; // a quest\n';

        expect(wordsIn(withoutComments(explanation), DOMAIN_WORDS)).toEqual([]);

        // A `//` inside a string is not a comment. Stripping from there would
        // delete real code, and a scan that reports what it finds passes
        // silently when code goes missing — the failure mode worth guarding.
        const withMarker = "const separator = '//'; const channel = 'loot:rats';";

        expect(wordsIn(withoutComments(withMarker), DOMAIN_WORDS)).toEqual(['loot']);
    });

    it('contains no name from this game (ARC-3.2)', () => {
        const found: string[] = [];

        for (const { file, text } of serviceSources()) {
            for (const word of wordsIn(withoutComments(text), DOMAIN_WORDS)) {
                found.push(`${file}: ${word}`);
            }
        }

        expect(found).toEqual([]);
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

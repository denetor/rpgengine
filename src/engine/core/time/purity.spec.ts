import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The clock's independence, read off its own source.
 *
 * These are the only tests here that look at the code instead of at its
 * behaviour, and they exist because what they check has **no observable effect
 * until it is violated**: a clock that consulted the wall clock, or that armed a
 * `setTimeout`, would pass every other test in this directory and quietly make
 * the same tick behave differently on two machines, in a game that is meant to
 * be replayable from a seed (ARC-9.1, TIME-1).
 *
 * It is a sharper prohibition here than for any other service, because this is
 * the service somebody would reach for a real clock *in*. TIME-1 puts one door
 * on time — `advance()` — and a service that read `Date.now()` behind it would
 * be handing the domain a second one while appearing to obey.
 *
 * The linter already refuses `Math.random()` everywhere and rule 4 of the
 * boundary check already refuses `engine/ → game/`; a reading of the time and a
 * scheduled callback are what neither of them sees.
 *
 * The scan reads **the sources the service ships**, spec files excluded. That
 * exclusion is what lets `types.spec.ts` name the very things a payload may not
 * carry, and lets these comments say what they are about.
 */

const serviceDirectory = dirname(fileURLToPath(import.meta.url));

/**
 * Reading real time, in every form it comes in.
 *
 * A clock that timestamped a deadline, measured an advance or dated an event
 * would have taken a dependency on *when it ran*, and two runs of the same seed
 * would stop being the same game.
 */
const CLOCK_READINGS = ['new Date', 'Date.now', 'Date.parse', 'Date.UTC', 'performance.now'];

/**
 * The host's own schedulers — the thing this service exists instead of.
 *
 * `setTimeout` cannot be paused, cannot be saved, cannot be replayed and fires
 * on a beat the browser chose. A single one of them behind this surface would
 * make a save that quietly loses whatever it was holding (ARC-10.4).
 */
const HOST_SCHEDULERS = [
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'queueMicrotask',
    'process.nextTick',
];

/**
 * Randomness, in the two forms available without importing anything.
 *
 * `Math.random()` is already refused by the linter, project-wide. It is named
 * again here because this file is where somebody looks for the answer to "what
 * may the clock not do", and a list missing the obvious entry reads as
 * permission.
 */
const RANDOMNESS = ['Math.random', 'crypto.'];

/** Reading files, or reaching for the DOM, would break ARC-4.1 and ARC-1.2. */
const FORBIDDEN_ENVIRONMENT = ['node:fs', 'require(', 'localStorage', 'document.', 'window.'];

interface Source {
    readonly file: string;
    readonly text: string;
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

/** Where `file: name` for every forbidden name a source uses. */
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

/** Every module specifier the service imports, as written. */
function importedModules(): string[] {
    const imported: string[] = [];

    for (const { text } of serviceSources()) {
        for (const match of text.matchAll(/(?:from|import)\s+'([^']+)'/g)) {
            imported.push(match[1]);
        }
    }

    return imported;
}

describe('the clock', () => {
    it('reads its own sources', () => {
        const read = serviceSources().map((source) => source.file);

        // `index.ts` by name and the rest by count. Not because a count is a
        // good check — `length > 0` would still pass if the walk came back with
        // one file out of four — but because it is the one name that is fixed:
        // the boundary check itself defines a service's public surface as its
        // `index.ts`, and everything beside it is a layout this service is free
        // to change without a test having an opinion.
        expect(read).toContain('index.ts');
        expect(read.length).toBeGreaterThan(1);
    });

    it('never reads a clock of its own', () => {
        expect(occurrencesOfAny(CLOCK_READINGS)).toEqual([]);
    });

    it('never asks the host to call it back', () => {
        expect(occurrencesOfAny(HOST_SCHEDULERS)).toEqual([]);
    });

    it('never produces randomness and never touches the environment', () => {
        expect(occurrencesOfAny([...RANDOMNESS, ...FORBIDDEN_ENVIRONMENT])).toEqual([]);
    });

    it('imports nothing but its own files', () => {
        // Stated as "everything it imports is beside it" rather than as a list
        // of layers it may not reach for: `game/`, `presentation/`, the bus,
        // excalibur, a node built-in and a package nobody has installed yet are
        // all caught by the same sentence, and the sentence needs no
        // maintenance.
        const foreign = importedModules().filter((specifier) => !specifier.startsWith('./'));

        expect(foreign).toEqual([]);
    });

    it('would notice an import that left the directory', () => {
        // The scan above passes by finding nothing, which is also how it passes
        // when it has stopped working. This is the sample that says it still
        // reads what it claims to read — a count and not a name, because naming
        // one would tie this file to a layout the service is free to change.
        expect(importedModules().length).toBeGreaterThan(0);
    });
});

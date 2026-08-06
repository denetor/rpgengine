import { describe, expect, it } from 'vitest';
import { composeConfig, ConfigError } from './index';
import type { ConfigIssue, Problem } from './index';

/**
 * The two checks that are about the **set** of sections rather than about any
 * one value, and that therefore belong to `CFG` and to nothing else: no service
 * sees the other sections, so no service can perform either.
 *
 * The first is the designer's (CFG-16): a source key that no shape claims is
 * refused, so that a misspelt section name cannot make a file be read by
 * nobody. The second is the programmer's: two shapes claiming one key is a bug
 * in the caller's code, and is thrown rather than reported.
 *
 * The bakery below is invented here, as in the sibling files, and `issuesOf` is
 * a verbatim copy of the one in `refusal.spec.ts`. Both are deliberate: ten
 * lines of `try`/`catch` are cheaper than a shared module inside a service
 * directory that only tests would import, and a spec that declares its own
 * material can be read from the top without opening another file.
 */

/** A check that accepts anything: this file is about keys, not about values. */
function accepts(): readonly Problem[] {
    return [];
}

/** The section a misspelt key is meant to have been aiming at. */
const OVEN_SECTION = { key: 'oven', fallback: { temperature: 220 }, validate: accepts };

/** A second section, so that a message has more than one name to list. */
const DELIVERY_SECTION = { key: 'delivery', fallback: { vans: 2 }, validate: accepts };

/** A section with a check that refuses something, for the tests that need one. */
const FLOUR_SECTION = {
    key: 'flour',
    fallback: 'type 00',
    validate: (value: unknown): readonly Problem[] =>
        typeof value === 'string' ? [] : [{ path: '', value, message: 'expected a kind of flour' }],
};

/** The issues of the one throw a composition is expected to make. */
function issuesOf(compose: () => unknown): readonly ConfigIssue[] {
    try {
        compose();
    } catch (error) {
        if (error instanceof ConfigError) {
            return error.issues;
        }
        throw error;
    }
    throw new Error('the composition was expected to refuse, and did not');
}

describe('a section no shape claims', () => {
    it('is refused, naming the source it appeared in and the sections expected', () => {
        const issues = issuesOf(() =>
            composeConfig(
                [OVEN_SECTION, DELIVERY_SECTION],
                [{ name: 'bakery.json', values: { ovne: { temperature: 240 } } }],
            ),
        );

        expect(issues).toEqual([
            {
                source: 'bakery.json',
                path: 'ovne',
                value: { temperature: 240 },
                message: 'is not a section of this configuration (expected oven, delivery)',
            },
        ]);
    });

    it('is reported for every unclaimed key, across every source', () => {
        const issues = issuesOf(() =>
            composeConfig(
                [OVEN_SECTION],
                [
                    { name: 'base', values: { ovne: {}, delivry: {} } },
                    { name: 'local', values: { oven: {}, flor: {} } },
                ],
            ),
        );

        expect(issues.map((issue) => [issue.source, issue.path])).toEqual([
            ['base', 'ovne'],
            ['base', 'delivry'],
            ['local', 'flor'],
        ]);
    });

    it('is refused together with a bad value in a section that does exist', () => {
        const issues = issuesOf(() =>
            composeConfig(
                [OVEN_SECTION, FLOUR_SECTION],
                [{ name: 'bakery.json', values: { ovne: {}, flour: 12 } }],
            ),
        );

        expect(issues.map((issue) => issue.path)).toEqual(['ovne', '']);
    });

    it('is not what an empty source is: mentioning no section at all is legitimate', () => {
        const [oven] = composeConfig([OVEN_SECTION], [{ name: 'bakery.json', values: {} }]);

        expect(oven).toEqual({ temperature: 220 });
    });
});

describe('a key two shapes claim', () => {
    /** The same key as `OVEN_SECTION`, as a copy-paste in a bootstrap would write it. */
    const SECOND_OVEN = { key: 'oven', fallback: { temperature: 180 }, validate: accepts };

    it('is thrown about, and not reported as something wrong with the game’s data', () => {
        const compose = () => composeConfig([OVEN_SECTION, SECOND_OVEN], []);

        expect(compose).toThrow(Error);
        expect(compose).not.toThrow(ConfigError);
    });

    it('is named by what is thrown, since the bug is in the caller’s own code', () => {
        const compose = () => composeConfig([OVEN_SECTION, SECOND_OVEN], []);

        expect(compose).toThrow(/oven/);
    });

    it('is refused before any source has been looked at', () => {
        let read = false;
        const watched = {
            name: 'bakery.json',
            values: {
                get oven() {
                    read = true;
                    return { temperature: 240 };
                },
            },
        };

        expect(() => composeConfig([OVEN_SECTION, SECOND_OVEN], [watched])).toThrow(Error);
        expect(read).toBe(false);
    });
});

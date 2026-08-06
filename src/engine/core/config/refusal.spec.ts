import { describe, expect, it } from 'vitest';
import { composeConfig, ConfigError, describeIssue } from './index';
import type { ConfigIssue, Problem } from './index';

/**
 * The refusal (CFG-3, CTX-10).
 *
 * Composing without refusing would deliver the dangerous half of the service: a
 * value that reached a constructor unchecked is the failure this sheet exists
 * to prevent. So the questions here are what is checked (the **merged** result,
 * never a single source), how much is reported (**everything**, in one throw),
 * and what an issue says (source, path, value and message).
 *
 * The sections are the invented bakery of `composition.spec.ts` again, given
 * checks that actually refuse something — declared here rather than shared,
 * which is deliberate: a file that says what a bad oven is next to the tests
 * about bad ovens can be read from the top, and sections invented for one
 * question have no business constraining another. Nothing of this game appears
 * in them, and nothing is read from a file.
 */

interface OvenParameters {
    readonly temperature: number;
    readonly shelves: number;
}

const OVEN_FALLBACK: OvenParameters = { temperature: 220, shelves: 3 };

/** What an oven has to be. Two parameters, both mandatory once merged. */
function ovenProblems(value: unknown): readonly Problem[] {
    if (!isRecord(value)) {
        return [{ path: '', value, message: 'expected an oven' }];
    }

    const problems: Problem[] = [];
    if (typeof value.temperature !== 'number' || value.temperature <= 0) {
        problems.push({
            path: 'temperature',
            value: value.temperature,
            message: 'expected a temperature above zero',
        });
    }
    if (typeof value.shelves !== 'number' || value.shelves < 1) {
        problems.push({
            path: 'shelves',
            value: value.shelves,
            message: 'expected at least one shelf',
        });
    }
    return problems;
}

const OVEN_SECTION = {
    key: 'oven',
    fallback: OVEN_FALLBACK,
    validate: ovenProblems,
};

interface DeliveryParameters {
    readonly vans: number;
}

const DELIVERY_FALLBACK: DeliveryParameters = { vans: 2 };

/** What a delivery round has to be. One parameter, and one way to be wrong. */
function deliveryProblems(value: unknown): readonly Problem[] {
    if (isRecord(value) && typeof value.vans === 'number' && value.vans >= 1) {
        return [];
    }
    return [{ path: 'vans', value, message: 'expected at least one van' }];
}

const DELIVERY_SECTION = {
    key: 'delivery',
    fallback: DELIVERY_FALLBACK,
    validate: deliveryProblems,
};

/**
 * A section with no sensible default: valid only once somebody writes it, which
 * is what makes it the one whose issue names `defaults`.
 */
const FLOUR_SECTION = {
    key: 'flour',
    fallback: undefined,
    validate: (value: unknown): readonly Problem[] =>
        typeof value === 'string' ? [] : [{ path: '', value, message: 'expected a kind of flour' }],
};

/**
 * A section that keeps the values its check was handed.
 *
 * It is how a test asks the question CTX-10 turns on: not "did the composition
 * throw", but "was every section still looked at before it did".
 */
function recordingSection(key: string, seen: unknown[]) {
    return {
        key,
        fallback: undefined,
        validate: (value: unknown): readonly Problem[] => {
            seen.push(value);
            return [];
        },
    };
}

/** A plain object: not null, not an array, not a primitive. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

describe('a value a section does not accept', () => {
    it('is refused, and what is thrown carries the problem the section reported', () => {
        const issues = issuesOf(() =>
            composeConfig(
                [OVEN_SECTION],
                [{ name: 'bakery.json', values: { oven: { temperature: -5 } } }],
            ),
        );

        expect(issues).toEqual([
            {
                source: 'bakery.json',
                path: 'temperature',
                value: -5,
                message: 'expected a temperature above zero',
            },
        ]);
    });
});

describe('what the check is run on', () => {
    it('accepts a partial source that is only valid once merged with the fallback', () => {
        const [oven] = composeConfig(
            [OVEN_SECTION],
            [{ name: 'bakery.json', values: { oven: { temperature: 240 } } }],
        );

        expect(oven).toEqual({ temperature: 240, shelves: 3 });
    });

    it('hands the check the merged result and nothing else', () => {
        const seen: unknown[] = [];

        composeConfig(
            [recordingSection('oven', seen)],
            [
                { name: 'base', values: { oven: { temperature: 240 } } },
                { name: 'local', values: { oven: { shelves: 5 } } },
            ],
        );

        expect(seen).toEqual([{ temperature: 240, shelves: 5 }]);
    });
});

describe('how much is reported', () => {
    it('reports every problem of every section in one throw', () => {
        const issues = issuesOf(() =>
            composeConfig(
                [OVEN_SECTION, DELIVERY_SECTION],
                [
                    {
                        name: 'bakery.json',
                        values: { oven: { temperature: -5, shelves: 0 }, delivery: { vans: 0 } },
                    },
                ],
            ),
        );

        expect(issues.map((issue) => issue.path)).toEqual(['temperature', 'shelves', 'vans']);
    });

    it('leaves a section that is not an object to report itself once', () => {
        const issues = issuesOf(() =>
            composeConfig([OVEN_SECTION], [{ name: 'bakery.json', values: { oven: 'hot' } }]),
        );

        expect(issues).toEqual([
            { source: 'bakery.json', path: '', value: 'hot', message: 'expected an oven' },
        ]);
    });

    it('returns nothing at all when anything is invalid', () => {
        const compose = () =>
            composeConfig(
                [OVEN_SECTION, DELIVERY_SECTION],
                [{ name: 'bakery.json', values: { delivery: { vans: 0 } } }],
            );

        expect(compose).toThrow(ConfigError);
    });

    it('still checks every section when an earlier one has already failed', () => {
        const seen: unknown[] = [];

        issuesOf(() =>
            composeConfig(
                [DELIVERY_SECTION, recordingSection('oven', seen)],
                [{ name: 'bakery.json', values: { delivery: { vans: 0 }, oven: { shelves: 5 } } }],
            ),
        );

        expect(seen).toEqual([{ shelves: 5 }]);
    });
});

describe('the source an issue names', () => {
    it('is `defaults` when no source mentioned the section', () => {
        const issues = issuesOf(() => composeConfig([FLOUR_SECTION], []));

        expect(issues.map((issue) => issue.source)).toEqual(['defaults']);
    });

    it('is the one source that carried the section', () => {
        const issues = issuesOf(() =>
            composeConfig([DELIVERY_SECTION], [{ name: 'local', values: { delivery: { vans: 0 } } }]),
        );

        expect(issues.map((issue) => issue.source)).toEqual(['local']);
    });

    it('is `CFG`’s to say: a check that names one of its own is overruled', () => {
        const madeUp: Problem & { readonly source: string } = {
            source: 'a file the oven made up',
            path: '',
            value: null,
            message: 'expected an oven',
        };

        const opinionated = {
            key: 'oven',
            fallback: OVEN_FALLBACK,
            validate: (): readonly Problem[] => [madeUp],
        };

        const issues = issuesOf(() =>
            composeConfig([opinionated], [{ name: 'bakery.json', values: { oven: {} } }]),
        );

        expect(issues.map((issue) => issue.source)).toEqual(['bakery.json']);
    });

    it('is every source that composed the section, joined', () => {
        const issues = issuesOf(() =>
            composeConfig(
                [DELIVERY_SECTION],
                [
                    { name: 'base', values: { delivery: { vans: 3 } } },
                    { name: 'local', values: { delivery: { vans: 0 } } },
                ],
            ),
        );

        expect(issues.map((issue) => issue.source)).toEqual(['base+local']);
    });
});

describe('the message of an issue', () => {
    it('is one line: where it came from, where it is, what was expected and what was found', () => {
        const issue: ConfigIssue = {
            source: 'bakery.json',
            path: 'oven.temperature',
            value: -5,
            message: 'expected a temperature above zero',
        };

        expect(describeIssue(issue)).toBe(
            'bakery.json: oven.temperature: expected a temperature above zero; found -5',
        );
    });

    it('says only where it came from when the section itself is the problem', () => {
        const issue: ConfigIssue = {
            source: 'defaults',
            path: '',
            value: undefined,
            message: 'expected an oven',
        };

        expect(describeIssue(issue)).toBe('defaults: expected an oven; found undefined');
    });
});

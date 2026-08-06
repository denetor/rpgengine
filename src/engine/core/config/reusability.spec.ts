import { describe, expect, it } from 'vitest';
import { composeConfig, ConfigError, describeIssue } from './index';
import type { ConfigIssue, Problem } from './index';

/**
 * The reusability proof (ARC-3.4, ARC-3.2, CFG-12).
 *
 * `CFG` is declared to own no key, no default, no range and no unit, and to be
 * usable unchanged by a game whose sections it has never heard of. That is a
 * promise which degrades in silence: one key name assumed, one default that
 * only makes sense for an action RPG, one message that mentions a channel, and
 * the mechanism is domain-specific before anybody notices. This file is the
 * test that would notice.
 *
 * Everything below belongs to **an estate growing grapes**: how the rows are
 * planted, how large the plots are, how much rain a year is expected to bring,
 * what a taster writes down. There is no dungeon, no loot and no damage
 * anywhere in it, and nothing here is imported from this game's code — the only
 * imports are the service's own door and the values this file makes up.
 *
 * That includes the test scaffolding: nothing is borrowed from the suites next
 * door, and the estate's checks are written out here rather than reached for. A
 * proof that the service can be lifted into another project must not itself
 * import the project.
 *
 * The criterion, stated so that a later edit cannot quietly fail it: **if
 * making this file pass ever requires changing the service, the service was not
 * generic**.
 */

/** How the vines are planted, which nobody but the estate has an opinion about. */
interface RowParameters {
    readonly spacingInMetres: number;
    readonly vinesPerRow: number;
}

/** The plots, their sizes, and the order somebody walks them in. */
interface PlotParameters {
    readonly hectares: Readonly<Record<string, number>>;
    readonly walkedInOrder: readonly string[];
}

/** What the estate expects of a year's weather. */
interface RainfallParameters {
    readonly expectedMillimetres: number;
    readonly aDryYearIsBelow: number;
}

/** A tasting the estate may or may not hold this year. */
interface TastingParameters {
    readonly peopleAtTheTable: number;
    readonly wordsAllowed: readonly string[];
}

/** The rows as they stand in the ground, which is what they are unless a file says otherwise. */
const ROWS_AS_PLANTED: RowParameters = { spacingInMetres: 2.4, vinesPerRow: 60 };

/** The plots as the last survey left them. */
const PLOTS_AS_SURVEYED: PlotParameters = {
    hectares: { 'the-hill': 1.5, 'below-the-well': 0.8 },
    walkedInOrder: ['the-hill', 'below-the-well'],
};

/** What an ordinary year does here. */
const RAINFALL_IN_AN_ORDINARY_YEAR: RainfallParameters = {
    expectedMillimetres: 700,
    aDryYearIsBelow: 450,
};

/**
 * Everything wrong with the estate's rows, in the estate's own terms.
 *
 * Every problem is reported and not merely the first, because whoever wrote the
 * file would rather fix four things once than four times.
 */
function rowProblems(value: unknown): readonly Problem[] {
    if (!isRecord(value)) {
        return [{ path: '', value, message: 'expected the rows to be written as an object' }];
    }

    const problems: Problem[] = [];

    const spacing = value.spacingInMetres;
    if (typeof spacing !== 'number' || spacing <= 0) {
        problems.push({
            path: 'spacingInMetres',
            value: spacing,
            message: 'expected a distance in metres between one row and the next',
        });
    }

    const vines = value.vinesPerRow;
    if (typeof vines !== 'number' || !Number.isInteger(vines) || vines < 1) {
        problems.push({
            path: 'vinesPerRow',
            value: vines,
            message: 'expected a whole number of vines, of at least one',
        });
    }

    return problems;
}

/**
 * Everything wrong with the estate's plots.
 *
 * The rule that matters here is one the composition could not possibly know: a
 * plot cannot be walked before it has been measured.
 */
function plotProblems(value: unknown): readonly Problem[] {
    if (!isRecord(value)) {
        return [{ path: '', value, message: 'expected the plots to be written as an object' }];
    }

    const hectares = value.hectares;
    if (!isRecord(hectares)) {
        return [
            { path: 'hectares', value: hectares, message: 'expected each plot and its size' },
        ];
    }

    for (const [plot, size] of Object.entries(hectares)) {
        if (typeof size !== 'number' || size <= 0) {
            return [
                {
                    path: `hectares['${plot}']`,
                    value: size,
                    message: 'expected a size in hectares: a plot of no land is not a plot',
                },
            ];
        }
    }

    const walked = value.walkedInOrder;
    if (!Array.isArray(walked)) {
        return [
            {
                path: 'walkedInOrder',
                value: walked,
                message: 'expected the plots in the order somebody walks them',
            },
        ];
    }

    const problems: Problem[] = [];
    for (let position = 0; position < walked.length; position += 1) {
        const plot = walked[position];
        if (typeof plot !== 'string' || !Object.hasOwn(hectares, plot)) {
            problems.push({
                path: `walkedInOrder[${position}]`,
                value: plot,
                message: `expected a plot that has been measured (${measured(hectares)})`,
            });
        }
    }
    return problems;
}

/**
 * Everything wrong with what the estate expects of the weather.
 *
 * The two numbers are checked against **each other**, which is the kind of rule
 * that can only live with whoever the numbers belong to.
 */
function rainfallProblems(value: unknown): readonly Problem[] {
    if (!isRecord(value)) {
        return [{ path: '', value, message: 'expected the rainfall to be written as an object' }];
    }

    const expected = value.expectedMillimetres;
    const dry = value.aDryYearIsBelow;

    if (typeof expected !== 'number' || typeof dry !== 'number') {
        return [
            {
                path: '',
                value,
                message: 'expected two amounts of rain, in millimetres',
            },
        ];
    }

    if (dry >= expected) {
        return [
            {
                path: 'aDryYearIsBelow',
                value: dry,
                message: `expected less rain than an ordinary year brings (${expected}mm)`,
            },
        ];
    }

    return [];
}

/** Everything wrong with a tasting, of which the absence is not one (nobody has to hold one). */
function tastingProblems(value: unknown): readonly Problem[] {
    if (value === undefined) {
        return [];
    }
    if (!isRecord(value)) {
        return [{ path: '', value, message: 'expected the tasting to be written as an object' }];
    }

    const problems: Problem[] = [];

    const peopleAtTheTable = value.peopleAtTheTable;
    if (typeof peopleAtTheTable !== 'number' || peopleAtTheTable < 2) {
        problems.push({
            path: 'peopleAtTheTable',
            value: peopleAtTheTable,
            message: 'expected at least two people: one person tasting alone is an opinion',
        });
    }

    const wordsAllowed = value.wordsAllowed;
    if (!Array.isArray(wordsAllowed) || wordsAllowed.some((word) => typeof word !== 'string')) {
        problems.push({
            path: 'wordsAllowed',
            value: wordsAllowed,
            message: 'expected the words a taster may write down, as a list',
        });
    }

    return problems;
}

const ROWS_SECTION = { key: 'rows', fallback: ROWS_AS_PLANTED, validate: rowProblems };

const PLOTS_SECTION = { key: 'plots', fallback: PLOTS_AS_SURVEYED, validate: plotProblems };

const RAINFALL_SECTION = {
    key: 'rainfall',
    fallback: RAINFALL_IN_AN_ORDINARY_YEAR,
    validate: rainfallProblems,
};

/**
 * The tasting, which the estate may hold or not.
 *
 * The type is written on the section rather than on a constant holding the
 * absence: a `const NO_TASTING: TastingParameters | undefined = undefined` is
 * narrowed back to `undefined` wherever it is read, and the slice would come
 * back typed `undefined` — after which no year with a tasting in it would fit.
 */
const TASTING_SECTION: {
    key: string;
    fallback: TastingParameters | undefined;
    validate: typeof tastingProblems;
} = { key: 'tasting', fallback: undefined, validate: tastingProblems };

/**
 * The four sections the estate composes, in the order it wants them back.
 *
 * `as const` is not decoration and was not there in the first draft. A list of
 * sections given a name of its own widens to an *array of the union* of its
 * elements, and every slice then comes back typed as every section at once —
 * the composition's `const` type parameter preserves a tuple only for a literal
 * written at the call site. An estate that keeps its sections in one place, as
 * this one does and as any bootstrap would, has to say `as const` to keep the
 * types it was promised.
 */
const THE_ESTATE = [ROWS_SECTION, PLOTS_SECTION, RAINFALL_SECTION, TASTING_SECTION] as const;

/** The plots that have been measured, for a message that has to list them. */
function measured(hectares: Record<string, unknown>): string {
    return Object.keys(hectares)
        .map((plot) => `'${plot}'`)
        .join(', ');
}

/** A plain object: not null, not an array, not a primitive. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One of the estate's sections, with a note taken every time its check is asked. */
function recording<T>(
    section: { key: string; fallback: T; validate(value: unknown): readonly Problem[] },
    lookedAt: string[],
): { key: string; fallback: T; validate(value: unknown): readonly Problem[] } {
    return {
        key: section.key,
        fallback: section.fallback,
        validate(value: unknown): readonly Problem[] {
            lookedAt.push(section.key);
            return section.validate(value);
        },
    };
}

/**
 * The issues of the one refusal a composition is expected to make.
 *
 * Written out here rather than borrowed from the suites next door, for the
 * reason at the head of the file: eight lines of `try`/`catch` cost less than a
 * proof of independence that depends on this game's scaffolding.
 */
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

describe('an estate composing its own parameters', () => {
    it('takes every section from its own fallback when nobody has written anything', () => {
        const [rows, plots, rainfall, tasting] = composeConfig(THE_ESTATE, []);

        expect(rows).toEqual({ spacingInMetres: 2.4, vinesPerRow: 60 });
        expect(plots).toEqual({
            hectares: { 'the-hill': 1.5, 'below-the-well': 0.8 },
            walkedInOrder: ['the-hill', 'below-the-well'],
        });
        expect(rainfall).toEqual({ expectedMillimetres: 700, aDryYearIsBelow: 450 });
        expect(tasting).toBeUndefined();
    });

    it('takes what the estate wrote down over what it found in the ground', () => {
        const [rows] = composeConfig(THE_ESTATE, [
            { name: 'estate.json', values: { rows: { spacingInMetres: 3, vinesPerRow: 44 } } },
        ]);

        expect(rows).toEqual({ spacingInMetres: 3, vinesPerRow: 44 });
    });

    it('applies two files in the order the estate handed them over', () => {
        const [, , rainfall] = composeConfig(THE_ESTATE, [
            { name: 'estate.json', values: { rainfall: { aDryYearIsBelow: 500 } } },
            { name: 'this-year.json', values: { rainfall: { aDryYearIsBelow: 520 } } },
        ]);

        expect(rainfall.aDryYearIsBelow).toBe(520);
    });

    it('leaves what a file does not mention exactly where it was', () => {
        // Writing one of the two amounts must not turn the other into nothing:
        // a file that says what changed this year is the ordinary case, not a
        // whole configuration written out again.
        const [, , rainfall] = composeConfig(THE_ESTATE, [
            { name: 'this-year.json', values: { rainfall: { aDryYearIsBelow: 520 } } },
        ]);

        expect(rainfall).toEqual({ expectedMillimetres: 700, aDryYearIsBelow: 520 });
    });

    it('replaces the plots it is given whole, rather than mixing them with the survey', () => {
        // The estate sold the plot below the well. A composition that merged
        // the two maps would keep selling its grapes for ever.
        const [, plots] = composeConfig(THE_ESTATE, [
            {
                name: 'estate.json',
                values: {
                    plots: { hectares: { 'the-hill': 1.5 }, walkedInOrder: ['the-hill'] },
                },
            },
        ]);

        expect(plots).toEqual({ hectares: { 'the-hill': 1.5 }, walkedInOrder: ['the-hill'] });
    });
});

describe('an estate that has written something it cannot mean', () => {
    it('is told what is wrong in its own words, and which of its files said it', () => {
        const issues = issuesOf(() =>
            composeConfig(THE_ESTATE, [
                { name: 'estate.json', values: { rows: { spacingInMetres: 0, vinesPerRow: 60 } } },
            ]),
        );

        expect(issues).toEqual([
            {
                source: 'estate.json',
                path: 'spacingInMetres',
                value: 0,
                message: 'expected a distance in metres between one row and the next',
            },
        ]);
        expect(describeIssue(issues[0])).toBe(
            'estate.json: spacingInMetres: expected a distance in metres between one row and ' +
                'the next; found 0',
        );
    });

    it('is told which of its files had a hand in the section, when two of them did', () => {
        // The one thing the estate could not have said for itself: its own
        // check sees a value, never a file. Both names, joined, and `defaults`
        // for a section no file touched.
        const issues = issuesOf(() =>
            composeConfig(THE_ESTATE, [
                { name: 'estate.json', values: { rainfall: { expectedMillimetres: 700 } } },
                { name: 'this-year.json', values: { rainfall: { aDryYearIsBelow: 900 } } },
                { name: 'the-tasting.json', values: { tasting: { peopleAtTheTable: 1 } } },
            ]),
        );

        expect(issues.map((issue) => issue.source)).toEqual([
            'estate.json+this-year.json',
            'the-tasting.json',
            'the-tasting.json',
        ]);
    });

    it('hears about every section at once, rather than a file at a time', () => {
        const issues = issuesOf(() =>
            composeConfig(THE_ESTATE, [
                {
                    name: 'estate.json',
                    values: {
                        rows: { spacingInMetres: 0, vinesPerRow: 0 },
                        plots: {
                            hectares: { 'the-hill': 1.5 },
                            walkedInOrder: ['the-hill', 'below-the-well'],
                        },
                        rainfall: { expectedMillimetres: 700, aDryYearIsBelow: 900 },
                        tasting: { peopleAtTheTable: 1, wordsAllowed: [] },
                    },
                },
            ]),
        );

        expect(issues.map((issue) => issue.path)).toEqual([
            'spacingInMetres',
            'vinesPerRow',
            'walkedInOrder[1]',
            'aDryYearIsBelow',
            'peopleAtTheTable',
        ]);
    });

    it('is refused a section it never declared, and told which ones it has', () => {
        const issues = issuesOf(() =>
            composeConfig(THE_ESTATE, [
                { name: 'estate.json', values: { rainfal: { expectedMillimetres: 800 } } },
            ]),
        );

        expect(issues).toEqual([
            {
                source: 'estate.json',
                path: 'rainfal',
                value: { expectedMillimetres: 800 },
                message:
                    'is not a section of this configuration (expected rows, plots, rainfall, ' +
                    'tasting)',
            },
        ]);
    });

    it('is given nothing back at all, and every section is still looked at', () => {
        // A year that half-composed would be a year whose plots are right and
        // whose rainfall is nonsense, discovered at the harvest. And the
        // sections after the broken one are still checked, so that the estate
        // fixes its file once rather than a line per run.
        const lookedAt: string[] = [];
        const watched = [
            recording(ROWS_SECTION, lookedAt),
            recording(PLOTS_SECTION, lookedAt),
            recording(RAINFALL_SECTION, lookedAt),
        ] as const;

        let composed: unknown = 'nothing came back';
        expect(() => {
            composed = composeConfig(watched, [
                { name: 'estate.json', values: { rows: { spacingInMetres: -1, vinesPerRow: 60 } } },
            ]);
        }).toThrow(ConfigError);

        expect(composed).toBe('nothing came back');
        expect(lookedAt).toEqual(['rows', 'plots', 'rainfall']);
    });

    it('is stopped outright if it hands the same section over twice', () => {
        // Not an issue with a file: nothing has been read, and nothing that was
        // read is at fault. It is the estate's own list that is wrong.
        expect(() => composeConfig([ROWS_SECTION, ROWS_SECTION], [])).toThrow(
            "two shapes claim the section 'rows'",
        );
    });
});

describe('the slices the estate gets back', () => {
    it('come back in the order it gave its sections, each with its own type', () => {
        const [rows, plots, rainfall, tasting] = composeConfig(THE_ESTATE, [
            { name: 'this-year.json', values: { tasting: { peopleAtTheTable: 5, wordsAllowed: [] } } },
        ]);

        const asPlanted: RowParameters = rows;
        const asSurveyed: PlotParameters = plots;
        const asExpected: RainfallParameters = rainfall;
        const asHeld: TastingParameters | undefined = tasting;

        expect([
            asPlanted.vinesPerRow,
            asSurveyed.walkedInOrder.length,
            asExpected.expectedMillimetres,
            asHeld?.peopleAtTheTable,
        ]).toEqual([60, 2, 700, 5]);
    });

    it('do not fit one another: the rainfall is not the rows', () => {
        const [, , rainfall] = composeConfig(THE_ESTATE, []);

        // @ts-expect-error — the weather is not somewhere to plant vines.
        const notTheRows: RowParameters = rainfall;

        // This one refuses under every failure the file is about, the widening
        // included, so it proves less than it looks: what pins the tuple is the
        // test above, where each slice is assigned to **its own** type and a
        // widened one would fit none of them.
        expect(notTheRows).toEqual({ expectedMillimetres: 700, aDryYearIsBelow: 450 });
    });

    it('keeps a section that may be absent typed as what it is when it is there', () => {
        const [, , , tasting] = composeConfig(THE_ESTATE, []);

        // The slice's type comes from the section's fallback: written out, so
        // that a year which does hold a tasting has somewhere to put it.
        const asHeld: typeof tasting = { peopleAtTheTable: 5, wordsAllowed: ['almond', 'quince'] };

        expect(asHeld.peopleAtTheTable).toBe(5);
    });
});

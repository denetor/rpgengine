import { describe, expect, it } from 'vitest';
import { composeConfig, ConfigError } from '../src/engine/core/config/index';
import {
    FILTER_SECTION,
    filterConfigProblems,
    Random,
    UNFILTERED_PROFILE,
} from '../src/engine/core/random/index';
import type { FilterConfig, WeightedEntry } from '../src/engine/core/random/index';

/**
 * The circle: a section declared by a service, composed by `CFG`, handed to
 * that service's constructor (CTX-10).
 *
 * Both halves are already tested on their own — `CFG` against shapes invented
 * for its own suite, `RND` against its own check — and neither of those suites
 * can see this. What is asserted here is that the two fit: that the object
 * `RND` declares is one the composition accepts, that what comes back is what
 * the constructor wants, and that a configuration a designer got wrong stops
 * the program **before** a service is built on it rather than after.
 *
 * **Why the file lives here.** It names two services, and a spec sitting inside
 * either one would be a service importing another, which boundary rule 3
 * refuses (ARC-4.1) — rightly: the fit is not a fact about either service, it
 * is the fact a bootstrap depends on. This is the nearest thing to a bootstrap
 * that exists today; `game/bootstrap.ts` constructs nothing yet.
 *
 * It enters through the two public doors and nothing else, and touches no file
 * system: the sources are the values a loader would have parsed (CFG-14).
 */

/** A seed, so that nothing here depends on a clock or a `Math.random()`. */
const SEED = 20260806;

/** What a designer wrote in `game/balance/random.json`, already parsed. */
const DESIGNER_WROTE: FilterConfig = {
    channelCap: 512,
    default: 'neutral',
    profiles: {
        neutral: { reduction: 0.6, recovery: 2 },
        lockpick: { reduction: 0.25, recovery: 5 },
    },
    rules: [{ channel: 'lockpick:*', profile: 'lockpick' }],
};

/** The same file with one value a designer could plausibly get wrong. */
const DESIGNER_MISTYPED = { ...DESIGNER_WROTE, channelCap: 0 };

/** Something to draw, so that a channel exists to be reported on. */
const OUTCOMES: readonly WeightedEntry<string>[] = [
    { value: 'open', weight: 3 },
    { value: 'stuck', weight: 1 },
];

describe('a configuration composed for the randomness service', () => {
    it('is accepted by the service it was composed for', () => {
        const [filter] = composeConfig(
            [FILTER_SECTION],
            [{ name: 'random.json', values: { random: DESIGNER_WROTE } }],
        );

        const rng = new Random(SEED, filter);
        rng.stream('locks').filtered('lockpick:oak-door', OUTCOMES);

        // Not merely that the constructor did not throw: the rule the designer
        // wrote is the one that resolved, so the composed value is the value
        // that arrived.
        expect(rng.channels()).toEqual([{ channel: 'lockpick:oak-door', profile: 'lockpick' }]);
    });

    it('comes back typed as a filter configuration or none, and not as `undefined`', () => {
        const [filter] = composeConfig([FILTER_SECTION], []);

        // The compiler is the test here: the slice's type comes from the
        // section's fallback, and this line is the assignment that fails when
        // that fallback stops being written out — see `FILTER_SECTION`. The
        // expectation below is there so that a file with no test in it is not a
        // file nobody notices has stopped running.
        const stillAConfiguration: typeof filter = DESIGNER_WROTE;

        expect(stillAConfiguration).toBe(DESIGNER_WROTE);
    });

    it('leaves the filter absent when no source mentions the section', () => {
        const [filter] = composeConfig([FILTER_SECTION], []);

        const rng = new Random(SEED, filter);
        rng.stream('locks').filtered('lockpick:oak-door', OUTCOMES);

        expect(filter).toBeUndefined();
        expect(rng.channels()).toEqual([
            { channel: 'lockpick:oak-door', profile: UNFILTERED_PROFILE },
        ]);
    });
});

describe('a configuration the designer got wrong', () => {
    it('stops the program before any service is built on it', () => {
        let rng: Random | undefined;

        expect(() => {
            const [filter] = composeConfig(
                [FILTER_SECTION],
                [{ name: 'random.json', values: { random: DESIGNER_MISTYPED } }],
            );
            rng = new Random(SEED, filter);
        }).toThrow(ConfigError);

        // CTX-10 is about what does *not* exist: a service constructed on
        // parameters that did not validate is the failure the refusal prevents.
        expect(rng).toBeUndefined();
    });

    it('is refused with the problems the service itself reports, and the file it came from', () => {
        let thrown: unknown;
        try {
            composeConfig(
                [FILTER_SECTION],
                [{ name: 'random.json', values: { random: DESIGNER_MISTYPED } }],
            );
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(ConfigError);
        expect((thrown as ConfigError).issues).toEqual(
            filterConfigProblems(DESIGNER_MISTYPED).map((problem) => ({
                ...problem,
                source: 'random.json',
            })),
        );
    });
});

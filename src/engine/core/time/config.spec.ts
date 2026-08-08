import { describe, expect, it } from 'vitest';
import {
    assertTimeConfig,
    createClock,
    DEFAULT_TIME_CONFIG,
    TIME_SECTION,
    timeConfigProblems,
    validateTimeConfig,
} from './index';
import type { TimeConfig } from './index';

/**
 * The calendar as configuration (TIME-11): the key, the fallback and the check
 * all belong to the service, and the composition mechanism owns none of them
 * (CFG-13).
 *
 * A person edits this file. Being told one mistake per run is what makes a
 * configuration format hated, so **every** problem is reported and not the
 * first (RND-24) — which is the opposite of the rule for a save, where nobody
 * edited anything and there is no file to fix.
 *
 * The tests read the `path` of each problem rather than its wording: the path
 * is what sends somebody to a line, and a message improved next month must not
 * fail a test that was about something else.
 */

const VALID: TimeConfig = {
    dayLengthMs: 1_440_000,
    startsAt: { day: 1, hour: 6, minute: 30 },
    phases: [
        { name: 'night', hour: 0, minute: 0 },
        { name: 'dawn', hour: 5, minute: 0 },
        { name: 'day', hour: 8, minute: 0 },
    ],
};

/** The paths a check complained about, which is what a person needs to know. */
function pathsOf(value: unknown): string[] {
    return timeConfigProblems(value).map((problem) => problem.path);
}

describe('a valid calendar', () => {
    it('has nothing wrong with it', () => {
        expect(timeConfigProblems(VALID)).toEqual([]);
    });

    it('is what the fallback is, too', () => {
        expect(timeConfigProblems(DEFAULT_TIME_CONFIG)).toEqual([]);
    });
});

describe('an absent section', () => {
    it('is valid: it is a clock with no cycle, not a missing file', () => {
        expect(timeConfigProblems(undefined)).toEqual([]);
    });

    it('is not the same thing as one written as null', () => {
        // A key written as `null` is a mistake; a key not written at all is a
        // decision.
        expect(pathsOf(null)).toEqual(['']);
    });

    it('leaves the clock on the documented fallback', () => {
        const clock = createClock(TIME_SECTION.fallback);

        expect(TIME_SECTION.fallback).toEqual(DEFAULT_TIME_CONFIG);
        expect(clock.worldTime()).toEqual({ day: 0, hour: 0, minute: 0, phase: 'day' });
    });
});

describe('the section this service declares', () => {
    it('is written under the key `time`', () => {
        expect(TIME_SECTION.key).toBe('time');
    });

    it("carries the service's own check", () => {
        expect(TIME_SECTION.validate(VALID)).toEqual([]);
        expect(TIME_SECTION.validate({ ...VALID, dayLengthMs: 0 })).not.toEqual([]);
    });
});

describe('the day length', () => {
    it('must be a positive whole number of milliseconds', () => {
        expect(pathsOf({ ...VALID, dayLengthMs: 0 })).toEqual(['dayLengthMs']);
        expect(pathsOf({ ...VALID, dayLengthMs: -1 })).toEqual(['dayLengthMs']);
        expect(pathsOf({ ...VALID, dayLengthMs: 1.5 })).toEqual(['dayLengthMs']);
        expect(pathsOf({ ...VALID, dayLengthMs: '86400000' })).toEqual(['dayLengthMs']);
        expect(pathsOf({ ...VALID, dayLengthMs: Number.NaN })).toEqual(['dayLengthMs']);
    });

    it('must leave a millisecond for each minute of the day', () => {
        // The shortest representable day: 1 440 minutes, a millisecond each.
        // Below it two minutes of the calendar fall on the same instant, and so
        // could two phases — one of which would then begin without a
        // `time/day-phase-changed` ever being returned for it.
        expect(timeConfigProblems({ ...VALID, dayLengthMs: 1_440 })).toEqual([]);
        expect(pathsOf({ ...VALID, dayLengthMs: 1_439 })).toEqual(['dayLengthMs']);
    });

    it('says how short is too short', () => {
        const [problem] = timeConfigProblems({ ...VALID, dayLengthMs: 100 });

        expect(problem.message).toMatch(/1440/);
    });
});

describe('the instant the game starts at', () => {
    it('must be inside the day', () => {
        expect(pathsOf({ ...VALID, startsAt: { day: 0, hour: 24, minute: 0 } })).toEqual([
            'startsAt.hour',
        ]);
        expect(pathsOf({ ...VALID, startsAt: { day: 0, hour: 0, minute: 60 } })).toEqual([
            'startsAt.minute',
        ]);
        expect(pathsOf({ ...VALID, startsAt: { day: 0, hour: -1, minute: -1 } })).toEqual([
            'startsAt.hour',
            'startsAt.minute',
        ]);
    });

    it('must begin on a day that exists', () => {
        expect(pathsOf({ ...VALID, startsAt: { day: -1, hour: 0, minute: 0 } })).toEqual([
            'startsAt.day',
        ]);
    });
});

describe('the phases', () => {
    it('must not be empty: a day has to be in some phase', () => {
        expect(pathsOf({ ...VALID, phases: [] })).toEqual(['phases']);
    });

    it('must start at 00:00, so that every minute of the day is covered', () => {
        const late = [
            { name: 'dawn', hour: 5, minute: 0 },
            { name: 'day', hour: 8, minute: 0 },
        ];

        expect(pathsOf({ ...VALID, phases: late })).toEqual(['phases[0]']);
    });

    it('must be in order', () => {
        const shuffled = [
            { name: 'night', hour: 0, minute: 0 },
            { name: 'day', hour: 8, minute: 0 },
            { name: 'dawn', hour: 5, minute: 0 },
        ];

        expect(pathsOf({ ...VALID, phases: shuffled })).toEqual(['phases[2]']);
    });

    it('must not begin two of them at the same minute', () => {
        const together = [
            { name: 'night', hour: 0, minute: 0 },
            { name: 'dawn', hour: 5, minute: 0 },
            { name: 'day', hour: 5, minute: 0 },
        ];

        expect(pathsOf({ ...VALID, phases: together })).toEqual(['phases[2]']);
    });

    it('must have distinct names', () => {
        const twice = [
            { name: 'night', hour: 0, minute: 0 },
            { name: 'dawn', hour: 5, minute: 0 },
            { name: 'night', hour: 20, minute: 0 },
        ];

        expect(pathsOf({ ...VALID, phases: twice })).toEqual(['phases[2].name']);
    });

    it('must be inside the day, and named', () => {
        const wrong = [
            { name: 'night', hour: 0, minute: 0 },
            { name: '', hour: 5, minute: 0 },
            { name: 'day', hour: 25, minute: 0 },
        ];

        expect(pathsOf({ ...VALID, phases: wrong })).toEqual(['phases[1].name', 'phases[2].hour']);
    });
});

describe('a malformed section', () => {
    it('is refused with every problem listed, not the first', () => {
        const wrong = {
            dayLengthMs: 0,
            startsAt: { day: 0, hour: 99, minute: 0 },
            phases: [],
        };

        // The whole point of RND-24: a designer fixing a file one error per run
        // is a designer running the game five times to find five typos.
        expect(pathsOf(wrong)).toEqual(['dayLengthMs', 'startsAt.hour', 'phases']);
    });

    it('names a key that is not a parameter of the calendar', () => {
        // Refused rather than ignored, because that is what catches a typo: a
        // misspelled `phases` would otherwise be a day/night cycle that
        // silently does not exist.
        expect(pathsOf({ ...VALID, dayLenghtMs: 1000 })).toEqual(['dayLenghtMs']);
    });

    it('is not an object at all', () => {
        expect(pathsOf(42)).toEqual(['']);
        expect(pathsOf([VALID])).toEqual(['']);
    });
});

describe('the refusal', () => {
    it('names the file the caller gave it', () => {
        const issues = validateTimeConfig({ ...VALID, dayLengthMs: 0 }, 'time.json');

        expect(issues).toHaveLength(1);
        expect(issues[0].file).toBe('time.json');
    });

    it('throws with every problem in the message', () => {
        const wrong = { dayLengthMs: 0, startsAt: { day: 0, hour: 99, minute: 0 }, phases: [] };

        expect(() => assertTimeConfig(wrong, 'time.json')).toThrow(/dayLengthMs/);
        expect(() => assertTimeConfig(wrong, 'time.json')).toThrow(/startsAt\.hour/);
        expect(() => assertTimeConfig(wrong, 'time.json')).toThrow(/phases/);
    });

    it('lets a valid calendar and an absent one through', () => {
        expect(() => assertTimeConfig(VALID)).not.toThrow();
        expect(() => assertTimeConfig(undefined)).not.toThrow();
    });
});

describe('a clock built on a calendar that does not validate', () => {
    it('does not come into existence', () => {
        const wrong = { ...VALID, phases: [] } as unknown as TimeConfig;

        // The last line of defence rather than the first: the loader is meant
        // to have validated already (CTX-10). It stays because "meant to" is
        // not a guarantee, and a clock half-built on nonsense produces a game
        // that is subtly wrong rather than a load that failed.
        expect(() => createClock(wrong)).toThrow(/phases/);
    });
});

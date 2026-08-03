import { describe, expect, it } from 'vitest';
import {
    assertFilterConfig,
    describeIssue,
    FilterConfigError,
    Random,
    UNFILTERED_PROFILE,
    validateFilterConfig,
} from './index';
import type { FilterConfig, FilterConfigIssue } from './index';

/**
 * The expected shape of the service's own parameters (RND-10, ARC-7.2).
 *
 * These tests enter through the validation surface rather than through a
 * constructed service, and that is not an exception to the seam: the surface
 * **is** public API. It exists so that the game's loader can refuse a bad
 * `random.json` before the game context is built (CTX-10), which is a thing to
 * do with a file the service never sees.
 *
 * What every error case checks is the same three things ARC-7.2 asks for —
 * **file, path and value** — because an error that says "invalid profile" sends
 * a designer looking through the whole file, and one that says
 * `random.json: profiles['lockpick'].reduction: …; found 1.5` does not.
 */

const FILE = 'game/balance/random.json';

/** The configuration the sheet documents, and the base every bad one departs from. */
const VALID: FilterConfig = {
    channelCap: 512,
    default: 'neutral',
    profiles: {
        neutral: { reduction: 0.6, recovery: 2 },
        lockpick: { reduction: 0.25, recovery: 5 },
    },
    rules: [{ channel: 'lockpick:*', profile: 'lockpick' }],
};

/** `VALID` with one parameter replaced by something the loader must refuse. */
function withKey(key: string, value: unknown): unknown {
    return { ...VALID, [key]: value };
}

/** `VALID` with one parameter not written at all. */
function without(key: keyof FilterConfig): unknown {
    const missing: Partial<FilterConfig> = { ...VALID };
    delete missing[key];
    return missing;
}

/** `VALID` with the profile `neutral` replaced. */
function withNeutral(profile: unknown): unknown {
    return { ...VALID, profiles: { ...VALID.profiles, neutral: profile } };
}

/** `VALID` with its one rule replaced. */
function withRule(rule: unknown): unknown {
    return { ...VALID, rules: [rule] };
}

/**
 * The single problem a configuration has.
 *
 * Insisting there is exactly one is part of the test: a validator that reported
 * a missing `profiles` as four separate errors would be technically right and
 * useless to read.
 */
function onlyIssue(config: unknown): FilterConfigIssue {
    const issues = validateFilterConfig(config, FILE);
    expect(issues.map(describeIssue)).toHaveLength(1);
    return issues[0];
}

describe('the expected shape', () => {
    it('accepts the configuration the sheet documents', () => {
        expect(validateFilterConfig(VALID, FILE)).toEqual([]);
    });

    it('accepts the absence of a configuration, which is not an error', () => {
        expect(validateFilterConfig(undefined, FILE)).toEqual([]);
        expect(() => new Random(400)).not.toThrow();
    });

    it('accepts a configuration with no rules at all', () => {
        expect(validateFilterConfig(without('rules'), FILE)).toEqual([]);
    });

    it('names the file it was asked to blame, for every problem it finds', () => {
        const issues = validateFilterConfig({ ...VALID, channelCap: 0 }, FILE);

        expect(issues).toHaveLength(1);
        expect(issues[0].file).toBe(FILE);
        expect(describeIssue(issues[0])).toContain(FILE);
    });

    it('says what it is talking about when no file was named', () => {
        // The service reads no files and knows none of this game's paths
        // (ARC-4.1): with no file to blame the error still has to say what it
        // is about, and must not invent a path.
        const [issue] = validateFilterConfig({ ...VALID, channelCap: 0 });

        expect(issue.file).toBe('filter configuration');
        expect(describeIssue(issue)).not.toContain('random.json');
    });

    it('shortens a value too long to read, rather than printing a whole file at it', () => {
        // The value at a path may be an entire `profiles` object. The issue
        // still carries it whole, for a caller that wants to show it its own
        // way; it is the *line* that is kept to a length somebody reads to the
        // end of.
        const wordy: Record<string, unknown> = {};
        for (let index = 0; index < 20; index += 1) {
            wordy[`profile-number-${index}`] = { reduction: 0.6, recovery: 2 };
        }

        const issue = onlyIssue(withKey('channelCap', wordy));
        const line = describeIssue(issue);

        expect(issue.value).toEqual(wordy);
        expect(line.endsWith('…')).toBe(true);
        expect(line.length).toBeLessThan(200);
    });

    it('reports every problem at once, rather than one load at a time', () => {
        const issues = validateFilterConfig(
            { channelCap: 0, default: 'neutral', profiles: { neutral: { reduction: 3, recovery: 2 } } },
            FILE,
        );

        expect(issues.map((issue) => issue.path)).toEqual([
            'channelCap',
            "profiles['neutral'].reduction",
        ]);
    });
});

describe('a configuration that is not one', () => {
    it('refuses a value that is not an object', () => {
        const issue = onlyIssue('neutral');

        expect(issue.path).toBe('');
        expect(issue.value).toBe('neutral');
        expect(describeIssue(issue)).toBe(`${FILE}: expected an object; found "neutral"`);
    });

    it('refuses an explicit null, which is not the same as no configuration', () => {
        const issue = onlyIssue(null);

        expect(describeIssue(issue)).toBe(`${FILE}: expected an object; found null`);
    });

    it('refuses a key that is not a parameter, because a typo is silent otherwise', () => {
        const issue = onlyIssue({ ...VALID, chanelCap: 512 });

        expect(issue.path).toBe('chanelCap');
        expect(describeIssue(issue)).toContain('not a parameter of the filter configuration');
        expect(describeIssue(issue)).toContain('channelCap, default, profiles, rules');
    });
});

describe('the channel cap', () => {
    it('refuses a configuration that does not carry one', () => {
        const issue = onlyIssue(without('channelCap'));

        expect(issue.path).toBe('channelCap');
        expect(describeIssue(issue)).toBe(
            `${FILE}: channelCap: expected a whole number of channels of at least 1; found undefined`,
        );
    });

    it('refuses a cap that is not a whole number', () => {
        const issue = onlyIssue(withKey('channelCap', 2.5));

        expect(issue.value).toBe(2.5);
        expect(describeIssue(issue)).toBe(
            `${FILE}: channelCap: expected a whole number of channels of at least 1; found 2.5`,
        );
    });

    it('refuses a cap below one, which would evict every channel it created', () => {
        const issue = onlyIssue(withKey('channelCap', 0));

        expect(describeIssue(issue)).toContain('found 0');
    });
});

describe('the profiles', () => {
    it('refuses a configuration whose profiles are not a set of profiles', () => {
        const issue = onlyIssue(withKey('profiles', 'neutral'));

        expect(issue.path).toBe('profiles');
        expect(describeIssue(issue)).toBe(
            `${FILE}: profiles: expected a set of named profiles; found "neutral"`,
        );
    });

    it('refuses a configuration that defines no profiles at all', () => {
        // Said once, at `profiles`, rather than once per name that cannot be
        // resolved: `default` and every rule would otherwise repeat the same
        // news and bury it.
        const issue = onlyIssue(withKey('profiles', {}));

        expect(issue.path).toBe('profiles');
        expect(describeIssue(issue)).toBe(
            `${FILE}: profiles: expected at least one profile: a configuration with none ` +
                'filters nothing; found {}',
        );
    });

    it('refuses a profile that is not a set of parameters', () => {
        const issue = onlyIssue(withNeutral(0.6));

        expect(issue.path).toBe("profiles['neutral']");
        expect(describeIssue(issue)).toBe(
            `${FILE}: profiles['neutral']: expected an object with a reduction and a recovery; found 0.6`,
        );
    });

    it("keeps the unfiltered profile's name for itself", () => {
        const reserved = { reduction: 0.6, recovery: 2 };
        const issue = onlyIssue({
            ...VALID,
            profiles: { ...VALID.profiles, [UNFILTERED_PROFILE]: reserved },
        });

        expect(issue.path).toBe(`profiles['${UNFILTERED_PROFILE}']`);
        // The value is what stands at that path, as it is everywhere else: the
        // profile, not its name. The name is in the path and in the message.
        expect(issue.value).toEqual(reserved);
        expect(describeIssue(issue)).toContain('a channel that is not filtered');
    });

    it('refuses a key inside a profile that is not a parameter', () => {
        const issue = onlyIssue(withNeutral({ reduction: 0.6, recovery: 2, decay: 3 }));

        expect(issue.path).toBe("profiles['neutral'].decay");
        expect(describeIssue(issue)).toContain('not a parameter of a profile');
    });

    it('refuses a reduction that is not a number', () => {
        const issue = onlyIssue(withNeutral({ reduction: '0.6', recovery: 2 }));

        expect(issue.path).toBe("profiles['neutral'].reduction");
        expect(describeIssue(issue)).toContain('found "0.6"');
    });

    it('refuses a reduction of zero, which would rule an outcome out for ever', () => {
        const issue = onlyIssue(withNeutral({ reduction: 0, recovery: 2 }));

        expect(describeIssue(issue)).toBe(
            `${FILE}: profiles['neutral'].reduction: expected a number greater than 0 and at most 1, ` +
                'or an outcome would stop coming up altogether; found 0',
        );
    });

    it('refuses a reduction above one, which would make a repeat more likely', () => {
        const issue = onlyIssue(withNeutral({ reduction: 1.5, recovery: 2 }));

        expect(describeIssue(issue)).toContain('found 1.5');
    });

    it('refuses a recovery below one, which is not a number of draws', () => {
        const issue = onlyIssue(withNeutral({ reduction: 0.6, recovery: 0 }));

        expect(issue.path).toBe("profiles['neutral'].recovery");
        expect(describeIssue(issue)).toBe(
            `${FILE}: profiles['neutral'].recovery: expected a number of draws of at least 1; found 0`,
        );
    });

    it('refuses a recovery that is not a number at all', () => {
        const issue = onlyIssue(withNeutral({ reduction: 0.6, recovery: Number.NaN }));

        expect(describeIssue(issue)).toContain('found NaN');
    });
});

describe('the default profile', () => {
    it('refuses a configuration that does not name one', () => {
        const issue = onlyIssue(without('default'));

        expect(issue.path).toBe('default');
        expect(describeIssue(issue)).toContain('expected the name of one of the profiles defined');
    });

    it('refuses a default that is declared but does not exist', () => {
        const issue = onlyIssue(withKey('default', 'missing'));

        expect(issue.path).toBe('default');
        expect(issue.value).toBe('missing');
        expect(describeIssue(issue)).toBe(
            `${FILE}: default: expected the name of one of the profiles defined ` +
                "('lockpick', 'neutral'); found \"missing\"",
        );
    });
});

describe('the rules', () => {
    it('refuses rules that are not a list', () => {
        const issue = onlyIssue(withKey('rules', { channel: 'lockpick:*', profile: 'lockpick' }));

        expect(issue.path).toBe('rules');
        expect(describeIssue(issue)).toContain('expected a list of rules');
    });

    it('refuses a rule that is not an object', () => {
        const issue = onlyIssue(withRule('lockpick:*'));

        expect(issue.path).toBe('rules[0]');
        expect(describeIssue(issue)).toBe(
            `${FILE}: rules[0]: expected an object with a channel and a profile; found "lockpick:*"`,
        );
    });

    it('refuses a rule that names no channel pattern', () => {
        const issue = onlyIssue(withRule({ channel: '', profile: 'lockpick' }));

        expect(issue.path).toBe('rules[0].channel');
        expect(describeIssue(issue)).toContain('expected a channel pattern');
    });

    it('refuses a star anywhere but at the end, where it is a literal star', () => {
        // The one shape that is quietly wrong rather than loudly wrong:
        // `'lockpick:*:door'` matches nothing a caller would ever name, and
        // resolution would silently fall back to the default profile.
        const issue = onlyIssue(withRule({ channel: 'lockpick:*:door', profile: 'lockpick' }));

        expect(issue.path).toBe('rules[0].channel');
        expect(describeIssue(issue)).toContain('only at the end');
    });

    it('refuses a rule that names a profile which is not defined', () => {
        const issue = onlyIssue(withRule({ channel: 'lockpick:*', profile: 'absent' }));

        expect(issue.path).toBe('rules[0].profile');
        expect(issue.value).toBe('absent');
        expect(describeIssue(issue)).toBe(
            `${FILE}: rules[0].profile: expected the name of one of the profiles defined ` +
                "('lockpick', 'neutral'); found \"absent\"",
        );
    });

    it('refuses a key inside a rule that is not a parameter', () => {
        const issue = onlyIssue(withRule({ channel: 'lockpick:*', profile: 'lockpick', weight: 2 }));

        expect(issue.path).toBe('rules[0].weight');
        expect(describeIssue(issue)).toContain('not a parameter of a rule');
    });

    it('points at the rule that is wrong, not merely at the rules', () => {
        const issue = onlyIssue({
            ...VALID,
            rules: [
                { channel: 'lockpick:*', profile: 'lockpick' },
                { channel: 'loot:*', profile: 'lockpick' },
                { channel: 'combat:*', profile: 'absent' },
            ],
        });

        expect(issue.path).toBe('rules[2].profile');
    });
});

describe('validation before construction', () => {
    it('refuses to build a service on a configuration that does not validate', () => {
        expect(() => new Random(401, withKey('channelCap', 0) as FilterConfig)).toThrow(
            FilterConfigError,
        );
    });

    it('throws an error carrying every issue, not just a sentence', () => {
        let thrown: unknown;
        try {
            assertFilterConfig({ ...VALID, channelCap: 0, default: 'missing' }, FILE);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(FilterConfigError);
        const issues = (thrown as FilterConfigError).issues;
        expect(issues.map((issue) => issue.path)).toEqual(['channelCap', 'default']);
        expect((thrown as Error).message).toContain('channelCap');
        expect((thrown as Error).message).toContain('default');
    });

    it('lets a validated configuration through unchanged', () => {
        expect(() => assertFilterConfig(VALID, FILE)).not.toThrow();
        expect(() => assertFilterConfig(undefined, FILE)).not.toThrow();
    });

    it('refuses a root seed that is not a whole 32-bit number', () => {
        // The other parameter the constructor takes. It goes through `| 0` on
        // the way to the stream seeds, so 2.5 and 2 name the same game and
        // nothing would ever say so.
        // Written out rather than computed: `**` is `Math.pow` under another
        // name, and the determinism lint rule refuses it here as everywhere
        // else on this path (ADR 0001).
        const beyondThirtyTwoBits = 1099511627776;

        expect(() => new Random(2.5)).toThrow(
            "random service: the root seed '2.5' is not a whole 32-bit number",
        );
        expect(() => new Random(Number.NaN)).toThrow(/root seed 'NaN'/);
        expect(() => new Random(beyondThirtyTwoBits)).toThrow(/root seed/);

        // A seed is a bit pattern, not a quantity: both ends of 32 bits read
        // either way are seeds, and `-1` names the same game as `4294967295`.
        expect(() => new Random(-1)).not.toThrow();
        expect(() => new Random(4294967295)).not.toThrow();
    });
});

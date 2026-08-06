/**
 * The **expected shape** of the service's own parameters (RND-10, RND-24).
 *
 * Filter profiles are data a game designer edits without recompiling (ARC-7.4),
 * and the failure mode this file exists to prevent is the quiet one: a profile
 * that names something which does not exist, a reduction out of range, a cap of
 * zero. None of those break anything at load time on their own — they break a
 * game hours later, at a moment nobody will connect to the file they edited.
 * So they are refused **before** anything is built, with an error that states
 * **file, path and value** (ARC-7.2) and can be acted on without a debugger.
 *
 * The service still reads no files (ARC-4.1) and knows none of this game's
 * content paths. What it exposes is the shape and the check; the file name is
 * whatever the loader passes in. Reading the file belongs to the game's
 * bootstrap, and composing the sources and running this check over the result
 * belongs to `CFG`.
 *
 * Everything here is pure: the checks answer with a list of problems, and
 * `assertFilterConfig` is the one line of translation from that list into the
 * exception a constructor needs (RND-17).
 */

import { UNFILTERED_PROFILE, WILDCARD } from './filter';
import { byName } from './order';
import type { FilterConfig } from './types';

/**
 * What an error says when the caller named no file.
 *
 * Not `'random.json'`: this game keeps its configuration there, a reusing game
 * (ARC-3.4) keeps it wherever it likes, and a service that guessed would send
 * somebody looking for a file that does not exist.
 */
const DEFAULT_SOURCE = 'filter configuration';

/** The parameters a configuration may carry, in the order they are checked. */
const CONFIG_KEYS = ['channelCap', 'default', 'profiles', 'rules'];

/** The parameters a profile may carry. */
const PROFILE_KEYS = ['reduction', 'recovery'];

/** The parameters a rule may carry. */
const RULE_KEYS = ['channel', 'profile'];

/** How much of an offending value an error message shows before giving up. */
const VALUE_LIMIT = 80;

/**
 * One thing wrong with a configuration, in the two terms the service can speak:
 * where, and what was expected there.
 *
 * It is data rather than a thrown exception because a caller validating several
 * files wants to report everything wrong with all of them, not to stop at the
 * first — and because a message is for reading, while `path` and `value` are
 * for a tool that wants to point at a line.
 *
 * What it deliberately does **not** carry is where the value came from: a
 * service validating its own parameters has nothing true to say about that, and
 * whoever handed them over is the only thing that knows (CFG-3).
 */
export interface FilterConfigProblem {
    /**
     * Where in the configuration, from its root: `'channelCap'`,
     * `"profiles['lockpick'].reduction"`, `'rules[2].profile'`. Empty when the
     * configuration as a whole is the problem.
     */
    path: string;

    /** The offending value, exactly as it was read at `path`. */
    value: unknown;

    /** What was expected there. Does not repeat the value: `describeIssue` adds it. */
    message: string;
}

/**
 * A problem, told where the configuration came from — the three terms ARC-7.2
 * requires.
 *
 * The file is stamped on once, at the end, rather than threaded through every
 * check below: none of them do anything with it but copy it, and a parameter
 * that is only ever copied is one more thing to get wrong in each new check.
 * That there is one definition of a problem and one of what is added to it is
 * why the two doors below cannot drift apart.
 */
export interface FilterConfigIssue extends FilterConfigProblem {
    /**
     * Where the configuration came from, as the caller named it — and only as
     * the caller named it. With no name given it is a label rather than a path,
     * because the service has no file to name (ARC-4.1).
     */
    file: string;
}

/**
 * A configuration that cannot be used, and everything that is wrong with it.
 *
 * The `message` is every issue, one per line, so that a stack trace alone is
 * enough to fix the file. `issues` is the same information for a caller that
 * wants to render it its own way.
 */
export class FilterConfigError extends Error {
    readonly issues: readonly FilterConfigIssue[];

    constructor(issues: readonly FilterConfigIssue[]) {
        super(issues.map(describeIssue).join('\n'));
        this.name = 'FilterConfigError';
        this.issues = issues;
    }
}

/** One issue as a line of text: file, path, what was expected, and the value. */
export function describeIssue(issue: FilterConfigIssue): string {
    const where = issue.path === '' ? '' : `${issue.path}: `;
    return `${issue.file}: ${where}${issue.message}; found ${describeValue(issue.value)}`;
}

/**
 * Everything wrong with `value` as a filter configuration, or an empty list.
 *
 * **The absence of a configuration is valid** and returns no problems: it is
 * the absence of the filter, not a missing file (RND-21). An explicit `null` is
 * not the same thing and is refused — a key written as `null` is a mistake,
 * where a key not written at all is a decision.
 *
 * Every problem is reported, not merely the first: a designer fixing a file one
 * error per run is a designer running the game five times to find five typos.
 * What is *not* reported is a cascade — a `profiles` that is not a set of
 * profiles makes every profile name unresolvable, and saying so once per
 * reference would bury the one line that matters.
 *
 * This is the door for whoever **composes** the parameters: it takes no source,
 * because a service has nothing true to say about one, and whoever saw the
 * value arrive stamps that on afterwards (CFG-3). The door for a caller that
 * does know what to call the value is `validateFilterConfig` below.
 */
export function filterConfigProblems(value: unknown): readonly FilterConfigProblem[] {
    if (value === undefined) {
        return [];
    }
    if (!isRecord(value)) {
        return [{ path: '', value, message: 'expected an object' }];
    }

    const declared = declaredProfiles(value);

    return [
        ...unknownKeyProblems(value, CONFIG_KEYS, '', 'the filter configuration'),
        ...channelCapProblems(value),
        ...profileProblems(value),
        ...defaultProblems(value, declared),
        ...ruleProblems(value, declared),
    ];
}

/**
 * What this service says about its own parameters, in the three terms a
 * composition asks for.
 *
 * The type is written here, on the declaration, and **not** on a constant
 * holding the fallback. It is the same trap from the other side: a
 * `const NO_FILTER: FilterConfig | undefined = undefined` is narrowed back to
 * `undefined` wherever it is read, so a section built out of one would type its
 * slice `undefined` after all, and only a test assigning a real configuration
 * *to* the slice would ever notice.
 */
interface FilterSection {
    /** The key the parameters are written under in a source. */
    readonly key: 'random';

    /**
     * The parameters in the absence of every source: none at all, which is the
     * absence of the filter (RND-21).
     *
     * Its type is spelled out because a composition infers a slice's type from
     * the fallback it was given: bare, the slice would be typed `undefined`,
     * and a game that does have a `random.json` could not hand what it composed
     * to anything.
     */
    readonly fallback: FilterConfig | undefined;

    /** The service's own check, which reports every problem and names no source. */
    validate(value: unknown): readonly FilterConfigProblem[];
}

/**
 * The section a composition writes this service's parameters under: the key,
 * what they are when nobody mentions them, and the check above.
 *
 * All three belong here rather than to whatever composes them (CFG-13), and
 * this file **imports nothing from that mechanism**: the object matches what a
 * composition asks for structurally, which is what keeps the service liftable
 * into a project that composes its parameters some other way (ARC-3.4,
 * ARC-4.1).
 */
export const FILTER_SECTION: FilterSection = {
    key: 'random',
    fallback: undefined,
    validate: filterConfigProblems,
};

/**
 * The same check with a source stamped on it, for a caller that has one to
 * name.
 */
export function validateFilterConfig(
    value: unknown,
    file: string = DEFAULT_SOURCE,
): readonly FilterConfigIssue[] {
    return filterConfigProblems(value).map((problem) => ({ file, ...problem }));
}

/**
 * Refuses a configuration that does not validate, so that a service built on
 * one **does not exist** (CTX-10).
 *
 * This is the last line rather than the first: the loader is meant to have
 * validated already, and by the time the constructor runs there is no file name
 * left to blame. It stays because "meant to" is not a guarantee, and because a
 * service half-built on nonsense is worse than one not built at all.
 */
export function assertFilterConfig(
    value: unknown,
    file?: string,
): asserts value is FilterConfig | undefined {
    const issues = validateFilterConfig(value, file);
    if (issues.length > 0) {
        throw new FilterConfigError(issues);
    }
}

/**
 * The profile names a configuration declares, or null when it declares no
 * usable set of them and every reference to one is therefore unanswerable.
 *
 * Sorted, because the list appears in the messages of the checks that resolve a
 * name against it: an error whose text depended on the order the keys happened
 * to be written in would differ between two files that say the same thing.
 */
function declaredProfiles(config: Record<string, unknown>): string[] | null {
    const profiles = config.profiles;
    if (!isRecord(profiles) || Object.keys(profiles).length === 0) {
        return null;
    }
    return Object.keys(profiles).sort(byName);
}

/** The channel cap: a whole number of channels the service can actually hold. */
function channelCapProblems(config: Record<string, unknown>): readonly FilterConfigProblem[] {
    const cap = config.channelCap;
    if (isWholeNumber(cap) && cap >= 1) {
        return [];
    }
    return [
        {
            path: 'channelCap',
            value: cap,
            message: 'expected a whole number of channels of at least 1',
        },
    ];
}

/**
 * Every profile, each checked under its own name.
 *
 * They are met in the order the file declares them, not sorted: the point of a
 * path is to send somebody to a line, and the shortest way through a file is
 * downwards. Only the *list* of names inside a message is sorted, and for the
 * opposite reason — see `declaredProfiles`.
 */
function profileProblems(config: Record<string, unknown>): readonly FilterConfigProblem[] {
    const profiles = config.profiles;
    if (!isRecord(profiles)) {
        return [
            { path: 'profiles', value: profiles, message: 'expected a set of named profiles' },
        ];
    }
    if (Object.keys(profiles).length === 0) {
        return [
            {
                path: 'profiles',
                value: profiles,
                message: 'expected at least one profile: a configuration with none filters nothing',
            },
        ];
    }

    const problems: FilterConfigProblem[] = [];
    for (const [name, profile] of Object.entries(profiles)) {
        problems.push(...oneProfileProblems(name, profile));
    }
    return problems;
}

/** One profile's name and parameters. */
function oneProfileProblems(name: string, profile: unknown): readonly FilterConfigProblem[] {
    const path = `profiles['${name}']`;

    if (!isRecord(profile)) {
        return [
            {
                path,
                value: profile,
                message: 'expected an object with a reduction and a recovery',
            },
        ];
    }

    const problems: FilterConfigProblem[] = [];

    if (name === UNFILTERED_PROFILE) {
        problems.push({
            path,
            value: profile,
            message:
                `'${UNFILTERED_PROFILE}' is the profile reported for a channel that is not ` +
                'filtered at all, and cannot name a profile',
        });
    }

    problems.push(...unknownKeyProblems(profile, PROFILE_KEYS, path, 'a profile'));

    const reduction = profile.reduction;
    if (!isRealNumber(reduction) || reduction <= 0 || reduction > 1) {
        problems.push({
            path: `${path}.reduction`,
            value: reduction,
            message:
                'expected a number greater than 0 and at most 1, or an outcome would stop ' +
                'coming up altogether',
        });
    }

    const recovery = profile.recovery;
    if (!isRealNumber(recovery) || recovery < 1) {
        problems.push({
            path: `${path}.recovery`,
            value: recovery,
            message: 'expected a number of draws of at least 1',
        });
    }

    return problems;
}

/** The default profile: mandatory whenever there is a configuration, and it must exist. */
function defaultProblems(
    config: Record<string, unknown>,
    declared: string[] | null,
): readonly FilterConfigProblem[] {
    if (declared === null) {
        return [];
    }
    return namedProfileProblems(config.default, declared, 'default');
}

/** Every rule, each checked at its own position in the list. */
function ruleProblems(
    config: Record<string, unknown>,
    declared: string[] | null,
): readonly FilterConfigProblem[] {
    const rules = config.rules;
    if (rules === undefined) {
        return [];
    }
    if (!Array.isArray(rules)) {
        return [{ path: 'rules', value: rules, message: 'expected a list of rules' }];
    }

    const problems: FilterConfigProblem[] = [];
    for (let index = 0; index < rules.length; index += 1) {
        problems.push(...oneRuleProblems(rules[index], index, declared));
    }
    return problems;
}

/** One rule: its channel pattern, and the profile it hands that pattern to. */
function oneRuleProblems(
    rule: unknown,
    index: number,
    declared: string[] | null,
): readonly FilterConfigProblem[] {
    const path = `rules[${index}]`;

    if (!isRecord(rule)) {
        return [{ path, value: rule, message: 'expected an object with a channel and a profile' }];
    }

    const problems: FilterConfigProblem[] = [
        ...unknownKeyProblems(rule, RULE_KEYS, path, 'a rule'),
        ...channelPatternProblems(rule.channel, `${path}.channel`),
    ];

    if (declared !== null) {
        problems.push(...namedProfileProblems(rule.profile, declared, `${path}.profile`));
    }

    return problems;
}

/**
 * A rule's channel pattern.
 *
 * A `*` is refused anywhere but at the end, because there it is a literal star:
 * `'lockpick:*:door'` would match no channel any caller would ever name, and
 * resolution would fall back to the default profile without a word. It is the
 * one malformed pattern that is quietly wrong rather than loudly wrong.
 */
function channelPatternProblems(channel: unknown, path: string): readonly FilterConfigProblem[] {
    if (typeof channel !== 'string' || channel.length === 0) {
        return [{ path, value: channel, message: 'expected a channel pattern' }];
    }

    const star = channel.indexOf(WILDCARD);
    if (star !== -1 && star !== channel.length - 1) {
        return [
            {
                path,
                value: channel,
                message:
                    `expected a channel pattern: '${WILDCARD}' matches a prefix and is allowed ` +
                    'only at the end',
            },
        ];
    }

    return [];
}

/** A reference to a profile by name, from wherever one is expected. */
function namedProfileProblems(
    name: unknown,
    declared: readonly string[],
    path: string,
): readonly FilterConfigProblem[] {
    if (typeof name === 'string' && declared.includes(name)) {
        return [];
    }
    return [
        {
            path,
            value: name,
            message: `expected the name of one of the profiles defined (${listed(declared)})`,
        },
    ];
}

/**
 * Keys that are not parameters of anything.
 *
 * Refused rather than ignored, because that is what catches a typo: a
 * misspelled `channelCap` is reported as a missing one, but a misspelled
 * `rules` — the only optional parameter — would otherwise be a rule set that
 * silently does nothing.
 */
function unknownKeyProblems(
    record: Record<string, unknown>,
    known: readonly string[],
    path: string,
    what: string,
): readonly FilterConfigProblem[] {
    const problems: FilterConfigProblem[] = [];
    for (const key of Object.keys(record)) {
        if (!known.includes(key)) {
            problems.push({
                path: path === '' ? key : `${path}.${key}`,
                value: record[key],
                message: `is not a parameter of ${what} (expected ${known.join(', ')})`,
            });
        }
    }
    return problems;
}

/** A plain object: not null, not an array, not a primitive. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a number that is a number: not a string, not NaN, not an infinity. */
function isRealNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** True for a real number with nothing after the point. */
function isWholeNumber(value: unknown): value is number {
    return isRealNumber(value) && Number.isInteger(value);
}

/** A list of names for a message: `'lockpick', 'neutral'`. */
function listed(names: readonly string[]): string {
    return names.map((name) => `'${name}'`).join(', ');
}

/**
 * An offending value, short enough to read.
 *
 * Numbers are written out rather than serialized, because `JSON.stringify`
 * turns `NaN` and the infinities into `null` — and `NaN` is exactly the value a
 * designer needs to see named when a profile carries one.
 *
 * The length limit is not decoration: the value at a path may be the whole of a
 * `profiles` object, and an error that scrolls off the screen is one nobody
 * reads to the end of.
 */
function describeValue(value: unknown): string {
    if (typeof value === 'number') {
        return String(value);
    }
    if (value === undefined) {
        return 'undefined';
    }

    let written: string;
    try {
        written = JSON.stringify(value) ?? String(value);
    } catch {
        return 'a value that cannot be shown';
    }

    if (written.length > VALUE_LIMIT) {
        return `${written.slice(0, VALUE_LIMIT)}…`;
    }
    return written;
}

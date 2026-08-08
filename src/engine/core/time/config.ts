/**
 * The **expected shape** of the calendar (TIME-11, RND-24).
 *
 * The calendar is data a game designer edits without recompiling (ARC-7.4), and
 * the failure mode this file exists to prevent is the quiet one: a day of zero
 * milliseconds, phases that begin in the wrong order, a start time at 25
 * o'clock. None of those break anything at load time on their own — they break
 * a game hours later, at a moment nobody will connect to the file they edited.
 * So they are refused **before** anything is built, with an error that states
 * file, path and value (ARC-7.2).
 *
 * The service still reads no files (ARC-4.1) and knows none of this game's
 * paths. What it exposes is the shape and the check; the file name is whatever
 * the loader passes in. `random/config.ts` is the model, down to the two doors:
 * whoever **composes** the parameters is handed `TIME_SECTION`, which carries
 * the key and the fallback with it, and the constructor's caller gets
 * `validateTimeConfig` and `assertTimeConfig`, which take a file name and
 * refuse rather than report.
 *
 * Everything here is pure: the checks answer with a list of problems, and
 * `assertTimeConfig` is the one line of translation from that list into the
 * exception a constructor needs.
 */

import { DEFAULT_TIME_CONFIG } from './calendar';
import type { TimeConfig } from './types';

/**
 * What an error says when the caller named no file.
 *
 * Not `'time.json'`: this game may keep its calendar there, a reusing game
 * (ARC-3.4) keeps it wherever it likes, and a service that guessed would send
 * somebody looking for a file that does not exist.
 */
const DEFAULT_SOURCE = 'time configuration';

/** The parameters a calendar may carry, in the order they are checked. */
const CONFIG_KEYS = ['dayLengthMs', 'startsAt', 'phases'];

/** What an instant of the day may carry. */
const STARTS_AT_KEYS = ['day', 'hour', 'minute'];

/** What one phase may carry. */
const PHASE_KEYS = ['name', 'hour', 'minute'];

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;

/** How much of an offending value an error message shows before giving up. */
const VALUE_LIMIT = 80;

/**
 * One thing wrong with a calendar: where, and what was expected there.
 *
 * Data rather than a thrown exception because a caller validating several files
 * wants to report everything wrong with all of them, not to stop at the first.
 * What it deliberately does **not** carry is where the value came from: a
 * service validating its own parameters has nothing true to say about that, and
 * whoever handed them over is the only thing that knows (CFG-3).
 */
export interface TimeConfigProblem {
    /** Where in the calendar, from its root: `'dayLengthMs'`, `'phases[2].name'`. */
    path: string;

    /** The offending value, exactly as it was read at `path`. */
    value: unknown;

    /** What was expected there. Does not repeat the value: `describeIssue` adds it. */
    message: string;
}

/** A problem, told where the calendar came from — the three terms ARC-7.2 requires. */
export interface TimeConfigIssue extends TimeConfigProblem {
    /** Where it came from, as the caller named it and only as the caller named it. */
    file: string;
}

/**
 * A calendar that cannot be used, and everything that is wrong with it.
 *
 * The `message` is every issue, one per line, so that a stack trace alone is
 * enough to fix the file. `issues` is the same information for a caller that
 * wants to render it its own way.
 */
export class TimeConfigError extends Error {
    readonly issues: readonly TimeConfigIssue[];

    constructor(issues: readonly TimeConfigIssue[]) {
        super(issues.map(describeIssue).join('\n'));
        this.name = 'TimeConfigError';
        this.issues = issues;
    }
}

/** One issue as a line of text: file, path, what was expected, and the value. */
export function describeIssue(issue: TimeConfigIssue): string {
    const where = issue.path === '' ? '' : `${issue.path}: `;

    return `${issue.file}: ${where}${issue.message}; found ${describeValue(issue.value)}`;
}

/**
 * Everything wrong with `value` as a calendar, or an empty list.
 *
 * **The absence of a calendar is valid** and returns no problems: it is a clock
 * with no cycle rather than a missing file (TIME-11). An explicit `null` is not
 * the same thing and is refused — a key written as `null` is a mistake, where a
 * key not written at all is a decision.
 *
 * Every problem is reported, not merely the first. What is *not* reported is a
 * cascade: a `phases` that is not a list of phases makes every question about
 * an individual phase unanswerable, and saying so once per phase would bury the
 * one line that matters.
 *
 * This is the door for whoever **composes** the parameters: it takes no source,
 * because a service has nothing true to say about one (CFG-3).
 */
export function timeConfigProblems(value: unknown): readonly TimeConfigProblem[] {
    if (value === undefined) {
        return [];
    }

    if (!isRecord(value)) {
        return [{ path: '', value, message: 'expected a calendar object' }];
    }

    return [
        ...unknownKeyProblems(value, CONFIG_KEYS, '', 'the calendar'),
        ...dayLengthProblems(value),
        ...startsAtProblems(value),
        ...phasesProblems(value),
    ];
}

/**
 * What this service says about its own parameters, in the three terms a
 * composition asks for.
 *
 * The type is written here, on the declaration, and **not** on a constant
 * holding the fallback: a composition infers a slice's type from the fallback
 * it was given, and a bare one would type the slice by accident.
 */
interface TimeSection {
    /** The key the calendar is written under in a source. */
    readonly key: 'time';

    /**
     * The calendar in the absence of every source: a day of 24 real hours with
     * a single phase, so that a clock nobody configured has no day/night cycle
     * rather than somebody else's (TIME-11).
     */
    readonly fallback: TimeConfig;

    /** The service's own check, which reports every problem and names no source. */
    validate(value: unknown): readonly TimeConfigProblem[];
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
export const TIME_SECTION: TimeSection = {
    key: 'time',
    fallback: DEFAULT_TIME_CONFIG,
    validate: timeConfigProblems,
};

/** The same check with a source stamped on it, for a caller that has one to name. */
export function validateTimeConfig(
    value: unknown,
    file: string = DEFAULT_SOURCE,
): readonly TimeConfigIssue[] {
    return timeConfigProblems(value).map((problem) => ({ file, ...problem }));
}

/**
 * Refuses a calendar that does not validate, so that a clock built on one
 * **does not exist** (CTX-10).
 *
 * This is the last line rather than the first: the loader is meant to have
 * validated already, and by the time the constructor runs there is no file name
 * left to blame. It stays because "meant to" is not a guarantee, and because a
 * clock half-built on nonsense is worse than one not built at all — a day of
 * zero milliseconds is a division by zero in every answer the calendar gives.
 */
export function assertTimeConfig(
    value: unknown,
    file?: string,
): asserts value is TimeConfig | undefined {
    const issues = validateTimeConfig(value, file);

    if (issues.length > 0) {
        throw new TimeConfigError(issues);
    }
}

/**
 * The length of a day: a whole number of milliseconds a day can be measured in.
 *
 * At least one millisecond **per minute of the day**, which is the condition
 * under which a day of 24 hours of 60 minutes is representable at all. Below
 * it, two minutes of the calendar share a millisecond — and so, therefore, can
 * two phases, which would begin at the same instant and cost one of them the
 * `time/day-phase-changed` that TIME-10 promises for every boundary crossed.
 * The alternative to refusing it here is a world clock that skips a phase and
 * says nothing, in a configuration nobody would write on purpose.
 */
function dayLengthProblems(config: Record<string, unknown>): readonly TimeConfigProblem[] {
    const dayLengthMs = config.dayLengthMs;

    if (isWholeNumber(dayLengthMs) && dayLengthMs >= MINUTES_PER_DAY) {
        return [];
    }

    return [
        {
            path: 'dayLengthMs',
            value: dayLengthMs,
            message:
                `expected a whole number of game milliseconds in a day, at least ` +
                `${MINUTES_PER_DAY} — a millisecond for each minute of the day, below which ` +
                'two minutes of the calendar would fall on the same instant',
        },
    ];
}

/** The world time the game begins at: a day that exists, at an hour of it. */
function startsAtProblems(config: Record<string, unknown>): readonly TimeConfigProblem[] {
    const startsAt = config.startsAt;

    if (!isRecord(startsAt)) {
        return [
            {
                path: 'startsAt',
                value: startsAt,
                message: 'expected the world time the game starts at, as { day, hour, minute }',
            },
        ];
    }

    const problems: TimeConfigProblem[] = [
        ...unknownKeyProblems(startsAt, STARTS_AT_KEYS, 'startsAt', 'a world time'),
    ];

    if (!isWholeNumber(startsAt.day) || startsAt.day < 0) {
        problems.push({
            path: 'startsAt.day',
            value: startsAt.day,
            message: 'expected the day the game starts on, a whole number of days from zero',
        });
    }

    problems.push(...timeOfDayProblems(startsAt, 'startsAt'));

    return problems;
}

/**
 * The phases of the day: an ordered table covering it from 00:00, with distinct
 * names.
 *
 * The three rules are what make `worldTime()` answerable at every instant and
 * `time/day-phase-changed` meaningful at every crossing. Covering the day from
 * 00:00 is the one that is easy to miss: without it there are minutes of the
 * day in no phase at all, and the service would have to invent an answer for
 * them.
 */
function phasesProblems(config: Record<string, unknown>): readonly TimeConfigProblem[] {
    const phases = config.phases;

    if (!Array.isArray(phases)) {
        return [
            {
                path: 'phases',
                value: phases,
                message: 'expected the phases of the day, in order, as a list',
            },
        ];
    }

    if (phases.length === 0) {
        return [
            {
                path: 'phases',
                value: phases,
                message:
                    'expected at least one phase: every minute of the day is in one, and a ' +
                    'game with no day/night cycle declares a single phase covering the day',
            },
        ];
    }

    const problems: TimeConfigProblem[] = [];
    const namesSoFar: string[] = [];
    let previousStart = -1;

    for (const [index, phase] of phases.entries()) {
        const path = `phases[${index}]`;

        if (!isRecord(phase)) {
            problems.push({
                path,
                value: phase,
                message: 'expected a phase, as { name, hour, minute }',
            });
            continue;
        }

        problems.push(...unknownKeyProblems(phase, PHASE_KEYS, path, 'a phase'));
        problems.push(...phaseNameProblems(phase.name, namesSoFar, `${path}.name`));

        const timeProblems = timeOfDayProblems(phase, path);
        problems.push(...timeProblems);

        if (typeof phase.name === 'string') {
            namesSoFar.push(phase.name);
        }

        if (timeProblems.length > 0) {
            // Its start is unreadable, so it can say nothing about the order:
            // reporting that as well would be one mistake told twice.
            continue;
        }

        const start = startMinuteOf(phase);

        if (index === 0 && start !== 0) {
            problems.push({
                path,
                value: phase,
                message:
                    'expected the first phase to begin at 00:00, so that every minute of the ' +
                    'day is covered by one',
            });
        } else if (index > 0 && start <= previousStart) {
            problems.push({
                path,
                value: phase,
                message:
                    'expected a phase beginning after the one before it: the phases are an ' +
                    'ordered table, and the current phase is the last one that has begun',
            });
        }

        previousStart = start;
    }

    return problems;
}

/** A phase's name: something to call it, and not something already used. */
function phaseNameProblems(
    name: unknown,
    used: readonly string[],
    path: string,
): readonly TimeConfigProblem[] {
    if (typeof name !== 'string' || name === '') {
        return [{ path, value: name, message: 'expected a name for the phase' }];
    }

    if (used.includes(name)) {
        return [
            {
                path,
                value: name,
                message:
                    'expected a name no other phase uses: a phase is identified by its name ' +
                    'in every event that announces it',
            },
        ];
    }

    return [];
}

/** An hour and a minute that exist in a day of 24 hours of 60 minutes. */
function timeOfDayProblems(
    at: Record<string, unknown>,
    path: string,
): readonly TimeConfigProblem[] {
    const problems: TimeConfigProblem[] = [];

    if (!isWholeNumber(at.hour) || at.hour < 0 || at.hour >= HOURS_PER_DAY) {
        problems.push({
            path: `${path}.hour`,
            value: at.hour,
            message: `expected an hour of the day, from 0 to ${HOURS_PER_DAY - 1}`,
        });
    }

    if (!isWholeNumber(at.minute) || at.minute < 0 || at.minute >= MINUTES_PER_HOUR) {
        problems.push({
            path: `${path}.minute`,
            value: at.minute,
            message: `expected a minute of the hour, from 0 to ${MINUTES_PER_HOUR - 1}`,
        });
    }

    return problems;
}

/** The minute of the day a phase begins at. Its time is known to be readable. */
function startMinuteOf(phase: Record<string, unknown>): number {
    return Number(phase.hour) * MINUTES_PER_HOUR + Number(phase.minute);
}

/**
 * Keys that are not parameters of anything.
 *
 * Refused rather than ignored, because that is what catches a typo: a
 * misspelled `dayLengthMs` is reported as a missing one, but a misspelled
 * `phases` would otherwise be a day/night cycle that silently does not exist.
 */
function unknownKeyProblems(
    record: Record<string, unknown>,
    known: readonly string[],
    path: string,
    what: string,
): readonly TimeConfigProblem[] {
    const problems: TimeConfigProblem[] = [];

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

/**
 * An offending value, short enough to read.
 *
 * Numbers are written out rather than serialized, because `JSON.stringify`
 * turns `NaN` and the infinities into `null` — and `NaN` is exactly the value a
 * designer needs to see named when a day length carries one.
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

/**
 * What a configuration that cannot be used looks like on the way out.
 *
 * One exception carrying **every** issue, and one line of text per issue: a
 * designer who fixes one error per run is a designer starting the game five
 * times to find five typos (CFG-3). A caller that wants to render them its own
 * way reads `issues` instead.
 *
 * `FilterConfigError` in `RND` is the precedent, and the resemblance goes as
 * far as `describeValue` below. That is a deliberate copy rather than an
 * oversight: no service may import another (ARC-4.1), and the shared module
 * that would remove the copy is the dependency `CFG` exists without. Thirty
 * lines of formatting cost less than the coupling would.
 */

import type { ConfigIssue } from './types';

/** How much of an offending value a message shows before giving up. */
const VALUE_LIMIT = 80;

/**
 * A configuration that cannot be used, and everything wrong with it, in one
 * throw.
 *
 * The `message` is every issue, one per line, so that a stack trace alone is
 * enough to fix the files; `issues` is the same information as data.
 */
export class ConfigError extends Error {
    readonly issues: readonly ConfigIssue[];

    constructor(issues: readonly ConfigIssue[]) {
        super(issues.map(describeIssue).join('\n'));
        this.name = 'ConfigError';
        this.issues = issues;
    }
}

/**
 * One issue as a line of text: source, path, what was expected, and the value.
 *
 * The path is left out when the section as a whole is the problem, because
 * `'bakery.json: : expected an oven'` reads like a bug in the reporter.
 */
export function describeIssue(issue: ConfigIssue): string {
    const where = issue.path === '' ? '' : `${issue.path}: `;
    return `${issue.source}: ${where}${issue.message}; found ${describeValue(issue.value)}`;
}

/**
 * An offending value, short enough to read.
 *
 * Numbers are written out rather than serialized, because `JSON.stringify`
 * turns `NaN` and the infinities into `null` — and those are exactly the values
 * a designer needs to see named. The length limit is not decoration either: the
 * value at a path may be the whole of a section, and an error that scrolls off
 * the screen is one nobody reads to the end of.
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

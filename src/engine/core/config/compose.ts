/**
 * The composition: shapes and sources in, one typed slice per shape out.
 *
 * `CFG` is a verb and not a noun. This function runs once, before anything is
 * constructed, returns the slices **in the order of the shapes it was given**,
 * and becomes garbage (CFG-15). There is no object holding all of them, so
 * there is nothing to keep, nothing to inject, and nowhere to look a value up
 * at runtime (CFG-8).
 *
 * Two of the checks below are `CFG`'s own, and neither could belong anywhere
 * else: a key that no shape claims (CFG-16) and a key that two shapes claim.
 * Both are facts about the **set** of sections, and no service ever sees more
 * than its own. Everything said about a *value* is the owning service's, which
 * is why nothing here knows what any of them mean (CFG-13).
 */

import { ConfigError } from './errors';
import type { Composed, ConfigIssue, ConfigSource, SectionShape } from './types';

/**
 * What an issue names as its source when no source mentioned the section and
 * the value is the service's own fallback.
 */
const NO_SOURCE = 'defaults';

/** How the sources that composed one section are named together: `'base+local'`. */
const SOURCE_SEPARATOR = '+';

/** One composed section: what it came to, and what its own check said about it. */
interface Section {
    readonly value: unknown;
    readonly issues: readonly ConfigIssue[];
}

/**
 * The slices of `shapes`, composed from `sources` and validated.
 *
 * Not called `load`, because it loads nothing: it composes. The name is the
 * contract — a `loadConfig` invites somebody to give it a path (CFG-14).
 *
 * The `const` type parameter is not decoration: without it the array literal is
 * inferred as an *array of the union* of the shapes rather than as a tuple, and
 * every slice comes back typed as every service's parameters at once — which
 * defeats CFG-8 at the only level where it can be checked.
 *
 * It throws two different things, and the difference is the point:
 *
 * - `ConfigError`, with **every** problem found — a key no shape claims
 *   (CFG-16) and a section its own check refused, together. One issue anywhere
 *   means nothing comes back and no service is constructed on a configuration
 *   that did not validate (CFG-3, CTX-10), and everything is composed and
 *   checked before anything is thrown, so that a bad value in the first section
 *   does not hide a bad value in the last.
 * - A plain `Error`, immediately and before a single source is looked at, when
 *   two shapes claim one key. That is a bug in the caller's own code rather
 *   than a fact about the game's data, and reporting it among the issues would
 *   send somebody looking through a file that is perfectly fine.
 *
 * The unclaimed keys are listed first among the issues because they are the
 * reason the rest may look untouched: a designer reading `randmo is not a
 * section` learns why every value below it stayed at its default.
 */
export function composeConfig<const S extends readonly SectionShape<unknown>[]>(
    shapes: S,
    sources: readonly ConfigSource[],
): Composed<S> {
    assertOneShapePerKey(shapes);

    const claimed = shapes.map((shape) => shape.key);
    const unclaimed = unclaimedIssues(claimed, sources);
    const sections = shapes.map((shape) => composeSection(shape, sources));

    const issues = [...unclaimed, ...sections.flatMap((section) => section.issues)];

    if (issues.length > 0) {
        throw new ConfigError(issues);
    }

    return sections.map((section) => section.value) as unknown as Composed<S>;
}

/**
 * Refuses a key claimed by two shapes, before a single source is looked at.
 *
 * It throws rather than reporting an issue because it has no source, no path
 * and no value to report one with: nothing was read yet, and nothing that was
 * read is at fault.
 */
function assertOneShapePerKey(shapes: readonly SectionShape<unknown>[]): void {
    const seen: string[] = [];

    for (const shape of shapes) {
        if (seen.includes(shape.key)) {
            throw new Error(
                `two shapes claim the section '${shape.key}': a section belongs to one service`,
            );
        }
        seen.push(shape.key);
    }
}

/**
 * Every key of every source that no shape claims (CFG-16).
 *
 * It is the one check no service can perform, because no service sees the set
 * of sections — and without it a misspelt section name is the quietest failure
 * the engine can have: the file parses, nothing refuses it, the game starts
 * with every default in place, and the designer discovers months later that the
 * file was never read.
 *
 * The sections in the message are listed in the order the shapes were given.
 * That is the caller's own order, so the same call produces the same message
 * every time — nothing here depends on how a source happened to be written.
 */
function unclaimedIssues(
    claimed: readonly string[],
    sources: readonly ConfigSource[],
): readonly ConfigIssue[] {
    const issues: ConfigIssue[] = [];

    for (const source of sources) {
        for (const key of Object.keys(source.values)) {
            if (!claimed.includes(key)) {
                issues.push({
                    source: source.name,
                    path: key,
                    value: source.values[key],
                    message: `is not a section of this configuration (expected ${claimed.join(', ')})`,
                });
            }
        }
    }

    return issues;
}

/**
 * One section, from its fallback through every source that mentions it, in the
 * order the sources were given (CFG-4), and then through its own check.
 *
 * A source that says nothing about the key leaves the section exactly as it
 * was: writing three keys of thirty must not turn the other twenty-seven into
 * `undefined`.
 *
 * The check runs **once, on the merged result** and never on a single source: a
 * partial file is legitimate, so a source is not a thing that can be valid on
 * its own (CFG-3).
 *
 * The source is stamped on **last**, over whatever the check returned: a shape
 * is matched structurally, so a service whose own problems already carry a
 * source of their own — the shape `RND`'s do — would otherwise replace the one
 * fact `CFG` owns with one it invented (CFG-3).
 */
function composeSection(shape: SectionShape<unknown>, sources: readonly ConfigSource[]): Section {
    let value = shape.fallback;
    const contributors: string[] = [];

    for (const source of sources) {
        if (mentions(source, shape.key)) {
            value = overlay(value, source.values[shape.key]);
            contributors.push(source.name);
        }
    }

    const source = joinedNames(contributors);
    const issues = shape.validate(value).map((problem) => ({ ...problem, source }));

    return { value, issues };
}

/**
 * The sources that composed a section, as the one name an issue carries.
 *
 * Deliberately not the source of the offending *key*: knowing that would
 * require `CFG` to take an issue's `path` apart, and the dots and the brackets
 * in a path are a notation the **service** invents (CFG-3). This names every
 * file that had a hand in the section, and never names the wrong one.
 */
function joinedNames(contributors: readonly string[]): string {
    if (contributors.length === 0) {
        return NO_SOURCE;
    }
    return contributors.join(SOURCE_SEPARATOR);
}

/**
 * The overlay, one level deep inside a section and no deeper (CFG-4).
 *
 * Everything below a section's key is replaced **whole**, and a value that is
 * not an object replaces whatever was there. Deep merging is refused on
 * purpose: merging two lists element by element assumes that `rules[0]` in the
 * file *is* `rules[0]` in the default, which nothing says, and it makes
 * **removing** an entry impossible. A whole-value replacement is coarser and
 * always means one thing.
 */
function overlay(base: unknown, next: unknown): unknown {
    if (isRecord(base) && isRecord(next)) {
        return { ...base, ...next };
    }
    return next;
}

/**
 * True when the source writes the key at all, `undefined` included.
 *
 * The distinction matters: a key not written is a decision to leave the section
 * alone, and a key written as `undefined` is a value the section's own check is
 * entitled to have an opinion about.
 */
function mentions(source: ConfigSource, key: string): boolean {
    return Object.hasOwn(source.values, key);
}

/** A plain object: not null, not an array, not a primitive. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

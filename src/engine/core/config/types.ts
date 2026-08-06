/**
 * The vocabulary of the composition: what a source is, what a section says
 * about itself, and what comes back when one of them does not validate.
 *
 * Every type here describes data the **caller** produces. `CFG` owns no key, no
 * default and no range (CFG-12), so nothing in this file names a parameter of
 * this game — or of any game.
 */

/**
 * One source of parameters, as the caller read it.
 *
 * `CFG` does no I/O: whoever has a file system, a `fetch` or a bundler passes
 * the result in already parsed (CFG-14). The name is the caller's too, because
 * a service that guessed one would send somebody looking for a file that does
 * not exist.
 */
export interface ConfigSource {
    /** How the caller wants it named in an error: `'random.json'`, `'defaults'`, … */
    readonly name: string;

    /** Already parsed, keyed by section. `CFG` neither reads nor parses. */
    readonly values: Readonly<Record<string, unknown>>;
}

/**
 * What is wrong with a value, in the terms a service can speak: what was
 * expected, where, and what was found instead.
 *
 * **Not** where it came from — a service validating its own slice cannot know
 * that, and is therefore not asked for it (CFG-3).
 */
export interface Problem {
    /** `'channelCap'`, `"profiles['lockpick'].reduction"`. Empty for the section itself. */
    readonly path: string;

    /** The offending value, exactly as it was found at `path`. */
    readonly value: unknown;

    /** What was expected there. Does not repeat the value: `describeIssue` adds it. */
    readonly message: string;
}

/**
 * What a service says about its own slice: the key it is written under, what it
 * is when nobody mentions it, and the check that accepts it.
 *
 * All three belong to the service and never to `CFG` (CFG-13), and a service
 * declares one **without importing anything from here**: the match is
 * structural, which is what keeps a generic service free of any dependency on
 * the mechanism that configures it (ARC-4.1).
 */
export interface SectionShape<T> {
    /** The key the section is written under in a source: `'random'`, `'oven'`, … */
    readonly key: string;

    /** The section in the absence of every source. May legitimately be `undefined` (RND-21). */
    readonly fallback: T;

    /** The service's own check, which reports **every** problem, not the first (RND-24). */
    validate(value: unknown): readonly Problem[];
}

/** A problem, plus the one thing no service could have supplied (CFG-3). */
export interface ConfigIssue extends Problem {
    /** The sources that composed the section, joined: `'random.json'`, `'base+local'`. */
    readonly source: string;
}

/**
 * The slice of each shape, in the order the shapes were given.
 *
 * `T` is taken from the shape's `fallback` and not from its `validate`, which
 * says nothing about what a valid value is: a shape written with a bare
 * `fallback: undefined` therefore types its slice `undefined` rather than "the
 * service's parameters or nothing".
 */
export type Composed<S> = { [K in keyof S]: S[K] extends SectionShape<infer T> ? T : never };

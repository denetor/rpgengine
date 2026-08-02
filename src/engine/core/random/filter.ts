/**
 * Filtered randomness: the pure half (RND-9, RND-17).
 *
 * Every function here takes what it needs and returns a new value. The channel
 * memory that these transformations describe is *held* by `channels.ts`, which
 * owns the one impurity the service allows on this path — updating a channel's
 * weights.
 *
 * The mechanism is **weight readjustment, never re-rolling** (ADR 0002). What
 * has just come up has its weight reduced and recovers it over the following
 * draws. There is no rejection loop here, and there must never be one: "never
 * twice in a row" is a rule a player learns and exploits, and it replaces a
 * sequence that feels unfair with one that is predictable.
 */

import { byName } from './order';
import type { FilterConfig, FilterProfile } from './types';

/**
 * The profile reported for a channel that is not filtered at all, because the
 * service was built without a configuration (RND-21).
 *
 * A configuration may not define a profile of this name: `channels()` exists so
 * that a channel which *looks* filtered without being so is visible, and a real
 * profile sharing the name would put the ambiguity straight back.
 */
export const UNFILTERED_PROFILE = 'none';

/** The character that makes a rule's channel a prefix rather than a whole name. */
const WILDCARD = '*';

/**
 * The floor a weight multiplier never goes below.
 *
 * Far below anything the filter reaches in play — with the reduction of 0.6 the
 * ticket suggests, twenty repeats in a row land near 10⁻⁵ — it exists so that a
 * channel offering a *single* outcome, drawn thousands of times, still has a
 * positive total to draw from. It also keeps ADR 0002's promise literally true:
 * a run of repeats gets rarer, never impossible.
 */
const MINIMUM_MULTIPLIER = 1e-12;

/** The multipliers of a channel that has not been drawn from yet: all nominal. */
export function fullMultipliers(count: number): number[] {
    const multipliers: number[] = [];
    for (let index = 0; index < count; index += 1) {
        multipliers.push(1);
    }
    return multipliers;
}

/**
 * The weights a filtered draw actually uses: each nominal weight scaled by what
 * the channel remembers about that outcome.
 *
 * An outcome of nominal weight zero stays at zero however the multipliers move:
 * "never comes up" is the caller's statement, and the filter does not overrule
 * it.
 */
export function adjustedWeights(
    weights: readonly number[],
    multipliers: readonly number[],
): number[] {
    const adjusted: number[] = [];
    for (let index = 0; index < weights.length; index += 1) {
        adjusted.push(weights[index] * multipliers[index]);
    }
    return adjusted;
}

/**
 * The multipliers after the outcome at `chosen` came up.
 *
 * The one that came up is **multiplied** by the profile's reduction, so repeats
 * get geometrically rarer without ever being ruled out. Every other outcome
 * **adds** back a fixed step, `(1 - reduction) / recovery`.
 *
 * That step is what makes `recovery` readable as a number of draws, and it is
 * exact **from full weight**: with a reduction of 0.6 a first draw costs 0.4,
 * the step returns 0.2, and two draws in which the outcome does not come up
 * restore it precisely. From further down it is not proportional — a second
 * reduction costs only `0.4 × m`, while the step stays the same size — so an
 * outcome that has come up several times climbs back in *fewer* draws than the
 * count of reductions would suggest. That is the intended shape: the filter
 * leans hard on a repeat and then lets go, rather than holding a grudge for
 * `recovery` draws per repeat.
 */
export function nextMultipliers(
    multipliers: readonly number[],
    chosen: number,
    profile: FilterProfile,
): number[] {
    const step = (1 - profile.reduction) / profile.recovery;
    const next: number[] = [];

    for (let index = 0; index < multipliers.length; index += 1) {
        if (index === chosen) {
            next.push(Math.max(MINIMUM_MULTIPLIER, multipliers[index] * profile.reduction));
        } else {
            next.push(Math.min(1, multipliers[index] + step));
        }
    }

    return next;
}

/**
 * The `count` channels to evict when the cap is exceeded: the ones drawn from
 * **least recently** (RND-20).
 *
 * Recency is the value the service's **draw counter** held when a channel was
 * last drawn from — never a clock reading (ARC-9.3). A clock would have two
 * otherwise identical games evict different channels, and produce different
 * sequences from then on, because one of them ran on a slower machine or was
 * left paused over lunch.
 *
 * The order is `(lastUsed, name)` and it is **total**: no two channels compare
 * equal, because no two share a name. That is what the tie-break is for, and it
 * is the whole of why the answer does not depend on the order the map hands its
 * entries over — the least `count` are the least `count` however they are met.
 */
export function leastRecentlyUsed(
    memories: ReadonlyMap<string, { lastUsed: number }>,
    count: number,
): string[] {
    const ordered: { channel: string; lastUsed: number }[] = [];
    for (const [channel, memory] of memories) {
        ordered.push({ channel, lastUsed: memory.lastUsed });
    }
    ordered.sort(byRecency);

    return ordered.slice(0, count).map((entry) => entry.channel);
}

/** Orders channels from the least recently used to the most, then by name. */
function byRecency(
    one: { channel: string; lastUsed: number },
    other: { channel: string; lastUsed: number },
): number {
    if (one.lastUsed !== other.lastUsed) {
        return one.lastUsed - other.lastUsed;
    }
    return byName(one.channel, other.channel);
}

/**
 * The profile that governs `channel`, resolved **by prefix** (RND-10).
 *
 * Channel names are invented by the caller at runtime (RND-15) and cannot be
 * listed in a file, so the rules match prefixes: `'lockpick:*'` governs every
 * channel that starts with `'lockpick:'`. A rule without a `*` matches the whole
 * name and nothing else.
 *
 * **The most specific rule wins**, which is the longest prefix, and a whole-name
 * match beats every prefix. Two rules of the same specificity are settled by
 * declaration order, first one wins — so the answer never depends on how the
 * configuration happened to be read.
 *
 * This runs **once per channel**, when the channel is created, and the answer is
 * kept with the channel's state: there is no per-draw resolution cost.
 */
export function resolveProfile(channel: string, config: FilterConfig | undefined): string {
    if (config === undefined) {
        return UNFILTERED_PROFILE;
    }

    let resolved = config.default;
    let specificity = -1;

    for (const rule of config.rules ?? []) {
        const matched = specificityOf(rule.channel, channel);
        if (matched > specificity) {
            resolved = rule.profile;
            specificity = matched;
        }
    }

    return resolved;
}

/**
 * How specifically `pattern` matches `channel`, or -1 for no match.
 *
 * A whole-name match scores one above the longest prefix a pattern of that
 * length could score, so it always wins.
 */
function specificityOf(pattern: string, channel: string): number {
    if (pattern.endsWith(WILDCARD)) {
        const prefix = pattern.slice(0, pattern.length - WILDCARD.length);
        return channel.startsWith(prefix) ? prefix.length : -1;
    }
    return pattern === channel ? pattern.length + 1 : -1;
}

/**
 * A filter configuration, or an error.
 *
 * It is checked in the constructor, once, because the service reads no files
 * (ARC-4.1) and because a profile that cannot be resolved must not be found out
 * about halfway through a game: by then the channel exists, some draws have
 * already happened under the wrong parameters, and the sequence cannot be
 * unwound.
 */
export function assertFilterConfig(config: FilterConfig | undefined): void {
    if (config === undefined) {
        return;
    }
    if (config === null || typeof config !== 'object') {
        throw new Error('filter configuration: expected an object');
    }
    if (config.profiles === null || typeof config.profiles !== 'object') {
        throw new Error('filter configuration: expected a set of profiles');
    }
    if (!Number.isInteger(config.channelCap) || config.channelCap < 1) {
        throw new Error(
            `filter configuration: channelCap is '${String(config.channelCap)}'; it is a number of channels, a whole number of at least one`,
        );
    }

    for (const [name, profile] of Object.entries(config.profiles)) {
        assertProfile(name, profile);
    }

    if (typeof config.default !== 'string' || !(config.default in config.profiles)) {
        throw new Error(
            `filter configuration: the default profile '${String(config.default)}' is not one of the profiles defined`,
        );
    }

    for (const rule of config.rules ?? []) {
        if (typeof rule.channel !== 'string' || rule.channel.length === 0) {
            throw new Error('filter configuration: a rule must name a channel pattern');
        }
        if (!(rule.profile in config.profiles)) {
            throw new Error(
                `filter configuration: rule '${rule.channel}' names the profile '${String(rule.profile)}', which is not defined`,
            );
        }
    }
}

/** One profile's parameters, or an error naming the profile. */
function assertProfile(name: string, profile: FilterProfile): void {
    if (name === UNFILTERED_PROFILE) {
        throw new Error(
            `filter configuration: '${UNFILTERED_PROFILE}' is the name reported for a channel that is not filtered, and cannot name a profile`,
        );
    }
    if (profile === null || typeof profile !== 'object') {
        throw new Error(`filter configuration: profile '${name}' is not a set of parameters`);
    }
    if (!Number.isFinite(profile.reduction) || profile.reduction <= 0 || profile.reduction > 1) {
        throw new Error(
            `filter configuration: profile '${name}' has a reduction of ${String(profile.reduction)}; it must be greater than zero and at most one, or an outcome would stop coming up altogether`,
        );
    }
    if (!Number.isFinite(profile.recovery) || profile.recovery < 1) {
        throw new Error(
            `filter configuration: profile '${name}' has a recovery of ${String(profile.recovery)}; it is a number of draws, at least one`,
        );
    }
}

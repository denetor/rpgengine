/**
 * The channel memories: filtered randomness' one piece of mutable state.
 *
 * RND-17 confines the service's impurity to two operations, and this file owns
 * the second of them — updating a channel's weights. Everything it does to
 * arrive at those weights is a pure function in `filter.ts`.
 *
 * The memories live here, at the **service** level and not on a stream, for
 * three reasons that all point the same way: `forget` and `channels()` are
 * service methods, the save carries one list of channels (RND-22), and the
 * channel key is the caller's choice of granularity (RND-15) — two streams that
 * name the same channel mean the same memory, which is what the caller asked
 * for by naming it the same.
 */

import {
    adjustedWeights,
    assertFilterConfig,
    fullMultipliers,
    nextMultipliers,
    resolveProfile,
} from './filter';
import { toWeighted, toWeightedIndex, weightsOf } from './transforms';
import type { RandomChannelState } from './state';
import type { ChannelReport, FilterConfig, FilterProfile, WeightedEntry } from './types';

/**
 * The weights a filtered channel currently holds, and the profile that moves
 * them. Both are settled when the channel is created (RND-10 — once, never per
 * draw).
 */
interface ChannelWeights {
    profile: FilterProfile;
    multipliers: number[];
}

/**
 * What is remembered about one channel.
 *
 * `weights` is **null** for a channel on a service built without a
 * configuration: there is no filtering to do, and nothing to remember. The
 * channel is kept all the same so that `channels()` can report it, which is the
 * whole point of RND-21 — a channel that *looks* filtered without being so must
 * be visible.
 */
interface ChannelMemory {
    /** The name of the resolved profile: what `channels()` reports (RND-21). */
    profileName: string;
    weights: ChannelWeights | null;
}

export class Channels {
    private readonly config?: FilterConfig;
    private readonly memories = new Map<string, ChannelMemory>();

    constructor(config?: FilterConfig) {
        assertFilterConfig(config);
        this.config = config;
    }

    /**
     * One filtered draw on `channel`, from a uniform value the caller has
     * already taken from its stream (RND-18: one draw, exactly).
     *
     * The table is expected to have been checked already — `Stream.filtered`
     * does it before it draws, so that a refused table leaves the sequence
     * where it was.
     *
     * With no configuration this is the plain weighted draw: no memory is kept,
     * nothing is reduced, and the outcome is the one the same uniform value
     * would have given `weighted` (RND-21).
     */
    draw<T>(channel: string, entries: readonly WeightedEntry<T>[], uniform: number): T {
        const held = this.memoryFor(channel, entries.length).weights;
        if (held === null) {
            return toWeighted(uniform, entries);
        }

        const adjusted = adjustedWeights(weightsOf(entries), held.multipliers);
        const chosen = toWeightedIndex(uniform, adjusted);
        held.multipliers = nextMultipliers(held.multipliers, chosen, held.profile);
        return entries[chosen].value;
    }

    /** The live channels and the profile resolved for each, by name (RND-21). */
    list(): ChannelReport[] {
        const reports: ChannelReport[] = [];
        for (const [channel, memory] of this.memories) {
            reports.push({ channel, profile: memory.profileName });
        }
        reports.sort(byChannel);
        return reports;
    }

    /**
     * The channels' portion of the save: the current weights, and nothing else
     * (RND-13, RND-22).
     *
     * The resolved profile is **not** written. Profiles are static data, not
     * part of the game's randomness, and a restore resolves them again from the
     * configuration in force at load time — so a rebalanced `random.json` takes
     * effect on the next load instead of being shadowed by a name in the save.
     *
     * An unfiltered channel has no weights, so it has nothing to save. It comes
     * back the next time it is drawn from.
     */
    save(): RandomChannelState[] {
        const saved: RandomChannelState[] = [];
        for (const [channel, memory] of this.memories) {
            if (memory.weights !== null) {
                saved.push({ channel, multipliers: [...memory.weights.multipliers] });
            }
        }
        saved.sort(byChannel);
        return saved;
    }

    /**
     * Takes on the channel memories a save describes, under the configuration
     * in force now.
     *
     * Whoever calls this has already had the state checked by
     * `assertRandomState`, the one place that knows what a usable save looks
     * like.
     *
     * **A save reloaded without a configuration loses its channel weights**,
     * and re-saving writes them away. That is deliberate, not an oversight:
     * with no profiles there is nothing to apply the weights with and nothing
     * to update them by, so keeping them would mean carrying numbers no code
     * can read or move. It is the same event as a game whose `random.json`
     * stopped shipping — the filter is gone, and its memory goes with it. The
     * channel name survives, so `channels()` still shows it as unfiltered.
     */
    restore(saved: readonly RandomChannelState[]): void {
        for (const channel of saved) {
            this.memories.set(
                channel.channel,
                this.newMemory(channel.channel, [...channel.multipliers]),
            );
        }
    }

    /**
     * The memory of `channel`, created on first use — which is where the
     * profile is resolved, once (RND-10).
     *
     * A table of a different size is a different table: the channel names the
     * table, and multipliers held by position cannot follow outcomes that have
     * moved. Starting over is the only honest answer, and it is the only
     * mismatch the service can see — a table reordered without changing length
     * looks identical from here, and stays the caller's responsibility.
     */
    private memoryFor(channel: string, outcomes: number): ChannelMemory {
        const existing = this.memories.get(channel);
        if (existing === undefined) {
            const created = this.newMemory(channel, fullMultipliers(outcomes));
            this.memories.set(channel, created);
            return created;
        }

        if (existing.weights !== null && existing.weights.multipliers.length !== outcomes) {
            existing.weights.multipliers = fullMultipliers(outcomes);
        }
        return existing;
    }

    /**
     * A memory for `channel`, holding `multipliers` if there is any filtering
     * to do — and this is the one place the profile is resolved (RND-10).
     */
    private newMemory(channel: string, multipliers: number[]): ChannelMemory {
        const profileName = resolveProfile(channel, this.config);
        if (this.config === undefined) {
            return { profileName, weights: null };
        }
        return {
            profileName,
            weights: { profile: this.config.profiles[profileName], multipliers },
        };
    }
}

/** Orders channels by name, by code unit: no locale, no ambiguity. */
function byChannel(one: { channel: string }, other: { channel: string }): number {
    if (one.channel === other.channel) {
        return 0;
    }
    return one.channel < other.channel ? -1 : 1;
}

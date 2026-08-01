/**
 * `RND`'s own portion of the save (RND-22, ARC-10.2).
 *
 * The state is **plain data**: numbers, strings and arrays of them, and nothing
 * else. It carries a version of its own, so that the format can be migrated
 * without touching the other services' portions.
 *
 * Only what cannot be rebuilt from the root seed is in here. A stream that was
 * never requested does not appear: its seed is `hash(root seed, id)`, so
 * requesting it after a restore rebuilds the same sequence from its own name.
 * The save therefore grows with the streams actually used, not with playing
 * time.
 */

import { STATE_WORDS } from './xoshiro128';
import type { StreamId } from './types';

/**
 * The version of this format. Bumped whenever the shape below changes.
 *
 * Version 2 added `channels`, the anti-repetition memory of the filtered draw
 * (RND-13). It is a **required** field rather than an optional one, and that is
 * the reason for the bump: a state without it is a state from before the filter
 * existed, and reading it as "no channels" would quietly reset the very memory
 * RND-13 exists to preserve. Migrating between versions belongs to `SAVE`.
 */
export const RANDOM_STATE_VERSION = 2;

/** The largest value a 32-bit generator word can hold. */
const MAX_UINT32 = 4294967295;

/** The smallest value a signed 32-bit word can hold. */
const MIN_INT32 = -2147483648;

/** One saved stream: where it is in its sequence, and how it was seeded. */
export interface RandomStreamState {
    /** The stream's name — what it will be asked for again after the restore. */
    id: StreamId;

    /** The generator state: `STATE_WORDS` unsigned 32-bit words. */
    words: number[];

    /**
     * The explicit seed the stream was created with, if any (RND-19). Absent
     * when the seed was derived from the name: restore must not depend on the
     * game passing the number again, and a derived seed is recomputable.
     */
    seed?: number;
}

/**
 * One saved channel: the anti-repetition memory of a filtered draw (RND-13).
 *
 * The **resolved profile is not here**. Profiles are static data — they live in
 * the game's `random.json`, not in the save — and a restore resolves them again
 * from the configuration in force at load time, so that a rebalanced profile
 * takes effect on the next load rather than being shadowed by a name written
 * months ago.
 */
export interface RandomChannelState {
    /** The channel's name, exactly as the caller wrote it (RND-15). */
    channel: string;

    /**
     * The current weight of each outcome, as a fraction of its nominal weight,
     * by position in the table the caller passes. Each in (0, 1].
     */
    multipliers: number[];
}

/** `RND`'s portion of a save. */
export interface RandomState {
    version: number;
    rootSeed: number;
    streams: RandomStreamState[];

    /**
     * The live channels that have weights to remember. A channel on a service
     * built without a filter configuration has none, and does not appear.
     */
    channels: RandomChannelState[];
}

/**
 * Checks a state before anything is built from it, so that a corrupt save
 * fails at load time and not halfway through a game (CTX-10).
 *
 * The check is on this format's own invariants — the ones that would otherwise
 * turn into a silently wrong game, an all-zero generator state above all: it is
 * a state `xoshiro128**` can never leave, and it would hand out the same value
 * for ever. Fuller parameter validation belongs to issue 10.
 */
export function assertRandomState(state: RandomState): void {
    if (state === null || typeof state !== 'object') {
        throw new Error('random state: expected an object');
    }
    if (state.version !== RANDOM_STATE_VERSION) {
        throw new Error(
            `random state: version ${String(state.version)} cannot be read by version ${RANDOM_STATE_VERSION}`,
        );
    }
    if (!fitsInThirtyTwoBits(state.rootSeed)) {
        throw new Error(`random state: root seed '${String(state.rootSeed)}' does not fit in 32 bits`);
    }
    if (!Array.isArray(state.streams)) {
        throw new Error('random state: expected a list of streams');
    }

    const seen = new Set<StreamId>();
    for (const stream of state.streams) {
        assertStreamState(stream);
        if (seen.has(stream.id)) {
            throw new Error(`random state: stream '${stream.id}' appears twice`);
        }
        seen.add(stream.id);
    }

    if (!Array.isArray(state.channels)) {
        throw new Error('random state: expected a list of channels');
    }

    const named = new Set<string>();
    for (const channel of state.channels) {
        assertChannelState(channel);
        if (named.has(channel.channel)) {
            throw new Error(`random state: channel '${channel.channel}' appears twice`);
        }
        named.add(channel.channel);
    }
}

/**
 * Checks one saved channel.
 *
 * A multiplier outside (0, 1] is refused rather than clamped: above one it
 * would make an outcome *more* likely than the table says, which is the
 * opposite of what the filter does, and at or below zero it would rule the
 * outcome out for ever — the re-roll rule ADR 0002 rejects, arriving through
 * the save file instead of through the code.
 */
function assertChannelState(channel: RandomChannelState): void {
    if (
        channel === null ||
        typeof channel !== 'object' ||
        typeof channel.channel !== 'string' ||
        channel.channel.length === 0
    ) {
        throw new Error('random state: a channel has no name');
    }
    if (!Array.isArray(channel.multipliers) || channel.multipliers.length === 0) {
        throw new Error(`random state: channel '${channel.channel}' remembers no outcomes`);
    }
    for (const multiplier of channel.multipliers) {
        if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 1) {
            throw new Error(
                `random state: channel '${channel.channel}' holds the multiplier '${String(multiplier)}', which is not a fraction of a weight`,
            );
        }
    }
}

/** Checks one saved stream. Throws with the stream's name in the message. */
function assertStreamState(stream: RandomStreamState): void {
    if (stream === null || typeof stream !== 'object' || typeof stream.id !== 'string') {
        throw new Error('random state: a stream has no name');
    }
    if (!Array.isArray(stream.words) || stream.words.length !== STATE_WORDS) {
        throw new Error(
            `random state: stream '${stream.id}' does not hold ${STATE_WORDS} generator words`,
        );
    }
    for (const word of stream.words) {
        if (!isUint32(word)) {
            throw new Error(
                `random state: stream '${stream.id}' holds '${String(word)}', not a 32-bit word`,
            );
        }
    }
    if (stream.words.every((word) => word === 0)) {
        throw new Error(`random state: stream '${stream.id}' holds an all-zero generator state`);
    }
    if (stream.seed !== undefined && !fitsInThirtyTwoBits(stream.seed)) {
        throw new Error(
            `random state: stream '${stream.id}' has seed '${String(stream.seed)}', which does not fit in 32 bits`,
        );
    }
}

/** True for a whole number that fits in an unsigned 32-bit word. */
function isUint32(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= MAX_UINT32;
}

/**
 * True for a whole number that fits in 32 bits read either way — the union of
 * the signed and the unsigned range.
 *
 * A seed is a bit pattern, not a quantity: `seed.ts` and `xoshiro128.ts` take
 * it through `| 0`, so `-1` and `4294967295` name the same seed and both are
 * legitimate in a save. What is refused is a number that would change under
 * that coercion, which is the one way a seed can come back different from the
 * one that was written.
 */
function fitsInThirtyTwoBits(value: number): boolean {
    return Number.isInteger(value) && value >= MIN_INT32 && value <= MAX_UINT32;
}

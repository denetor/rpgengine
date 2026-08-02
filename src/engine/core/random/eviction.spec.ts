import { describe, expect, it } from 'vitest';
import { Random, RANDOM_STATE_VERSION, UNFILTERED_PROFILE } from './index';
import type { FilterConfig, RandomState, WeightedEntry } from './index';

/**
 * The channel cap, its eviction and `forget` (RND-20), observed through a
 * constructed service — the same seam as every other spec here.
 *
 * The property these tests are really about is that **which** channel goes is
 * decided by the sequence of draws and by nothing else: not by the order the
 * channels happen to sit in inside a map, not by how long the player left the
 * game running. Several tests below are therefore written in mirrored pairs, so
 * that an implementation reaching for "the first one I find" fails one half of
 * the pair whichever half it gets right.
 */

const TABLE: WeightedEntry<string>[] = [
    { value: 'hit', weight: 3 },
    { value: 'miss', weight: 1 },
];

/** A configuration that differs from the others only in how many channels it allows. */
function cappedAt(channelCap: number): FilterConfig {
    return {
        channelCap,
        default: 'neutral',
        profiles: { neutral: { reduction: 0.6, recovery: 2 } },
    };
}

/** The channels a service still holds, by name — `channels()` orders them. */
function liveChannels(service: Random): string[] {
    return service.channels().map((report) => report.channel);
}

/** One filtered draw on each of `channels`, in the order given. */
function drawOnEach(service: Random, ...channels: string[]): void {
    const stream = service.stream('loot');
    for (const channel of channels) {
        stream.filtered(channel, TABLE);
    }
}

describe('the channel cap', () => {
    it('is a data parameter: two services with the same draws keep different numbers of channels', () => {
        const narrow = new Random(300, cappedAt(2));
        const wide = new Random(300, cappedAt(4));

        drawOnEach(narrow, 'a', 'b', 'c', 'd', 'e');
        drawOnEach(wide, 'a', 'b', 'c', 'd', 'e');

        expect(liveChannels(narrow)).toHaveLength(2);
        expect(liveChannels(wide)).toHaveLength(4);
    });

    it('holds however many channels are drawn from while it is not exceeded', () => {
        const service = new Random(301, cappedAt(8));

        drawOnEach(service, 'a', 'b', 'c');

        expect(liveChannels(service)).toEqual(['a', 'b', 'c']);
    });

    it('insists on a cap it can enforce', () => {
        const usable = cappedAt(4);
        const capless: Partial<FilterConfig> = { ...usable };
        delete capless.channelCap;

        expect(() => new Random(302, capless as FilterConfig)).toThrow(/channelCap/);
        expect(() => new Random(302, { ...usable, channelCap: 0 })).toThrow(/channelCap/);
        expect(() => new Random(302, { ...usable, channelCap: -1 })).toThrow(/channelCap/);
        expect(() => new Random(302, { ...usable, channelCap: 2.5 })).toThrow(/channelCap/);
    });

    it('does not exist without a configuration, because there is no data to take one from', () => {
        // Pinned as a decision, not discovered as a bug: with no configuration
        // there is nothing remembered about a channel, and the list is a
        // diagnostic (RND-21). Inventing a cap here would be the balancing
        // default ARC-3.2 forbids a generic service from holding.
        const service = new Random(303);

        drawOnEach(service, 'a', 'b', 'c', 'd', 'e');

        expect(liveChannels(service)).toHaveLength(5);
        expect(service.channels()[0].profile).toBe(UNFILTERED_PROFILE);
    });
});

describe('eviction', () => {
    it('drops the least recently used channel, not the first one created', () => {
        const service = new Random(310, cappedAt(2));

        drawOnEach(service, 'a', 'b', 'a', 'c');

        expect(liveChannels(service)).toEqual(['a', 'c']);
    });

    it('drops the least recently used channel, not the alphabetically first', () => {
        const service = new Random(311, cappedAt(2));

        drawOnEach(service, 'b', 'a', 'b', 'c');

        expect(liveChannels(service)).toEqual(['b', 'c']);
    });

    it('measures recency by draws, so work that is not a draw does not touch it', () => {
        const undisturbed = new Random(312, cappedAt(2));
        const busy = new Random(312, cappedAt(2));

        drawOnEach(undisturbed, 'a', 'b', 'a');
        drawOnEach(busy, 'a', 'b', 'a');
        busy.channels();
        busy.serialize();
        busy.stream('combat').diceRoll(6, 10);
        busy.stream('loot').next();

        drawOnEach(undisturbed, 'c');
        drawOnEach(busy, 'c');

        expect(liveChannels(busy)).toEqual(liveChannels(undisturbed));
    });

    it('breaks a tie by channel name, so the order is total', () => {
        // A tie needs a save to arrange: within one run the counter never
        // repeats itself. Both orders of the same two channels are checked,
        // because a save is a list and "whichever I met first" must not be the
        // answer — that is the whole point of having a tie-break.
        const asWritten = savedChannels([
            { channel: 'alpha', lastUsed: 7 },
            { channel: 'beta', lastUsed: 7 },
        ]);
        const reversed = savedChannels([
            { channel: 'beta', lastUsed: 7 },
            { channel: 'alpha', lastUsed: 7 },
        ]);

        expect(liveChannels(Random.deserialize(asWritten, cappedAt(1)))).toEqual(['beta']);
        expect(liveChannels(Random.deserialize(reversed, cappedAt(1)))).toEqual(['beta']);
    });

    it('lets the counter decide before the name does', () => {
        const state = savedChannels([
            { channel: 'alpha', lastUsed: 9 },
            { channel: 'beta', lastUsed: 7 },
        ]);

        expect(liveChannels(Random.deserialize(state, cappedAt(1)))).toEqual(['alpha']);
    });

    it('lets a channel that was evicted be used again, from an empty memory', () => {
        const service = new Random(313, cappedAt(1));
        const stream = service.stream('loot');

        for (let draw = 0; draw < 20; draw += 1) {
            stream.filtered('door:42', TABLE);
        }
        stream.filtered('door:43', TABLE);
        stream.filtered('door:42', TABLE);

        const [channel] = service.serialize().channels;
        expect(channel.channel).toBe('door:42');
        // One draw's worth of memory, and no more: the outcome that came up is
        // at the profile's reduction, the other is still nominal.
        expect(channel.multipliers.filter((multiplier) => multiplier === 1)).toHaveLength(1);
        expect(Math.min(...channel.multipliers)).toBeCloseTo(0.6, 10);
    });

    it('keeps the cap after a restore, whatever the save carries', () => {
        const roomy = new Random(314, cappedAt(10));
        drawOnEach(roomy, 'a', 'b', 'c', 'd', 'e', 'f');

        const cramped = Random.deserialize(roomy.serialize(), cappedAt(3));

        expect(liveChannels(cramped)).toEqual(['d', 'e', 'f']);
    });

    it('evicts the same channel whether or not the game was saved in between', () => {
        // The point of measuring recency with the draw counter rather than the
        // clock: reloading must not be a way of choosing which memory survives.
        const straight = new Random(315, cappedAt(3));
        drawOnEach(straight, 'a', 'b', 'c', 'a');

        const config = cappedAt(3);
        const reloaded = Random.deserialize(straight.serialize(), config);

        drawOnEach(straight, 'd');
        drawOnEach(reloaded, 'd');

        expect(liveChannels(reloaded)).toEqual(liveChannels(straight));
        expect(liveChannels(reloaded)).toEqual(['a', 'c', 'd']);
    });
});

describe('forgetting a channel', () => {
    it('takes it out of the diagnostics and out of the save', () => {
        const service = new Random(320, cappedAt(8));
        drawOnEach(service, 'a', 'b', 'c');

        service.forget('b');

        expect(liveChannels(service)).toEqual(['a', 'c']);
        expect(service.serialize().channels.map((channel) => channel.channel)).toEqual(['a', 'c']);
    });

    it('leaves the next draw on that channel starting from an empty memory', () => {
        const service = new Random(321, cappedAt(8));
        const stream = service.stream('loot');

        for (let draw = 0; draw < 20; draw += 1) {
            stream.filtered('door:42', TABLE);
        }
        service.forget('door:42');
        stream.filtered('door:42', TABLE);

        // One draw's worth of memory and no more, whatever the twenty before
        // it had done to the weights.
        const [channel] = service.serialize().channels;
        expect(channel.multipliers.filter((multiplier) => multiplier === 1)).toHaveLength(1);
        expect(Math.min(...channel.multipliers)).toBeCloseTo(0.6, 10);
    });

    it('says nothing about a channel that was never there', () => {
        const service = new Random(322, cappedAt(8));
        drawOnEach(service, 'a');

        expect(() => service.forget('never-used')).not.toThrow();
        expect(() => service.forget('a')).not.toThrow();
        expect(() => service.forget('a')).not.toThrow();
        expect(liveChannels(service)).toEqual([]);
    });

    it('works without a configuration, where it is the only bound there is', () => {
        const service = new Random(323);
        drawOnEach(service, 'a', 'b');

        service.forget('a');

        expect(liveChannels(service)).toEqual(['b']);
    });

    it('does not disturb the sequence of the stream', () => {
        const forgetful = new Random(324, cappedAt(8));
        const untouched = new Random(324, cappedAt(8));

        drawOnEach(forgetful, 'a');
        forgetful.forget('a');
        drawOnEach(untouched, 'a');

        expect(forgetful.stream('loot').next()).toBe(untouched.stream('loot').next());
    });
});

/**
 * A save holding the channels described, in the order given and all of the same
 * shape. Hand-built because a live service cannot produce two channels last
 * used at the same count, nor choose the order they are written in.
 */
function savedChannels(
    channels: readonly { channel: string; lastUsed: number }[],
): RandomState {
    return {
        version: RANDOM_STATE_VERSION,
        rootSeed: 400,
        streams: [],
        channels: channels.map((channel) => ({ ...channel, multipliers: [1, 1] })),
    };
}
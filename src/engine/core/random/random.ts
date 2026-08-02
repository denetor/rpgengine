import { Channels } from './channels';
import { byName } from './order';
import { streamSeed } from './seed';
import { assertRandomState, RANDOM_STATE_VERSION } from './state';
import { Stream } from './stream';
import type { RandomState, RandomStreamState } from './state';
import type { ChannelReport, FilterConfig, RandomStream, StreamId } from './types';

/**
 * `RND` — the project's single source of randomness.
 *
 * The service holds a root seed and hands out one stream per usage domain.
 * A stream's seed is `hash(root seed, id)`, so it does not depend on the order
 * in which the streams come into existence: adding a stream tomorrow leaves
 * every other stream's sequence untouched (RND-19).
 */
/**
 * A live stream, together with the explicit seed it was created with, if any.
 * The seed is kept because restore must not depend on the caller passing the
 * same number again (RND-19).
 */
interface StreamRecord {
    stream: Stream;
    explicitSeed?: number;
}

export class Random {
    private readonly rootSeed: number;
    private readonly streams = new Map<StreamId, StreamRecord>();

    /**
     * The anti-repetition memories of the filtered draw, one set for the whole
     * service and shared by every stream (RND-15). Built here because the
     * configuration arrives here, and checked in its own constructor.
     */
    private readonly channelMemories: Channels;

    /**
     * The filter configuration is **optional**, and its absence is the absence
     * of the feature, not a default in disguise: without it `filtered()` is
     * exactly `weighted()` (RND-21, ARC-3.2). It arrives already parsed — the
     * service reads no files (ARC-4.1).
     */
    constructor(rootSeed: number, filter?: FilterConfig) {
        this.rootSeed = rootSeed;
        this.channelMemories = new Channels(filter);
    }

    /**
     * The stream named `id`, created on first request and memoized: the same
     * `id` always returns the same instance (RND-19).
     *
     * An explicit `seed` takes precedence over the derived one. It is read
     * when the stream is created; asking again for a stream that already
     * exists with a *different* explicit seed is a programming error and
     * throws, because silently returning the existing stream would leave the
     * caller convinced they had seeded a sequence they had not.
     */
    stream(id: StreamId, seed?: number): RandomStream {
        const existing = this.streams.get(id);
        if (existing !== undefined) {
            if (seed !== undefined && existing.explicitSeed !== seed) {
                throw new Error(
                    `stream '${id}' already exists with a different seed: the seed is read only when the stream is created`,
                );
            }
            return existing.stream;
        }

        const created = Stream.fromSeed(
            seed ?? streamSeed(this.rootSeed, id),
            this.channelMemories,
        );
        this.streams.set(id, { stream: created, explicitSeed: seed });
        return created;
    }

    /**
     * Forgets what the service remembers about `channel` (RND-20).
     *
     * The cap already bounds the memories, evicting the least recently used
     * when it is exceeded; this is for the caller who *knows* the entity has
     * gone — the enemy is dead, the door will not be picked again — and can say
     * so instead of leaving a memory to be crowded out later. Forgetting a
     * channel that is not there is not an error.
     *
     * The next filtered draw on that name starts from an empty memory, exactly
     * as a name never used before would.
     */
    forget(channel: string): void {
        this.channelMemories.forget(channel);
    }

    /**
     * The live channels and the profile resolved for each (RND-21).
     *
     * It is a diagnostic, and it exists because of a specific way of being
     * wrong: a channel on a service with no configuration *looks* filtered from
     * the call site and is not. This is where that shows.
     */
    channels(): readonly ChannelReport[] {
        return this.channelMemories.list();
    }

    /**
     * `RND`'s portion of the save (RND-22): the version, the root seed, the
     * position of the streams that were actually requested, and the current
     * weights of the live channels. A stream nobody asked for is not in here —
     * it is rebuilt from its own name.
     *
     * The streams and the channels are written in order of name, so that the
     * same game saved after the same draws produces the same bytes whatever
     * order they came into existence in.
     */
    serialize(): RandomState {
        const streams: RandomStreamState[] = [];
        for (const [id, record] of this.streams) {
            streams.push(savedStream(id, record));
        }
        streams.sort(byId);

        return {
            version: RANDOM_STATE_VERSION,
            rootSeed: this.rootSeed,
            streams,
            channels: this.channelMemories.save(),
        };
    }

    /**
     * Rebuilds a service from a saved state, under the filter configuration in
     * force now.
     *
     * Restore is a **factory, never an instance method** (RND-22): the service
     * this returns is already complete, so there is no instant in which a live
     * service holds the randomness of the wrong game and whoever rolls a die
     * rolls from the previous one.
     *
     * The configuration is **not** in the save: it is static data, and a
     * rebalanced `random.json` is meant to take effect on the next load. The
     * saved channels carry weights only, and their profiles are resolved again
     * from what is passed here.
     */
    static deserialize(state: RandomState, filter?: FilterConfig): Random {
        assertRandomState(state);

        const restored = new Random(state.rootSeed, filter);
        for (const saved of state.streams) {
            // The seed is handed back to the stream, not just its position:
            // the noise permutation table is rebuilt from it, which is why the
            // save does not carry the table (RND-22).
            const seed = saved.seed ?? streamSeed(state.rootSeed, saved.id);
            restored.streams.set(saved.id, {
                stream: Stream.fromWords(saved.words, seed, restored.channelMemories),
                explicitSeed: saved.seed,
            });
        }
        restored.channelMemories.restore(state.channels);
        return restored;
    }
}

/**
 * One stream's portion of the state. The explicit seed is written only when
 * there was one: a derived seed is `hash(root seed, id)` and recomputing it is
 * exactly what restore does.
 */
function savedStream(id: StreamId, record: StreamRecord): RandomStreamState {
    const saved: RandomStreamState = { id, words: record.stream.snapshot() };
    if (record.explicitSeed !== undefined) {
        saved.seed = record.explicitSeed;
    }
    return saved;
}

/** Orders saved streams by name. */
function byId(one: RandomStreamState, other: RandomStreamState): number {
    return byName(one.id, other.id);
}

import { streamSeed } from './seed';
import { assertRandomState, RANDOM_STATE_VERSION } from './state';
import { Stream } from './stream';
import type { RandomState, RandomStreamState } from './state';
import type { RandomStream, StreamId } from './types';

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

    constructor(rootSeed: number) {
        this.rootSeed = rootSeed;
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

        const created = Stream.fromSeed(seed ?? streamSeed(this.rootSeed, id));
        this.streams.set(id, { stream: created, explicitSeed: seed });
        return created;
    }

    /**
     * `RND`'s portion of the save (RND-22): the version, the root seed and the
     * position of the streams that were actually requested. A stream nobody
     * asked for is not in here — it is rebuilt from its own name.
     *
     * The streams are written in order of name, so that the same game saved
     * after the same draws produces the same bytes whatever order the streams
     * came into existence in.
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
        };
    }

    /**
     * Rebuilds a service from a saved state.
     *
     * Restore is a **factory, never an instance method** (RND-22): the service
     * this returns is already complete, so there is no instant in which a live
     * service holds the randomness of the wrong game and whoever rolls a die
     * rolls from the previous one.
     */
    static deserialize(state: RandomState): Random {
        assertRandomState(state);

        const restored = new Random(state.rootSeed);
        for (const saved of state.streams) {
            restored.streams.set(saved.id, {
                stream: Stream.fromWords(saved.words),
                explicitSeed: saved.seed,
            });
        }
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

/** Orders saved streams by name, by code unit: no locale, no ambiguity. */
function byId(one: RandomStreamState, other: RandomStreamState): number {
    if (one.id === other.id) {
        return 0;
    }
    return one.id < other.id ? -1 : 1;
}

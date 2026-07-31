import { streamSeed } from './seed';
import { Stream } from './stream';
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

        const created = new Stream(seed ?? streamSeed(this.rootSeed, id));
        this.streams.set(id, { stream: created, explicitSeed: seed });
        return created;
    }
}

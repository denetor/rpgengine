/**
 * Derivation of a stream's seed from the root seed and the stream's id.
 *
 * The function is **FNV-1a/32 over the byte stream (root seed, id), finalized
 * with murmur3's `fmix32`**. That name is part of the stability contract
 * (RND-4, ADR 0001): changing it re-seeds every stream, and therefore
 * invalidates every save and every map generated from a seed.
 *
 * The id is hashed as its UTF-16 code units, low byte first, so that the
 * result is defined for any string and not only for ASCII ids.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const BYTE_MASK = 0xff;

/** The seed of the stream named `id` in the service rooted at `rootSeed`. */
export function streamSeed(rootSeed: number, id: string): number {
    let hash = FNV_OFFSET_BASIS;

    const root = rootSeed | 0;
    for (let shift = 0; shift < 32; shift += 8) {
        hash = hashByte(hash, (root >>> shift) & BYTE_MASK);
    }

    for (let index = 0; index < id.length; index += 1) {
        const codeUnit = id.charCodeAt(index);
        hash = hashByte(hash, codeUnit & BYTE_MASK);
        hash = hashByte(hash, (codeUnit >>> 8) & BYTE_MASK);
    }

    return finalize(hash);
}

/** One FNV-1a round: xor the byte in, then multiply by the FNV prime. */
function hashByte(hash: number, byte: number): number {
    return Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
}

/**
 * murmur3's `fmix32`. FNV-1a alone leaves neighbouring inputs — `'ai'` and
 * `'aj'`, seeds 1 and 2 — with correlated low bits; the avalanche step spreads
 * them across the whole word.
 */
function finalize(hash: number): number {
    let mixed = hash | 0;
    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x85ebca6b);
    mixed ^= mixed >>> 13;
    mixed = Math.imul(mixed, 0xc2b2ae35);
    mixed ^= mixed >>> 16;
    return mixed >>> 0;
}

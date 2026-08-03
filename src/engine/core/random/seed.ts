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

/**
 * The largest value an unsigned 32-bit word can hold.
 *
 * Exported because `state.ts` checks the generator's own words against it, and
 * two copies of a number this specific are two chances to write one of the
 * digits differently.
 */
export const MAX_UINT32 = 4294967295;

/** The smallest value a signed 32-bit word can hold. */
const MIN_INT32 = -2147483648;

/**
 * True for a number that is a seed: a whole number that survives 32 bits read
 * either way — the union of the signed and the unsigned range.
 *
 * A seed is a **bit pattern, not a quantity**. Everything below takes it
 * through `| 0`, so `-1` and `4294967295` name the same seed and both are
 * legitimate. What is not a seed is a number that would *change* under that
 * coercion: `2.5` and `2` would name the same game, and nothing would ever say
 * so.
 */
export function isSeed(value: number): boolean {
    return Number.isInteger(value) && value >= MIN_INT32 && value <= MAX_UINT32;
}

/**
 * Refuses a root seed that is not one, so that a service built on a number
 * which is not a seed does not exist.
 *
 * The failure it prevents is silent by construction: `new Random(2.5)` and
 * `new Random(2)` would play the same game, and a player reporting a bug from
 * the first would be sent a save from the second.
 */
export function assertRootSeed(rootSeed: number): void {
    if (!isSeed(rootSeed)) {
        throw new Error(
            `random service: the root seed '${String(rootSeed)}' is not a whole 32-bit number`,
        );
    }
}

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

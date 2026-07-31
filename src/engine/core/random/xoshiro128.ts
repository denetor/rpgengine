/**
 * `xoshiro128**` — the project's frozen pseudo-random generator (ADR 0001).
 *
 * The state is four 32-bit words, all arithmetic goes through `Math.imul`,
 * shifts and xor. No transcendental function and no `BigInt` appear here: the
 * first would make the sequence engine-dependent, the second would allocate on
 * every draw.
 *
 * Changing this algorithm invalidates every save and every map generated from
 * a seed.
 */

/** Number of 32-bit words in the generator's state. */
export const STATE_WORDS = 4;

/** 2^32, the divisor that maps a 32-bit word onto [0, 1). Exact in a double. */
const UINT32_RANGE = 4294967296;

/** The golden-ratio increment of `splitmix32`, used to expand a single seed. */
const SPLITMIX_INCREMENT = 0x9e3779b9;

/**
 * Builds a generator state from a single 32-bit seed.
 *
 * A `xoshiro128**` state must be filled with well-spread bits — and must never
 * be all zeros, a state the generator can never leave. `splitmix32` gives both:
 * it turns consecutive seeds into unrelated words.
 */
export function stateFromSeed(seed: number): Uint32Array {
    const state = new Uint32Array(STATE_WORDS);
    let counter = seed | 0;
    let allZero = true;
    for (let index = 0; index < STATE_WORDS; index += 1) {
        counter = (counter + SPLITMIX_INCREMENT) | 0;
        const word = splitmix32(counter);
        state[index] = word;
        if (word !== 0) {
            allZero = false;
        }
    }
    if (allZero) {
        state[0] = 1;
    }
    return state;
}

/**
 * Advances the state by one step and returns the drawn 32-bit word.
 *
 * This is the one impure operation of the whole service (RND-17): everything
 * else is a transformation of the values it produces.
 */
export function nextUint32(state: Uint32Array): number {
    const scaled = Math.imul(state[1], 5);
    const rotated = rotateLeft(scaled, 7);
    const result = Math.imul(rotated, 9) >>> 0;

    const shifted = state[1] << 9;
    state[2] ^= state[0];
    state[3] ^= state[1];
    state[1] ^= state[2];
    state[0] ^= state[3];
    state[2] ^= shifted;
    state[3] = rotateLeft(state[3], 11);

    return result;
}

/** Maps a 32-bit word onto [0, 1). The division is by a power of two: exact. */
export function toUnitInterval(word: number): number {
    return word / UINT32_RANGE;
}

/** Rotates a 32-bit word left by `bits` positions. */
function rotateLeft(word: number, bits: number): number {
    return ((word << bits) | (word >>> (32 - bits))) >>> 0;
}

/** The `splitmix32` bit mixer: a 32-bit word in, a well-spread word out. */
function splitmix32(word: number): number {
    let mixed = word | 0;
    mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
    return (mixed ^ (mixed >>> 15)) >>> 0;
}

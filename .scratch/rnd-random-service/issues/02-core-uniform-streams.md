# 02 — Core: deterministic uniform streams

**What to build:** the game's source of randomness, seedable and reproducible. Callers construct the
service with a **root seed**, ask for a **stream** per usage domain (combat, loot, generation, AI)
and draw numbers from it. Two games started with the same seed produce the same sequence; consuming
numbers in one stream does not touch the others; and adding a new stream tomorrow does not change
what the others produce today, because a stream's seed depends on its **name** and not on the order
in which streams come into existence.

The generator and the hash function chosen here are **frozen**: changing them later invalidates
every save and every map generated from a seed. See ADR 0001.

**Blocked by:** 01 — Separate headless test runner.

**Status:** done

- [x] The service is constructed with a root seed and, optionally, some parameters
- [x] The generator is `xoshiro128**`, with 32-bit state and no use of `BigInt`
- [x] A stream's seed is `hash(root seed, id)`; the hash function is chosen, named and documented as
      part of the stability contract
- [x] Callers may pass an explicit seed for a stream, which takes precedence over the derivation
- [x] Asking for the same stream twice returns the **same instance**
- [x] `next`, `int`, `bool`, `pick`, `weighted`, `shuffle` are available
- [x] Two services constructed with the same seed produce identical sequences over 10⁶ draws
- [x] Consuming 1000 values from one stream does not alter another stream's sequence
- [x] Creating a new stream does not alter the sequence of any existing stream
- [x] `next()` and `int()` pass a χ² test on buckets
- [x] No transcendental `Math` function appears in the service's code
- [x] The service imports no other service, does not import `excalibur`, does not read files
- [x] Two services constructed in the same process are independent

## Closing notes

- The service lives in `src/engine/core/random/`, the path REQUIREMENTS §5 gives it, with the folder
  shape that section prescribes. Public surface `index.ts` (ARC-2.1): `Random`,
  `RandomStream`, `StreamId`, `WeightedEntry`. Inside: `xoshiro128.ts` (the generator, the only
  mutable state), `seed.ts` (stream-seed derivation), `transforms.ts` (pure transformations),
  `stream.ts`, `random.ts`.
- **The hash function is now named in ADR 0001**: FNV-1a/32 over the byte stream (root seed, id),
  finalized with murmur3's `fmix32`. The generator's state is expanded from the 32-bit stream seed
  with `splitmix32`. Both are frozen; `seed.ts` and `xoshiro128.ts` say so at the top.
- **The constructor takes the root seed and nothing else.** The ticket allowed "optionally, some
  parameters", but the only parameters foreseen are the filter profiles and the channel cap, which
  belong to 06 and 07. Adding an empty options bag now would be dead code; the signature extends
  additively when those tickets land.
- **An explicit seed that contradicts an existing stream throws.** RND-19 requires `stream(id)` to
  return the memoized instance, which would silently ignore the seed and leave the caller convinced
  they had seeded a sequence they had not. Passing the same seed again, or none, is fine.
- **`weighted` rejects an empty table, a negative or non-finite weight, and a table whose weights
  sum to zero.** An entry of weight zero is legal and never comes up. Fuller parameter validation is
  ticket 10.
- **`shuffle` returns a new array** and consumes one value per element beyond the first; a list of
  fewer than two elements consumes nothing.
- Tests, all through the single seam the spec fixes (a constructed service): `random.spec.ts`
  (determinism, streams, seeds), `stream.spec.ts` (the primitives, including how many values each
  one consumes — RND-18), `distribution.spec.ts` (χ², two-sided at p = 0.001),
  `isolation.spec.ts`.
- **`isolation.spec.ts` reads the service's own sources** — the one place where a test looks at code
  instead of behaviour — because a forbidden `Math.pow` has no observable effect until it runs on
  another engine. Each of its three checks was verified to fail when the violation is injected.
  Ticket 09 replaces it with a lint rule that covers the whole project.
- Not in this ticket, by design: `serialize`/`deserialize` (03), `gaussian` (04), `noise2`/`fbm2`
  (05), `filtered`/`forget`/`channels` (06, 07), golden vectors (08).
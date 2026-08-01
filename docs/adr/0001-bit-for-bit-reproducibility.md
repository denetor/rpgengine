---
status: accepted
---

# Bit-for-bit reproducibility across JavaScript engines

RND-4 and GEN-2 promise that the same game and the same map from a seed stay identical **after a
browser update**. ECMAScript specifies `+ - * /`, `Math.floor`, `Math.sqrt` and `Math.imul` exactly,
but leaves `Math.log`, `Math.cos`, `Math.sin`, `Math.exp` and `Math.pow`
*implementation-approximated*: V8, SpiderMonkey and JavaScriptCore differ in the last bits. We have
therefore forbidden transcendental functions on the entire deterministic path, and chosen the
implementations accordingly.

## What is frozen

1. **PRNG: `xoshiro128**`**, with state in a `Uint32Array` and `Math.imul`, its state expanded from
   a single 32-bit seed with `splitmix32`.
2. **String hash function** that derives stream seeds from (root seed, id): **FNV-1a/32 over the
   byte stream (root seed little-endian, then the id's UTF-16 code units low byte first), finalized
   with murmur3's `fmix32`**. The finalizer is not decoration: FNV-1a alone leaves neighbouring ids
   with correlated low bits.
3. **No transcendental function** on any path that produces values.
4. **The coherent noise construction**: Perlin in 2D over a 256-entry permutation table, shuffled by
   Fisher–Yates from a generator started at the stream's own seed; the eight **unit** gradients (the
   four axes and the four diagonals, the diagonal component written as the literal
   `0.7071067811865476`); the quintic fade `6t⁵ - 15t⁴ + 10t³`; and the output scaled by the literal
   `1.4142135623730951` to fill [-1, 1]. Every one of them decides which value a coordinate gets.

Changing any of the four invalidates every save and every map generated from a seed.

Point 4 deserves a word on what is *not* in it. The permutation table is built from the stream's
seed and never from its current position, and the noise draws nothing (RND-18) — which is what lets
RND-22 keep the table out of the save and rebuild it on restore. Nothing salts or otherwise
re-derives that seed: the fewer frozen constants stand between a seed and a map, the fewer ways there
are to invalidate one by accident.

## Non-obvious consequences

- **No PCG32**, even though RND-4 cited it as an equivalent alternative: it requires 64-bit
  multiplications, which in JavaScript means `BigInt`, which allocates on every operation — against
  ARC-13.3. `xoshiro128**` works at 32 bits and does not allocate.
- **No Box–Muller for the Gaussian**, even though it is the standard method: it uses `Math.log` and
  `Math.cos`. In its place, a **sum of uniforms** (Irwin–Hall: twelve draws minus six, mean 0 and
  σ 1 exactly), which uses additions only. The price is twelve draws per sample and tails truncated
  at ±6σ; none of the uses foreseen by RND-6 — damage variation, spread, jitter — is meaningful
  beyond 6σ.
- **No `Math.pow` in the fBm octaves**: lacunarity is applied by repeated multiplication. Perlin and
  simplex are otherwise already exact, because they use only `*`, `+` and `floor`.
- **No `Math.SQRT2` or `Math.SQRT1_2` in the noise**, even though they are exactly the two numbers it
  needs: ECMAScript specifies those constants only to "approximately" the value it prints, so an
  engine may disagree in the last bit. Decimal literals are parsed to the nearest double by a rule
  the standard *does* pin down, and are the same number everywhere.

This is the reason the ADR exists: a reader who finds a Gaussian built from a sum of uniforms will
think it is a beginner's mistake and will "fix" it by putting Box–Muller back, silently breaking
compatibility with every existing save.

## Verification

The promise cannot be tested on a single engine: two instances with the same seed always agree
in-process. What is needed is a **golden vector** test — expected values stored in the repo for
`next`, `int`, `gaussian`, `noise2` and `fbm2` — run on **chromium, firefox and webkit** with
Playwright, which the project already uses.

## Rejected alternatives

- **Narrowing the guarantee** to the uniform sequence only, leaving the Gaussian non-portable across
  engines. Rejected because a conditional promise sooner or later gets used where it does not hold.
- **Implementing `log` and `cos` in-house** with fixed polynomials, so as to keep Box–Muller.
  Rejected because it means writing and testing a maths library for a gain that is not needed here.

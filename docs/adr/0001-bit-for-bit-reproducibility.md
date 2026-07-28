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

1. **PRNG: `xoshiro128**`**, with state in a `Uint32Array` and `Math.imul`.
2. **String hash function** that derives stream seeds from (root seed, id).
3. **No transcendental function** on any path that produces values.

Changing any of the three invalidates every save and every map generated from a seed.

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

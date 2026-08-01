# 04 — Gaussian source

**What to build:** the systems that vary a quantity around a central value — damage variation, shot
spread, wait jitter, NPC inaccuracy — need results that **cluster** around the nominal value rather
than being flat. Callers ask for a Gaussian given a mean and a standard deviation, and may truncate
it to an interval so that a variation never produces an absurd value.

The implementation is a **sum of uniforms** (twelve draws minus six: mean 0 and σ 1 exactly), not
Box–Muller, which would use `Math.log` and `Math.cos` — functions that ECMAScript does not specify
exactly and that would break reproducibility across engines. Whoever reads the code will think it is
a beginner's mistake: the pointer to ADR 0001 must be in the code, not only in this ticket.

**Blocked by:** 02 — Core: deterministic uniform streams.

**Status:** done

- [x] The Gaussian accepts a mean, a standard deviation and an optional truncation
- [x] The implementation uses no transcendental function
- [x] Over 10⁵ samples, the sample mean and standard deviation fall within the declared tolerance
- [x] Truncation does not shift the mean beyond the declared limit
- [x] No sample falls beyond ±6σ, and this is documented as an accepted consequence of the method
- [x] Every call consumes a fixed, documented number of draws from the stream
- [x] The code points to ADR 0001 at the spot where the choice would look like a mistake

## Closing notes

- `gaussian(mean, stdDev, clamp?)` on `RandomStream`. The transformation is `toGaussian` in
  `transforms.ts` — pure, twelve uniforms in, one value out (RND-17) — with `GAUSSIAN_DRAWS = 12`
  named once so the stream draws exactly what the transformation consumes. The **tests spell out
  12 and 24 as literals on purpose**: the consumption count is the contract (RND-18), and a test
  that read the constant back would follow it silently wherever it went.
- The truncation interval has a name, `Truncation`, exported with the rest of the public surface.
  It stays a pair rather than a `{ low, high }` object because that is the shape the contract sheet
  fixes; naming it writes "low bound first" down once instead of at four signatures.
  Parameters are checked by `assertGaussian` **before** the first draw, like `diceRoll`: a refused
  call leaves the stream exactly where it was (RND-18), and a test pins it.
- **Truncation clamps, it does not redraw.** A redraw loop would consume a variable number of
  values and shift every later draw of the stream, so the same seed would produce a different game
  depending on how the tails happened to fall. The consequence is deliberate and tested: the bounds
  are *reached* rather than avoided, and a one-sided interval shifts the mean towards itself — that
  is what the caller asked for. A symmetric interval leaves the mean where it was and only narrows
  the spread.
- **The measured shape.** Mean and σ hold to within 0.05 over 10⁵ samples. Within ±1σ the method
  puts ≈0.679 of its samples against a true normal's 0.6827: the sum of twelve uniforms has excess
  kurtosis −0.1, so it is marginally flatter at the shoulders. The first version of the test
  asserted the normal figure and failed — the tolerance was wrong, not the code. The deviation is
  the same accepted family as the ±6σ tails and is now written down in the test.
- **The ADR pointer sits on `toGaussian`**, where a reader would otherwise "fix" the sum of uniforms
  back into Box–Muller. It names the logarithm and the cosine **in prose, not as `Math` tokens**:
  `isolation.spec.ts` scans the sources by substring and cannot tell a comment from a call, so
  spelling them out made the guard fail. Ticket 09's AST-based lint rule removes that constraint,
  and the comment can be made literal then.
- No change to the serialized state: a Gaussian is twelve ordinary draws, so issue 03's format
  already carries the position it leaves the stream in.

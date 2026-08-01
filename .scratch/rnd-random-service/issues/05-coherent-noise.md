# 05 — Coherent noise and fBm

**What to build:** procedural generation needs values that vary **gradually** from one cell to the
next — elevation, biomes, resource density — and not independent randomness per cell, which would
produce grainy noise instead of terrain. Callers sample the noise in 2D and can sum several octaves
to obtain detail at multiple scales.

The property that matters most of all: the noise depends **only** on the seed and the coordinates,
never on the sampling order. Cells can be sampled in any order, and a portion can be regenerated,
always yielding the same result.

**Blocked by:** 02 — Core: deterministic uniform streams.

**Status:** done

- [x] 2D sampling returns continuous values within the declared interval
- [x] Several octaves can be summed, with configurable lacunarity and persistence
- [x] Lacunarity is applied by repeated multiplication, never with `Math.pow`
- [x] The permutation table is built **exactly once**, from the stream, when the stream is created
- [x] Sampling the noise does **not** advance the stream's state: the numbers drawn before and after
      a million samplings form the same sequence
- [x] The same seed and the same coordinates always give the same value, in whatever order they are
      sampled
- [x] Nearby samples differ within a declared bound (continuity)
- [x] No transcendental function appears in the implementation

## Closing notes

- `noise2(x, y, options?)` and `fbm2(x, y, octaves, options?)` on `RandomStream`. The algorithm is
  **Perlin**, in `noise.ts` — pure throughout (RND-17): a permutation table and two coordinates in,
  one value out. Nothing in that file reads or writes a generator state.
- **The permutation table is built from the stream's seed, on a copy of the generator.** The ticket
  says "from the stream, when the stream is created"; RND-22 says the table is "rebuilt from the
  stream's seed" and stays out of the save. Shuffling with a generator started at the stream's own
  seed satisfies both: it is the stream's own opening words, taken from a copy, so the stream itself
  never moves — and a restored stream, which sits in the middle of its sequence, can still rebuild
  the table from the seed alone. `Stream`'s two factories therefore take the seed as well as the
  position, and `Random.deserialize` recomputes `hash(root seed, id)` for the streams that had no
  explicit one.
  - An earlier version salted that seed, so the shuffle would not walk the very words the stream was
    about to hand out. Reverted: the salt bought nothing observable and cost a fourth constant
    between a seed and a map, each one a way to invalidate every save by accident. The reasoning is
    now written into ADR 0001's point 4 rather than into a constant.
- **`FbmOptions` is a separate type from `NoiseOptions`**, a deviation from the sheet, which named
  one bag for both. `noise2` has no octaves to spread a `persistence` over, and a bag that silently
  ignores half of what it is given is a trap; splitting them makes the compiler say so. **The sheet
  was amended**, not just this ticket: `docs/services/random.md` is the contract, `.scratch` is not.
- **Unit gradients, not the textbook `(±1, ±1)`.** The usual gradient set makes the diagonals √2
  longer than the axes, which shows up as a diamond bias in generated terrain. The eight unit vectors
  bound the raw noise at √½, so it is scaled by √2 to fill the declared [-1, 1] — measured over
  90,000 samples it reaches -0.93 and +0.88. `Math.SQRT2` and `Math.SQRT1_2` are written out as
  decimal literals: ECMAScript specifies those constants only "approximately", while it does pin down
  how a decimal literal is parsed. ADR 0001 now names the whole construction as frozen.
- **`fbm2` divides by the total of the amplitudes**, so the declared interval holds for any octave
  count, and a single octave is exactly `noise2` — a test pins that equality.
  - One way it did *not* hold: enough octaves of a large enough lacunarity push the frequency past
    the largest double, and an infinite coordinate makes the lattice cell — and the sample — `NaN`,
    silently, from inside a method that promises [-1, 1]. `assertFbm2` now walks the frequency
    progression with the same repeated multiplication the sum uses, and refuses up front.
- **The continuity bound is declared and exported**: `NOISE_MAX_SLOPE = 4`, the largest change per
  unit of noise space — what a caller needs in order to pick a sampling step.
  - It is a **ceiling with room to spare, not the largest value measured**. A sweep of 200 tables
    over lines and cell interiors finds 2.84 at the worst; a crude analytic bound on the two terms
    (a fade derivative of 15/8, plus the corner gradients) gives about 9. The first version declared
    3.2 from 2.76 measured along a single walk of a single seed, and the guarding test then walked
    that same line — a bound that confirms itself, with 13% of margin against seeds nobody had tried.
    The test now sweeps 40 tables over both a line and cell interiors.
- **The prose in `noise.ts` names the forbidden functions in words, not as `Math` tokens**, the same
  constraint ticket 04 hit: `isolation.spec.ts` scans by substring and cannot tell a comment from a
  call. The first version failed on its own explanation of why `Math.pow` is banned. Ticket 09's
  lint rule lifts this.
- The noise **tiles with period 256** at frequency 1, the size of the permutation table. Written down
  at `perlin2`; far beyond any map GEN asks for, and the alternative is a hash per lattice corner on
  every sample.
- **The defaults are filled in once, in `Stream`**, and settled numbers travel onwards to both the
  check and the sample. The first version had `frequencyOf`/`lacunarityOf`/`persistenceOf` re-read
  the options bag inside the assert *and* inside the sampler — twice per sample, on a path the sheet
  sizes at 10⁶ samples per generated map. `perlin2` also takes the frequency and applies it itself,
  so the one scaling lives in one place and `fbm2` can hand each octave its own.
- **`buildPermutation` shuffles through `toShuffle`**, the same Fisher–Yates the rest of the service
  already uses, rather than repeating the swap loop. It runs once per stream, so the array it costs
  is paid once.
- **No change to the serialized state.** The table is not in the save and sampling moves nothing, so
  issue 03's format carries everything it did before — `noise.spec.ts` asserts both, including that
  the saved JSON mentions no table.
- **Parameter checks are in, though ticket 10 owns validation**: `noise2` and `fbm2` follow the
  `diceRoll`/`gaussian` idiom of an `assert*` before the work. Sampling consumes nothing, so a refused
  call cannot shift the sequence — the check is there because a `NaN` coordinate would otherwise
  travel silently into a whole map of `NaN` cells. Ticket 10 may widen it; it will not have to add it.
- Not in this ticket, by design: `filtered`/`forget`/`channels` (06, 07), the cross-engine golden
  vectors for `noise2` and `fbm2` (08), the lint rule (09), fuller parameter validation (10).

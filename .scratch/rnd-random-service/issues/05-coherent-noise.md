# 05 — Coherent noise and fBm

**What to build:** procedural generation needs values that vary **gradually** from one cell to the
next — elevation, biomes, resource density — and not independent randomness per cell, which would
produce grainy noise instead of terrain. Callers sample the noise in 2D and can sum several octaves
to obtain detail at multiple scales.

The property that matters most of all: the noise depends **only** on the seed and the coordinates,
never on the sampling order. Cells can be sampled in any order, and a portion can be regenerated,
always yielding the same result.

**Blocked by:** 02 — Core: deterministic uniform streams.

**Status:** ready-for-agent

- [ ] 2D sampling returns continuous values within the declared interval
- [ ] Several octaves can be summed, with configurable lacunarity and persistence
- [ ] Lacunarity is applied by repeated multiplication, never with `Math.pow`
- [ ] The permutation table is built **exactly once**, from the stream, when the stream is created
- [ ] Sampling the noise does **not** advance the stream's state: the numbers drawn before and after
      a million samplings form the same sequence
- [ ] The same seed and the same coordinates always give the same value, in whatever order they are
      sampled
- [ ] Nearby samples differ within a declared bound (continuity)
- [ ] No transcendental function appears in the implementation

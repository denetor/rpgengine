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

**Status:** ready-for-agent

- [ ] The Gaussian accepts a mean, a standard deviation and an optional truncation
- [ ] The implementation uses no transcendental function
- [ ] Over 10⁵ samples, the sample mean and standard deviation fall within the declared tolerance
- [ ] Truncation does not shift the mean beyond the declared limit
- [ ] No sample falls beyond ±6σ, and this is documented as an accepted consequence of the method
- [ ] Every call consumes a fixed, documented number of draws from the stream
- [ ] The code points to ADR 0001 at the spot where the choice would look like a mistake

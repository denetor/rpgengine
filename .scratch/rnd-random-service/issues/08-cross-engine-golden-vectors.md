# 08 — Golden vectors across multiple JavaScript engines

**What to build:** the service promises that a browser update will not change games, and that a map
generated from a seed will be the same map tomorrow. Today nothing tests that promise: "two
instances with the same seed produce the same sequence" runs on a single engine and always passes,
whatever the implementation does. Reproducibility **across engines** is not observable from a single
engine.

When this ticket is done, a list of expected values, versioned in the repository, runs inside three
real engines. If someone swaps the generator, puts Box–Muller back in place of the sum of uniforms,
or reintroduces a transcendental function, the test fails — which is exactly its job.

In the current integration configuration, firefox and webkit are **commented out** and only chromium
runs: as long as they stay that way, a cross-engine test would pass without proving anything, which
is worse than not having it, because it looks like a check.

**Blocked by:** 02 — Core · 04 — Gaussian source · 05 — Coherent noise and fBm.

**Status:** ready-for-agent

- [ ] Firefox and webkit are enabled in the integration test configuration
- [ ] A test page exists that runs the vectors inside the browser and exposes the result
- [ ] The expected values are versioned in the repository and cover uniform draw, integer, Gaussian,
      2D noise and fBm
- [ ] The vectors are verified on chromium, firefox and webkit
- [ ] Changing the generator, the Gaussian method or the hash function makes the test fail
- [ ] How to regenerate the vectors is documented, along with the fact that regenerating them is a
      decision that invalidates saves
- [ ] The existing visual snapshot keeps passing; if a per-engine snapshot is needed, that is
      explicit and not a side effect

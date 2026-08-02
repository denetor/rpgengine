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

**Status:** done

- [x] Firefox and webkit are enabled in the integration test configuration
- [x] A test page exists that runs the vectors inside the browser and exposes the result
- [x] The expected values are versioned in the repository and cover uniform draw, integer, Gaussian,
      2D noise and fBm
- [x] The vectors are verified on chromium, firefox and webkit
- [x] Changing the generator, the Gaussian method or the hash function makes the test fail
- [x] How to regenerate the vectors is documented, along with the fact that regenerating them is a
      decision that invalidates saves
- [x] The existing visual snapshot keeps passing; if a per-engine snapshot is needed, that is
      explicit and not a side effect
      — **with a correction to the premise**: the snapshot does not pass in this container, and did
      not before this work either (ticket 01 recorded the renderer mismatch). It is *unchanged* by
      this ticket — same project name, same baseline file, same failure, verified by re-running it
      with the change stashed — and per-engine snapshots stay an explicit decision rather than a
      side effect, which is what the criterion is for.

## Closing notes

- **One measurement, taken in four places.** `golden.ts` holds `measureGolden` (run the plan, return
  what this engine produced) and `goldenMismatches` (compare, and say what moved). Node reaches it
  through `golden.spec.ts`, and chromium, firefox and webkit through
  `tests-browser/golden-vectors.html`. A second implementation for the browser would have tested the
  second implementation.
- **The vectors are exported from `index.ts`.** ARC-2.1 gives a service one door, and the page is
  outside the service, so the alternative was to reach past the door. The spec anticipated this — "a
  second entry point remains unavoidable for RND-4" — and the export is documented as what it is:
  test scaffolding, not a primitive, and nothing in the game may call it. It also matches how this
  module already treats its own door: every spec here imports from `./index`, not from the file it is
  testing. The door was then narrowed to the four names that have a caller — `GoldenPlan` and
  `GoldenVectorName` were exported and used by nobody, and are reachable through `GoldenFile`
  anyway.
- **The plan travels with the numbers**, as `filter-golden.json` established: root seed, stream
  names, the parameters of each primitive and the points the noise is sampled at, so a diff on the
  values is read next to what produced them. The **stream names are part of the pinned contract** —
  a stream's seed is `hash(root seed, name)` — which is how the seed hash gets covered by vectors
  that never call it directly.
- **One stream per vector**, so that changing how many values `next` takes does not silently move
  `int` and `gaussian` underneath it.
- **`(0, 0)` was removed from the sample points.** Perlin noise is exactly zero on the lattice, so
  that point was pinning a value a thoroughly broken implementation would also produce.
- **The browser reports what it measured, not just that it was happy.** `checked` and `values` are in
  the report and asserted against the file, because vacuity is how a golden vector fails: an empty
  measurement matches an empty expectation and finds nothing wrong. The page's placeholder text says
  the script has not run, and `pageerror` is collected before navigation, so an engine that throws
  fails rather than reporting silence.
- **Regeneration is `npm run golden:update`**, which writes the measured values back and returns them
  as the expectation for that run. Two guards on the obvious danger — with the variable set, the
  check proves nothing: it is **refused outright when `CI` is set**, and the version in the file is
  deliberately *not* bumped by the tool, so whoever regenerates has to touch the file and say why.
  The pattern, and its danger, are Playwright's `--update-snapshots`, already used here.
- **Two web servers now**, and the second one is the price of the build's shape: `vite build` emits a
  single UMD bundle, and UMD cannot hold a second entry point, so the vector page is served from
  source by the dev server on port 5174, while the visual snapshot keeps photographing the built site
  on port 4173. Nothing of the page ships.
- **The visual snapshot stays on chromium**, by an explicit `testMatch` rather than by omission, and
  its project keeps the name `chromium` because the committed baselines are named after it. Firefox
  and webkit are enabled — they run the vectors. Per-engine baselines remain a separate decision.
- **The vectors were checked for teeth.** Rotating the generator by 6 instead of 7 fails them;
  changing the FNV prime in the seed hash fails them; replacing the sum of uniforms with Box–Muller
  fails them, as does summing eight uniforms instead of twelve. The generator mutation was also run
  through all three browsers, which failed together — so the page is not reporting success out of
  politeness.
  - One mutation that did **not** fail: summing the twelve uniforms in reverse. Floating-point
    addition is not associative in general, but for these particular values it is exact either way.
    Worth writing down rather than fixing: the vectors pin the values the service produces, not the
    order of a summation that happens not to matter here.
- **`tsconfig.json` now covers `tests/`, `tests-browser/` and `playwright.config.ts`.** The
  Playwright specs were never typechecked; ticket 01 established that a type error in a test is an
  error, and this ticket added a browser entry point that would otherwise have been checked by
  nothing at all.
- **The visual snapshot still fails in this container, exactly as it did before this work**: ~0.01 of
  the pixels differ against the committed baseline, which ticket 01 already recorded as a renderer
  mismatch between the image in the repository and this container. Verified by running it with the
  change stashed: same failure, same baseline file. It is not touched here, and the pixel count
  wanders between runs because the page is animating.
- **New normative text in the sheet**, listed here so it is reviewable rather than smuggled in
  alongside the code: RND-4 gains the requirement for versioned golden vectors checked on more than
  one engine, exact equality rather than tolerance, and regeneration as a deliberate act that CI may
  not perform.
- Not in this ticket, by design: the lint rule that would catch a transcendental function *before* it
  reaches an engine (09), and fuller parameter validation (10). The vectors catch the same mistake
  afterwards, on three engines — which is the safety net, not the fence.

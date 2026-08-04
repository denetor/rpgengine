# 02 — Three-layer layout

**What to build:** `src/` takes the shape the requirements describe — `engine/`, `game/`,
`presentation/`, with one-way dependencies (ARC-1.1) — instead of the Excalibur template sitting at
the root beside the one real service. Nothing gains behaviour in this ticket. It is the prefactor
that makes the two after it possible: the boundary rules of ARC-14 are statements about the folder a
file lives in, and they cannot be written against directories that do not exist.

The template's level and player move into a `sandbox` scene under the presentation's testbed; the
level's class is renamed after the scene, because the starter project's name describes nothing.
Resource loading moves **unchanged**: §7.1 states that assets go through Excalibur's own loader until
`AST` arrives at step 16, and reworking it here would make this ticket something other than a
relocation.

Exactly one file stays at the root: the browser entry point. That is a declared hole in the boundary
check — a file in no layer is in no rule — and it is kept small enough to audit by eye. The page
stylesheet and the ambient declaration files also stay, and are **not** holes: they import nothing
and can violate nothing.

The old demo script that drove the randomness service is **deleted**, its committed compilation with
it. It is the third thing in the project that belonged to no layer, the word *testbed* is needed for
the scenes, and Node 24 runs TypeScript directly, so the compiled artifact answers a question nobody
asks any more.

Two adjustments follow from the move and belong here rather than to a later cleanup. The determinism
zones of ADR 0001 currently name a directory that this ticket deletes: the deterministic path becomes
the engine, the game and the golden-vector page, and **the presentation is out, testbed scenes
included** — a scene produces pixels, not values a seed must reproduce, and the scenes of step 8
will draw circles. The zone probes are retargeted accordingly, including a new one asserting that a
testbed scene falls *outside* the deterministic path, which is what makes that decision deliberate
rather than a side effect of moving a folder.

The measure of success is the committed screenshot: every file moves and the visual snapshot still
matches, unregenerated. If it does not, this ticket did more than it declared.

**Blocked by:** None — can start immediately (independent of 01).

**Status:** ready-for-agent

- [ ] `src/` holds `engine/`, `game/` and `presentation/`, and the service family level inside the
      engine is preserved
- [ ] The browser entry point is the only importing file left at the root
- [ ] The template's scene and player live in a `sandbox` scene folder under the presentation's
      testbed directory, and the scene class is named after the scene
- [ ] Asset loading is moved without being rewritten
- [ ] The old randomness demo script and its committed `.js` are gone, and the linter no longer
      carries a rule to ignore them
- [ ] The deterministic path covers the engine, the game and the vector page, and no longer names a
      directory that does not exist
- [ ] A zone probe asserts that a testbed scene is outside the deterministic path
- [ ] The zone probes no longer reference the deleted script
- [ ] `docs/REQUIREMENTS.md` no longer lists that script as step 0's testbed, and its step 1
      paragraph names the scenes layout actually built
- [ ] Lint, typecheck and the headless suite pass
- [ ] The Playwright visual snapshot passes **without being regenerated**
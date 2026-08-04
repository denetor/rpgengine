# Grill log — Step 1: three-layer layout + boundary check (ARC-14)

**Date:** 2026-08-05
**Subject:** `docs/REQUIREMENTS.md` §7.2, step 1 — the only step with no service in it.
**Status:** decisions agreed, nothing built. Tickets not yet written.

What §7.2 already fixed, and was therefore not up for discussion: the template moves under
`presentation/`, `game/bootstrap.ts` is opened, a scene registry selected by query string appears,
the testbed scene is `sandbox`, and rules 1…6 of ARC-14.2 must fail the build. This log records the
twelve decisions the document leaves open.

---

## 1 — Shape of the tree

**Decided:** entry point stays at the root, everything else under the three layers. `core/` stays as
a family level inside `engine/`, mirroring the catalogue families of §4.

```
src/main.ts                                  ← three lines: startGame() + boot()
src/style.css, files.d.ts, vite-env.d.ts     ← page shell and ambient types
src/engine/core/random/
src/game/bootstrap.ts
src/presentation/resources.ts
src/presentation/scenes/                     ← the game's own scenes (step 16 onwards)
src/presentation/scenes/testbed/sandbox/
```

**Why:** the ARC-14 rules are expressed on folder paths, so a file at the root falls in no zone and
is unchecked by construction. Keeping the entry point at the root leaves **exactly one** such file,
reduced to three lines that can be read at a glance — a declared, inspectable cost. Putting the
entry inside `presentation/` closes that hole but makes the Vite entry point indistinguishable from
presentation code, a distinction `eslint.config.mjs` already draws for the determinism zones.

A correction made later in the session: `style.css` and the two `.d.ts` files are **not** holes. A
stylesheet linked from `index.html` and two declaration files with no imports cannot violate a
boundary. The hole count is one, not four.

## 2 — The old `src/testbed/random/`

**Decided:** deleted, compiled `.js` included.

Considered and rejected: moving it outside `src/` as a demo script (keeps the artifact §7.2 names as
step 0's testbed), and promoting it to a scene (reopens a closed step inside a step that should only
move folders).

**Consequences to carry into the tickets:**
- `docs/REQUIREMENTS.md:610` still lists *(script)* as step 0's testbed. Stale.
- `tests-headless/lint.spec.ts:205` uses that path as a zone probe. Must be retargeted.
- The `ignores` entry for `src/testbed/**/*.js` in `eslint.config.mjs` goes away with the file.

## 3 — Determinism zones after the move

**Decided:** the presentation is **out** of the deterministic path, testbed scenes included. The
deterministic path is `engine/` + `game/` + the golden-vector page under `tests-browser/`.

**Why:** the deterministic path is where values a seed or a save must reproduce are born; a scene
produces pixels. Testbed scenes from step 5 onwards will draw — step 8 asks literally for radius
queries drawn over entities, i.e. circles, i.e. `Math.cos`. A nested exception keeping
`presentation/scenes/testbed/**` inside the zone would be free to write today and would be
unblocked at step 8 by editing the linter config under pressure, which is how a rule stops being a
rule.

**What this gives up, stated plainly:** the linter no longer stops game logic written inside a
testbed scene. Neither would the nested exception — it forbids `Math.cos`, not misplaced rules.
That guard is the boundary check and the definition of done, not ADR 0001.

**Consequence:** `lint.spec.ts` gains a probe asserting that a testbed scene falls *outside* the
deterministic zone, which is what makes this decision intentional rather than accidental.

## 4 — `game/bootstrap.ts` at step 1

**Decided:** the file is created now, with the real seam in it: `startGame()` returns an object,
`main.ts` passes it to the presentation, and the scene receives it.

**Why:** the point is not to start anything today, it is that a scene takes the game's state **as a
parameter** from the first line written. If `main.ts` builds the scene directly and step 3 inserts a
context, that is a signature change to every scene already written — the same failure
`docs/previous-version/ASSESSMENT-REPORT.md` documents for rendering. The returned object (rather
than `void`) is what keeps ARC-8.3 — two independent games in one process — testable later.

A placeholder file with nothing in it was rejected: a file that declares a frontier and holds
nothing teaches that frontiers are decorative.

**Naming, corrected in 12a:** it returns a **`GameContext`**, not a "session". Today an empty type
with `dispose()`; at step 3 it fills up and moves into the `CTX` service. One word from day one.

## 5 — The scene registry

**Decided, three parts:**

- **5a** — `main.ts` stays three lines; query-string parsing, the registry and the engine start live
  inside `presentation/`. Nothing that can be checked is left in the file that cannot be.
- **5b** — no query string → `sandbox`; unknown name → **visible error listing the valid names**.
  A silent fallback means that at step 5, when `?scene=map` fails to start, you see the template and
  conclude the map is broken.
- **5c** — **explicit registry** in `scenes/registry.ts`, not `import.meta.glob`. A file that states
  which scenes exist can be read and diffed and owes nothing to the bundler. Accepted cost: every
  scene is bundled, and a compile error in one breaks them all — acceptable for a testbed.

## 6 — The rest of the template

**Decided:** `level.ts` + `player.ts` → `presentation/scenes/testbed/sandbox/`, with `MyLevel`
renamed `SandboxScene`. `resources.ts` → `presentation/resources.ts`, **untouched**: §7.1 says asset
loading goes through Excalibur's own `Loader` until `AST` arrives at step 16. `index.html` and
`public/images/` unchanged.

**Convention:** one folder per scene, holding the scene file and whatever is private to it. **No
`index.ts` per scene** — in this project `index.ts` means "a service's public surface" (ARC-2.1),
and using it for anything else dilutes the convention.

**Clarified by the user:** `scenes/` holds the game's own scenes; `scenes/testbed/` holds only the
scenes used during development to try out a system or a technique.

## 7 — The testbed ships in the production build

**Decided:** yes, always. One registry, `?scene=` works in production.

**Why:** the testbed was described as part of what ships with the engine, and the alternative
introduces the one thing worse than a broken scene — a scene that exists in only one of the two
build modes.

## 8 — Which tool enforces the six rules

**Decided:** `dependency-cruiser`, all six, as a command of its own alongside `npm run lint`.

**Why:** rules 1…5 forbid *edges* of the import graph; rule 6 forbids *cycles*, a property of the
whole graph. ESLint sees one file at a time and has no graph — a plugin rebuilds one by hand, which
is why `import/no-cycle` is the slowest rule in the ecosystem. Second reason: core
`no-restricted-imports` matches the **string written in the import**, so the rule 4 violation
`'../../../game/loot/table'` has to be guessed at with a pattern counting `../`; dependency-cruiser
resolves the import to a real path from the project root and matches a regex against it, so the rule
says what it means.

Splitting the rules across two tools was rejected outright: two places to look when a build fails.
Keeping everything in ESLint (`eslint-plugin-import-x`) was judged defensible — the existing test
harness would extend unchanged — but pays with `import/no-cycle` over the whole project on every
lint.

**Configuration note agreed in advance:** `tsPreCompilationDeps: true`. Without it an
`import type { … }` across a frontier is invisible to the tool, and a type-only import upward is
exactly how a domain starts to know the layer above it.

**Side effect worth keeping:** ESLint remains what it is today — the keeper of ADR 0001 and nothing
else, a property the file itself claims.

## 9 — May `presentation/` reach `engine/` directly?

**Decided:** yes, always through the service's `index.ts` (rule 2).

**Why:** with strict layering, every testbed scene would need a module in `game/` written for no
reason other than to let it through — code belonging to this game, created to satisfy the linter.
§7.2 asks for the opposite: the scene proves that **the presentation** can drive the service without
violating ARC-1. The separation that matters still holds, because the direction stays one-way. What
strict layering would really protect — that this game's rules do not end up inside scenes — is not
an import rule; it is point 3 of the definition of done.

**Consequence:** ARC-14.2 gains an explicit note. Today the document is silent, and silence reads as
a prohibition.

## 10 — How the boundary check itself is verified

**Decided, three parts, one spec file (`boundaries.spec.ts`):**

1. **Rules in a shared module**, parametric on the root: `boundaryRules({ root })`, used by the real
   configuration (`src/`) and by the fixture configuration
   (`tests-headless/fixtures/boundaries/src`). This is why `eslint.determinism.mjs` exists as a
   separate file: two copies drift, and the test would then certify rules that are no longer the
   ones applied.
2. **Six deliberate violations plus the legal cases.** Violations: `excalibur` under `engine/`; a
   service internal imported instead of its `index.ts`; a service importing another service;
   `engine/`→`game/`; `game/`→`presentation/`; a cycle. Legal cases that **must** pass:
   `presentation/`→ a service's `index.ts` (decision 9), an internal import *within* a service, and
   a co-located spec importing its own internals. Without those, the first over-broad rule blocks
   the project and no test notices.
3. **Assertions about the zones, not about today's file inventory** — the half of `lint.spec.ts`
   that turned out to matter more than the other. The real configuration's regexes are applied to a
   table of representative paths, which need not exist. A test that only runs over the files present
   today stays green on a project whose frontiers have moved.

**Declared cost:** the fixture tree is a mock project of ~12 tiny files, to be excluded from `tsc`
and from the real lint, as `fixtures/lint/` already is.

## 11 — Pipeline and CI

**Decided:**

- **11a** — `"boundaries": "depcruise src"` as a first-class command, invoked from `build`
  (`lint && boundaries && tsc && vite build`, ARC-14.3 to the letter) **and** from `test:unit`, the
  fast loop where a developer notices in time. The real project is checked by the command, once, in
  one place; the spec covers the fixtures.
- **11b** — **CI arrives now**: a minimal GitHub Actions workflow running `npm ci && npm run
  test:unit` on **push to `master` and on pull requests**. Playwright is **not** covered — it would
  want browsers installed in CI — and is declared excluded rather than quietly forgotten.

**Why now:** this is the step whose entire subject is ARC-14, and ARC-14.1 asks for the check to run
in CI, "not by discipline alone". A check that only holds on the machine of whoever wrote it holds
as long as that person remembers it. Ticket 09 of the random service left this open as a
project-wide decision; this is where it gets taken.

**Declared cost:** `npm ci` in CI, a `package-lock.json` that must stay honest, and a second thing
that can fail for reasons of its own.

## 12 — The documentary trail

- **12a — glossary.** Two new entries in `CONTEXT.md` §Architecture: **Scene** (the presentation
  unit Excalibur activates one at a time; lives only in `presentation/`) and **Testbed** (the set of
  development scenes under `scenes/testbed/`, reachable with `?scene=`, shipped with the game). **No
  entry for "boundary"**: ARC-14 defines it already, and `CONTEXT.md` is a glossary, not a second
  home for requirements. The value returned by `startGame()` is a `GameContext` — see decision 4.
- **12b — `docs/REQUIREMENTS.md`.** Three edits: the step 0 row can no longer point at *(script)*;
  the step 1 paragraph says `src/presentation/testbed/` and must be aligned to `scenes/testbed/`;
  ARC-14.2 gains the note from decision 9.
- **12c — ADR.** One: **ADR-0004, "the presentation reaches the services without going through
  `game/`"**. It passes all three filters — hard to reverse (fifteen scenes later, going back is a
  facade to write), surprising to a reader who has read "presentation → game → engine", and the
  result of a real alternative. **No ADR for the choice of `dependency-cruiser`**: it would be
  rewritten in a day, so it is not hard to reverse; the rationale belongs at the head of the
  configuration file, where whoever edits it will actually read it — as `eslint.config.mjs` already
  does.
- **12d — tickets**, in `.scratch/layout-and-boundaries/issues/`, same format as the nine of the
  random service:
  - **01 — Three-layer layout**: the moves, the deletion, the rename, the determinism zones and the
    `lint.spec.ts` probes realigned. Closes with everything green and no new behaviour.
  - **02 — `bootstrap` and the scene registry**: `startGame(): GameContext`, `boot(context)`, query
    string, `sandbox`, a speaking error on an unknown name.
  - **03 — Boundary check**: `dependency-cruiser`, the six rules, the shared module, the fixture
    tree, `boundaries.spec.ts`, the npm scripts and the GitHub Actions workflow.

  01 blocks both 02 and 03 — the rules cannot be configured against folders that do not exist.

---

## Open points, to settle inside the tickets

- **Rule 2's exact scope.** Services live at `engine/<family>/<service>/`; modules under `game/` are
  not services and ARC-2.1 does not reach them. The regex must say so. Not discussed in this
  session.
- **The Playwright snapshot** in `tests/main.spec.ts-snapshots`. Moving files and renaming the scene
  class should not change a single pixel, so the snapshot should survive untouched — but it is the
  kind of thing that is confirmed by running it, not by reasoning about it.
- **ARC-14.1 is satisfied in part.** The workflow covers the unit lane; the integration suite still
  runs only on demand, locally.
- **The definition of done for a step applies at half strength here.** Points 3 and 4 — the service
  sheet promoted to `implemented`, and the `GameContext` extended — have no subject: this step
  contains no service. Points 1 and 2 stand.

## What was not touched

This session produced this log and nothing else. `CONTEXT.md`, `docs/REQUIREMENTS.md`, `docs/adr/`,
the tickets and the code are all unchanged, and no commit was made.
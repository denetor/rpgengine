# Spec — Three-layer layout and the boundary check

**Step:** 1 of the development order (§7.2) · **Requirements:** ARC-14, ARC-1, ARC-2.1, ARC-8.3
**New ADR:** `0004` — the presentation reaches the services without going through `game/`
**Grill log:** [`.scratch/layout-and-boundaries/grill-log.md`](../../.scratch/layout-and-boundaries/grill-log.md)

## Problem Statement

`src/` does not have the shape the requirements describe. The Excalibur template still sits at the
root — the engine entry point, a level, a player, a resource loader — next to the one real service,
and a demo script that drives that service lives in a third place belonging to neither world. The
three layers ARC-1.1 names (`presentation → game → engine`) exist as a sentence in a document and as
one directory out of three on disk.

Four consequences, each of which gets more expensive with every file added:

1. **The boundary check cannot be configured.** ARC-14 forbids six kinds of import, and every one of
   them is expressed as a statement about the folder a file lives in. Rules about `game/` and
   `presentation/` cannot be written against directories that do not exist, so the strongest
   architectural guarantee in the requirements is currently unenforceable — not neglected,
   *impossible*.
2. **Nothing separates the layers but memory.** ARC-14.1 says exactly why this is not enough: a
   boundary held by discipline is held for as long as the person holding it remembers. Today
   nothing would report a service importing `excalibur`, an engine file reaching up into the game,
   or an import cycle.
3. **There is nowhere to put a testbed scene.** §7.2 asks every step from here on to end in a scene
   that drives the new service through the presentation. There is no registry of such scenes, no way
   to select one, and no seam through which a scene would receive the game's state.
4. **The move costs more later.** It is a pure relocation today, with one service and seven template
   files. After ten steps it is a relocation across ten services, their sheets, their specs and their
   scenes — and the imports that will have grown in the meantime are exactly the ones the check does
   not yet forbid.

This is the only step in the plan with no service in it, and the only one that cannot be postponed:
its output is the precondition for checking every step that follows.

## Solution

Move what exists into the three layers, open the seam through which a scene receives the game's
state, and install a tool that fails the build when an import crosses a frontier the wrong way.

Concretely, three things the developer can observe:

- **A layout that matches the documents.** `engine/`, `game/`, `presentation/` under `src/`, with
  exactly one file left at the root: the Vite entry point, reduced to a call to the game's bootstrap
  and a call to the presentation's boot. Every other file falls inside a layer, and therefore inside
  the check.
- **A testbed reachable by URL.** `?scene=<name>` selects a development scene from an explicit
  registry; no query string opens the sandbox — the old template, intact; an unknown name produces a
  visible error listing the names that do exist. The testbed ships with the game.
- **Six rules that fail the build.** `dependency-cruiser` resolves the real import graph and refuses
  the six crossings of ARC-14.2, in `npm run build`, in the fast test loop, and in CI on `master` and
  on every pull request. Each rule has a fixture that proves it bites, and each legal crossing has a
  fixture that proves it is not blocked.

Nothing about the game changes. The visual snapshot of the built page is the measure of that: if
every file moves and the committed PNG still matches, the step did only what it said.

## User Stories

### The layout

1. As a developer, I want `src/` to contain the three layers the requirements name, so that the
   architecture I read about is the architecture I navigate.
2. As a developer, I want every source file to fall inside a layer, so that no file is exempt from
   the boundary check by accident of where it sits.
3. As a developer, I want the one file left at the root to be three lines long, so that the single
   unchecked place in the project can be verified by reading it.
4. As a developer, I want the service family level (`engine/core/`) preserved, so that the folder
   tree and the service catalogue of §4 stay recognisably the same list.
5. As a developer, I want the old demo script deleted rather than relocated, so that the project has
   one testbed and not two things with that name.
6. As a developer, I want the compiled `.js` committed beside its source to disappear, so that the
   linter no longer needs a rule to ignore a build artifact that Node 24 makes unnecessary.
7. As a developer, I want the template's `MyLevel` renamed to something that describes it, so that
   the first scene in the registry does not teach the naming of a starter project.
8. As a developer, I want asset loading left exactly as it is, so that this step stays a relocation
   and the loader refactor happens when `AST` arrives at step 16.
9. As a reviewer, I want the visual snapshot to pass untouched after the move, so that "nothing
   changed but the paths" is a checked claim rather than an assurance.

### Booting and the game's state

10. As a developer, I want the game's bootstrap to exist from this step, so that the seam the later
    steps fill has a shape before anything is built on it.
11. As a developer, I want the bootstrap to **return** the game's state rather than start something
    global, so that two independent games can exist in one process when ARC-8.3 is tested.
12. As a developer, I want that returned value to be called `GameContext` from the first line, so
    that the project does not acquire a synonym for what step 3 will build.
13. As a developer, I want scenes to receive the context as a parameter, so that step 3 changes what
    the context contains and not the signature of every scene written before it.
14. As a developer, I want the browser entry point to do nothing but call the bootstrap and the
    boot, so that the only file outside the layers holds no logic worth checking.

### The testbed

15. As a developer, I want a registry of development scenes, so that trying out a system or a
    technique has an obvious place to live.
16. As a developer, I want to select a scene with `?scene=<name>`, so that I can reach any of them
    without editing code or rebuilding.
17. As a developer, I want no query string to open the sandbox, so that the plain URL always shows
    something that works.
18. As a developer, I want an unknown scene name to produce a visible error listing the valid names,
    so that a scene that fails to start is distinguishable from a scene that was never registered.
19. As a developer, I want that error in the page rather than in the console, so that it is
    observable from the seam the tests already use.
20. As a developer, I want the registry written out explicitly rather than discovered by the
    bundler, so that the inventory of scenes can be read and diffed.
21. As a developer, I want the testbed scenes to sit apart from the game's own scenes, so that step
    16 adds the real scenes as siblings instead of dismantling anything.
22. As a developer, I want each scene in a folder of its own, so that what is private to a scene has
    somewhere to go that is not shared.
23. As a developer, I want the testbed present in the production build, so that the scene I try out
    is the scene that ships and there is no mode-dependent behaviour.

### The boundaries

24. As a developer, I want an import of `excalibur` under `engine/` to fail the build, so that
    ARC-1.2 cannot decay into a habit.
25. As a developer, I want a service's internals to be unreachable from outside it, so that
    ARC-2.1's single public surface is a fact rather than an intention.
26. As a developer, I want one service importing another to fail the build, so that ARC-4.1 holds
    when the shortcut is convenient.
27. As a developer, I want imports from `engine/` into `game/` or `presentation/`, and from `game/`
    into `presentation/`, to fail the build, so that the one-way dependency of ARC-1.1 survives
    contact with deadlines.
28. As a developer, I want import cycles anywhere in `src/` to fail the build, so that the acyclicity
    ARC-4.6 assumes is verified rather than reasoned about.
29. As a developer, I want type-only imports checked like any other, so that a frontier cannot be
    crossed by importing a type across it.
30. As a developer, I want a testbed scene to reach a service directly through its public surface,
    so that a scene never needs a module in `game/` written for no reason but to let it through.
31. As a developer, I want each rule's failure message to say which frontier was crossed, so that
    the fix is obvious to whoever hits it at 6pm.

### Trusting the check

32. As a developer, I want every one of the six rules to have a fixture that violates it, so that a
    rule that has never been seen to fail is not mistaken for a rule that works.
33. As a developer, I want the legal crossings to have fixtures too, so that an over-broad rule is
    caught by a test instead of by the project grinding to a halt.
34. As a developer, I want the rules asserted against representative paths rather than against
    today's files, so that renaming a layer without updating the configuration fails a test instead
    of silently disabling a frontier.
35. As a developer, I want the rules defined once and shared by the real configuration and the
    fixture one, so that the test cannot certify rules that are no longer the ones applied.

### Pipeline

36. As a developer, I want the check in the fast test loop, so that I find out before the build does.
37. As a developer, I want the check in `npm run build`, so that ARC-14.3 is satisfied literally.
38. As a developer, I want the check to run in CI on `master` and on pull requests, so that ARC-14.1
    stops being the one requirement the project states and does not apply.
39. As a reviewer, I want CI's coverage stated rather than assumed, so that nobody believes the
    integration suite ran when it did not.

### Documentation

40. As a future reader, I want *scene* and *testbed* defined in the glossary, so that the two things
    the word covered until now stay separated.
41. As a future reader, I want the permission for the presentation to reach a service recorded as a
    decision, so that a lawful import does not look like an oversight to whoever finds it.
42. As a future reader, I want the requirements corrected where this step contradicts them, so that
    the plan and the repository do not start to drift at the very step whose subject is enforcement.

## Implementation Decisions

### Layout

`src/` holds the three layers, plus the browser entry point, plus files that cannot import anything
(the page stylesheet and the two ambient declaration files). The entry point is the one place not
covered by a layer rule; it is kept to a call to the bootstrap and a call to the boot, so that the
uncovered surface is small enough to audit by eye. Putting the entry inside `presentation/` would
close that hole and was rejected: it would make the Vite entry point indistinguishable from
presentation code, a distinction the determinism configuration already draws.

The service family level inside `engine/` is retained, mirroring the catalogue groupings of §4. This
decides the shape of the rule that isolates services: a service is a directory two levels below
`engine/`, not one.

The old demo script and its committed compilation are deleted, together with the linter's rule for
ignoring them. The word *testbed* is thereby freed for the scenes.

The template's level and player move under the sandbox testbed scene, and the level's class is
renamed after the scene. Resource loading is moved unchanged: §7.1 states that the Excalibur `Loader`
carries assets until `AST` arrives at step 16, and per-scene loading through `onPreLoad` is a change
local to the presentation when a second scene wants its own assets.

Scenes belonging to the game live directly under the presentation's scenes directory; development
scenes live under its `testbed/` subdirectory. Each scene is a folder holding the scene and whatever
is private to it. **No `index.ts` per scene**: in this project that filename means "a service's public
surface" (ARC-2.1), and reusing it elsewhere dilutes the convention the boundary check enforces.

### Bootstrap and context

The game exposes a bootstrap function that returns a **`GameContext`** — today an empty object
carrying only `dispose()`, at step 3 the real context of CTX-1. It returns a value rather than
starting a global, because ARC-8.3 requires two independent games in one process and a `void`
signature makes that test unwritable later.

The presentation exposes a boot function taking that context. Scene selection, the registry and the
Excalibur engine start live inside the presentation; the entry point passes one to the other.

### Scene registry

The registry is an explicit list mapping a name to a scene. Discovery by bundler glob was rejected:
a file that states which scenes exist can be read and diffed and owes nothing to the build tool. The
accepted cost is that every scene is bundled and a compile error in one breaks them all, which for a
testbed is acceptable.

Resolution rules:

| Input | Result |
|---|---|
| no `scene` parameter | the sandbox scene |
| a registered name | that scene |
| an unregistered name | a **visible in-page error** naming the parameter and listing the registered names |

The error is in the DOM, not the console, for two reasons: it is what a person needs in order to fix
their URL, and it is observable from the seam the tests already enter through. A silent fallback to
the sandbox was rejected explicitly — at step 5, a mistyped registration would show the template and
the map would look broken.

The registry ships in the production build. Excluding it under a development flag was rejected: it
would introduce a scene that exists in only one of the two build modes.

### Boundaries

`dependency-cruiser` carries all six rules, as a command of its own. The reasoning, which belongs at
the head of the configuration file rather than in an ADR:

- Rules 1…5 forbid **edges** of the import graph; rule 6 forbids **cycles**, a property of the whole
  graph. ESLint sees one file at a time; a plugin implementing cycle detection rebuilds a graph by
  hand, which is why that rule is the slowest in the ecosystem.
- ESLint's core `no-restricted-imports` matches **the string written in the import**. A crossing from
  a service into the game is written with relative segments, so the rule would have to guess how many
  levels up the author climbed. `dependency-cruiser` resolves each import to a real path from the
  project root and matches a pattern against that, so the rule states what it means.

Splitting the rules across two tools was rejected outright: two places to look when a build fails.
Keeping everything in ESLint with `eslint-plugin-import-x` was judged defensible — the existing test
harness would extend unchanged — and pays with whole-project cycle detection on every lint. A
consequence of the choice worth keeping: ESLint stays what it is today, the keeper of ADR 0001 and
nothing else.

**`tsPreCompilationDeps` is enabled.** Without it a type-only import is invisible to the tool, and a
type-only import upward is precisely how a domain layer starts to know the layer above it.

The rules, in the tool's terms:

| # | From | To | Intent |
|---|---|---|---|
| 1 | `engine/` | the `excalibur` package | ARC-1.2 |
| 2 | outside a service | any file of that service other than its public surface | ARC-2.1 |
| 3 | a service | another service | ARC-4.1 |
| 4 | `engine/` | `game/` or `presentation/` | ARC-1.1 |
| 5 | `game/` | `presentation/` | ARC-1.1 |
| 6 | anywhere in `src/` | itself, transitively | ARC-4.6 |

Explicitly **permitted**, and recorded in ADR 0004: `presentation/` may reach a service in `engine/`
directly, through its public surface, without passing through `game/`. Strict layering would oblige
every testbed scene to have a module in `game/` written for no purpose but to let it through — code
belonging to this game, created to satisfy a linter — while §7.2 asks the opposite, that the scene
prove **the presentation** can drive the service. The protection strict layering appears to offer,
that this game's rules do not end up in scenes, is not an import rule; it is point 3 of the
definition of done. The requirements gain a note saying so, because today they are silent and silence
reads as prohibition.

### Determinism zones

The deterministic path becomes `engine/`, `game/` and the golden-vector page. **The presentation is
out, testbed scenes included.** The deterministic path is where values a seed or a save must
reproduce are born; a scene produces pixels. Testbed scenes from step 5 onwards will draw — step 8
asks for radius queries drawn over entities, which is trigonometry — and a nested exception keeping
them inside the zone would be unblocked at step 8 by editing the linter configuration under pressure,
which is how a rule stops being a rule.

What this gives up is stated rather than hidden: the linter no longer objects to game logic written
inside a testbed scene. Neither would the alternative, which forbids transcendental functions, not
misplaced rules.

### Pipeline

The check is a first-class npm command, invoked from the build (satisfying ARC-14.3 literally) and
from the fast unit loop (where a developer notices in time). The real project is checked by the
command, in one place; the fixtures are checked by the spec.

CI arrives with this step: a workflow running the unit lane — install, lint, typecheck, boundaries,
headless tests — on push to `master` and on pull requests. **Playwright is excluded**, since it would
need browsers provisioned in CI, and the exclusion is declared rather than left to be discovered.
Ticket 09 of the random service left this as an open project-wide decision; this is the step whose
whole subject is ARC-14, so this is where it gets taken.

### Documentation

- The glossary gains **Scene** and **Testbed**. It does not gain an entry for *boundary*: ARC-14
  defines it, and the glossary is not a second home for requirements.
- The requirements are corrected in three places: the step 0 row no longer points at the deleted
  script, the step 1 paragraph is aligned to the scenes layout, and ARC-14.2 gains the note about the
  permitted crossing.
- **ADR 0004** records the permitted crossing. No ADR is written for the choice of tool: it would be
  rewritten in a day, so it fails the "hard to reverse" test, and its rationale belongs where whoever
  edits the configuration will read it.

## Testing Decisions

### What makes a good test here

The subject is not a service, so the usual criterion is adapted rather than dropped. A test enters
where a person would — a URL, a command — and observes what that person would see: a rendered scene,
an error naming the valid scenes, an exit code with a message. It must not know the registry's data
structure, the name of the resolution function, or how the rules are grouped in configuration.

The practical criterion: **if the test breaks when the registry is rewritten with the same observable
behaviour, the test is wrong.**

The deliberate exception is the assertion about the *zones* — there the configuration's shape is the
subject, for the same reason the golden vectors assert exact values: the property has no observable
behaviour until it is violated, and by then it is late.

### Seams

Three, of which one is new.

**A — the built page, by URL (existing).** The Playwright suite already boots the built game against
a served build. Everything about the registry is observed here: the default scene, selection by
`?scene=`, and the error for an unknown name. **No unit seam is opened on the registry.** The
resolution would be a pure function and convenient to test, but it would be a second door into
behaviour that is already fully observable from the first, and the fewest doors is the goal. The
consequence is a design constraint, and it is the reason the error must be in the DOM rather than the
console.

The existing visual snapshot is left untouched and becomes the proof that the relocation changed
nothing: every file moves, and the committed PNG still matches.

**B — the determinism zone probes (existing).** The probe pointing at the deleted script is removed,
and a probe is added asserting that a testbed scene falls **outside** the deterministic path. That
assertion is what makes the zone decision deliberate rather than a side effect of a folder move.

**C — the boundary check itself (new, the only new seam).** `dependency-cruiser` is run in a separate
process, as the linter already is in this project, and what is observed is the outcome it reports to
whoever started it — the exit code and the messages — rather than the outcome of an assertion made
inside the test process.

Because the tool resolves real paths, its fixtures cannot be six loose files: they form a **miniature
project** with the same layered shape, under the test fixtures directory, excluded from compilation
and from the real lint exactly as the linter fixtures already are.

### Infrastructure to introduce

- `dependency-cruiser`, as a dependency and as an npm command.
- A **shared rule module** parametric on the root, used by both the real configuration and the
  fixture one. This is why the determinism rules already live apart from their globs: two copies
  drift, and the test would then certify rules that are no longer the ones applied.
- The fixture project: roughly a dozen tiny files, one per violation and one per permitted crossing.
- A GitHub Actions workflow for the unit lane.
- One Playwright test file for the testbed, matched by the existing chromium project. The project
  keeps its name — the snapshot files are named after it.

### What gets tested

| Property | How |
|---|---|
| The relocation changed nothing | the existing visual snapshot of the built page, unmodified |
| Default scene | the built page with no query string shows the sandbox |
| Selection | `?scene=<registered name>` starts that scene |
| Unknown name | `?scene=<nonsense>` renders an error naming the parameter and listing the registered names |
| Rules 1…6 bite | one fixture per rule; the run exits non-zero and names the crossing |
| Permitted crossings are not blocked | fixtures for presentation → a service's public surface, an internal import within a service, and a co-located spec importing its own internals |
| Type-only imports are seen | a fixture crossing a frontier with an `import type` |
| The zones are the project's | the real configuration's patterns applied to representative paths that need not exist, one per layer |
| Determinism zones after the move | a testbed scene is outside the deterministic path; the engine, the game and the vector page remain inside |
| The check runs in the pipeline | the command is invoked by both the build and the unit lane |

The fixtures prove the **rules** bite; they bring their own root, so they cannot prove the project is
inside them. The zone assertions prove the **project** is inside the rules; they apply patterns and
so cannot prove those patterns are enforced. Both halves are needed, and the second is the one that
caught a real hole when the determinism rules were built.

### Prior art

Close and deliberate. The linter's meta test is the model for seam C, down to the separate process,
the shared rule module, the fixture tree with its own configuration, and the split between "the rules
bite" and "the project is inside the rules". The Playwright visual snapshot is the model for seam A:
same configuration, same served build, one test file more.

## Out of Scope

- **Every service.** This step contains none. `CFG` and `BUS` are step 2; `TIME` and the real
  `GameContext` are step 3. The context introduced here is an empty shape with a `dispose()`.
- **The orchestration.** `game/` acquires a bootstrap and nothing else; the orchestration directory
  ARC-4.4 describes arrives with the first rules that need it.
- **Asset loading.** The Excalibur loader is moved unchanged. Per-scene loading and the `AST` service
  are step 16.
- **The game's own scenes.** The scenes directory is created; only testbed scenes go in it now.
- **Playwright in CI.** The workflow covers the unit lane. Provisioning browsers is a separate
  decision.
- **Rules beyond the six.** ARC-14.2 lists a minimum; enforcing anything further is not this step's
  to invent.
- **Style rules in the linter.** ESLint's single concern is unchanged.
- **Renaming the chromium Playwright project**, which would orphan the committed snapshot.

## Further Notes

**Order of work.** The layout comes first and blocks the other two pieces: rules cannot be
configured against directories that do not exist, and the boot seam has nowhere to live until the
layers do. The boundary check and the registry are independent of each other once the layout lands.

**The definition of done applies at half strength.** Of the four conditions in §7.2, the third (a
service sheet promoted to `implemented`) and the fourth (the `GameContext` extended with a new field)
have no subject here — there is no service. The first two stand: headless specs green, and a testbed
scene driving the presentation with no import the check forbids.

**One question is deliberately left open** for the implementation: the exact scope of rule 2. Services
live two levels below `engine/`; modules under `game/` are not services and ARC-2.1 does not reach
them. The pattern must say so, and the fixtures must include a `game/` module importing another
`game/` module and passing.

**A second is a matter of observation, not reasoning.** The visual snapshot should survive the
relocation untouched, because moving files and renaming a class changes no pixels. That is a
prediction; it is confirmed by running it, and if it fails the step has done more than it declared.
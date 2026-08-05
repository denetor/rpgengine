# 03 — Bootstrap and the scene registry

**What to build:** a development scene can be reached from the browser by name, and it receives the
game's state as a parameter.

`?scene=<name>` opens that scene. No query string opens the sandbox, so the plain URL always shows
something that works. An unregistered name renders a **visible error in the page** naming the
parameter and listing the scenes that do exist. That last one is not a nicety: a silent fallback to
the sandbox means that at step 5, when `?scene=map` fails because the registration was mistyped, you
see the template and conclude the map is broken.

The registry is an **explicit list**, not a discovery glob. A file that states which scenes exist can
be read and diffed and owes nothing to the bundler; the price — every scene is bundled, and a
compile error in one breaks them all — is acceptable for a testbed. The testbed ships in the
production build: it is part of what arrives with the engine, and a scene that exists in only one of
the two build modes is worse than a broken one.

The other half of the ticket is the seam the rest of the plan hangs off. The game exposes a bootstrap
that **returns** a `GameContext` — today an empty shape carrying only `dispose()` — rather than
starting something global, because ARC-8.3 requires two independent games in one process and a `void`
signature makes that untestable later. The presentation's boot takes that context and passes it to
the scene. Step 3 of the plan will fill the context with fields; it must not have to change the
signature of every scene written before it, which is the failure
`docs/previous-version/ASSESSMENT-REPORT.md` documents for rendering.

The browser entry point keeps doing nothing but calling one and then the other: it is the single file
outside the boundary check, and it stays too small to hold anything worth checking.

The glossary gains the two words this ticket introduces — **Scene** and **Testbed** — since until now
*testbed* covered two different things and one of them has just been deleted.

**Blocked by:** 02 — Three-layer layout.

**Status:** done — every criterion met; one is weaker than it reads. See the closing notes.

- [x] The game's bootstrap returns a `GameContext` with `dispose()`, and does not install global state
- [x] The presentation's boot takes the context, and the scene receives it as a parameter
- [x] The browser entry point does nothing but call the bootstrap and the boot
- [x] The registry lists its scenes explicitly, without bundler-side discovery
- [x] No `scene` parameter opens the sandbox
- [x] A registered name opens that scene
- [x] An unregistered name renders an error **in the DOM** naming the parameter and listing the
      registered names
- [x] The behaviour holds in the production build, not only in development
- [x] Playwright tests cover the three cases above against the built page, in the existing chromium
      project
- [x] Scene folders hold what is private to them, and no scene declares an `index.ts` — that filename
      means a service's public surface (ARC-2.1)
- [x] `CONTEXT.md` defines **Scene** and **Testbed** in its Architecture section
- [x] The visual snapshot still passes

## Closing notes

- **What was added.**

  ```
  src/game/bootstrap.ts                              ← bootstrap() → GameContext, .gitkeep deleted
  src/presentation/boot.ts                           ← boot(context): resolves, starts, names the tab
  src/presentation/scenes/testbed/registry.ts        ← the explicit list, and resolveScene()
  src/presentation/scenes/testbed/scene-error.ts     ← the in-page error
  tests/testbed.spec.ts                              ← three cases, chromium project
  ```

  `src/main.ts` is now one statement: `void boot(bootstrap())`.

- **"A registered name opens that scene" is met but barely witnessed.** `sandbox` is the only
  registered scene *and* the default, so `?scene=sandbox` and the plain URL assert the same thing: a
  registry that ignored the parameter for known names would pass both. What keeps the pair honest is
  the third test — an unregistered name produces the error and starts nothing, which no
  parameter-ignoring boot can do. Registering a throwaway second scene would close the gap and was
  rejected: a scene that exists only to be selected is worse than a weak assertion, and step 5's
  `map` closes it for free.

- **The tab is named after the running scene, and that is production behaviour the ticket did not
  ask for.** The spec review called it scope creep, correctly, and it was kept deliberately: with one
  registered scene there is no other observable that distinguishes *which* scene Excalibur activated,
  and a `data-` attribute added for the tests would be a pure test door — the thing the spec's
  "fewest doors" argument exists to prevent. The value read is `game.currentSceneName`, so the
  assertion is bound to what the engine activated rather than to the query string, and it is set only
  after `start()` resolves, so it also witnesses that the scene started. `index.html` holds the stem
  and the boot appends, so the title exists in one place.

- **The error is `role="alert"`, and the tests locate it by role.** Not by class: the class is
  styling, and a test that knows it would break on a rename that changed nothing observable.

- **What the two reviews found.** No hard standards violation and no missing requirement. Applied: a
  data clump — `renderUnknownScene` took `(requested, registered)`, the two fields of the resolution's
  not-found branch, and now takes the branch; `unknownSceneMessage` was exported with one caller
  twelve lines below and is now module-private; the duplicated title constant is gone; `SceneName`
  follows the `StreamId` convention of `engine/core/random/types.ts`; the template's commented-out
  `physics` block was not carried into a newly authored file; and the two positive tests now also
  assert the canvas is visible. Left deliberately: `void boot(...)` discards a boot failure into the
  console rather than the page — making boot failures visible in the DOM is real work and would put
  logic in the entry point, which this ticket forbids in as many words.

- **The visual snapshot passed unregenerated**, on the first run and on every run since: the seam
  moved, the pixels did not.
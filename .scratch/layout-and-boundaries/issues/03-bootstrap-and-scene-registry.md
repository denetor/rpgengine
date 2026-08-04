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

**Status:** ready-for-agent

- [ ] The game's bootstrap returns a `GameContext` with `dispose()`, and does not install global state
- [ ] The presentation's boot takes the context, and the scene receives it as a parameter
- [ ] The browser entry point does nothing but call the bootstrap and the boot
- [ ] The registry lists its scenes explicitly, without bundler-side discovery
- [ ] No `scene` parameter opens the sandbox
- [ ] A registered name opens that scene
- [ ] An unregistered name renders an error **in the DOM** naming the parameter and listing the
      registered names
- [ ] The behaviour holds in the production build, not only in development
- [ ] Playwright tests cover the three cases above against the built page, in the existing chromium
      project
- [ ] Scene folders hold what is private to them, and no scene declares an `index.ts` — that filename
      means a service's public surface (ARC-2.1)
- [ ] `CONTEXT.md` defines **Scene** and **Testbed** in its Architecture section
- [ ] The visual snapshot still passes
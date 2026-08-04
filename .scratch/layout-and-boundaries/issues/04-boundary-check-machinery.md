# 04 — Boundary check: the machinery, and the first rule

**What to build:** an import that crosses a forbidden frontier fails the build. This ticket builds
the whole apparatus that makes that true and proves it with **one** rule — no file under `engine/`
may import `excalibur` (ARC-1.2, rule 1 of ARC-14.2). The five remaining rules are then a
configuration entry and a fixture each, and they are ticket 05 and ticket 06.

The tool is **`dependency-cruiser`**, run as a command of its own beside the linter. The reasoning
belongs at the head of its configuration, where whoever edits it will read it: rules 1…5 forbid
*edges* of the import graph and rule 6 forbids *cycles*, which is a property of the whole graph,
and ESLint sees one file at a time. Second reason, the one that bites sooner: ESLint's core
`no-restricted-imports` matches the string written in the import, so a crossing written with relative
segments would have to be guessed at with a pattern counting how many levels up the author climbed.
`dependency-cruiser` resolves each import to a real path from the project root, so the rule states
what it means.

`tsPreCompilationDeps` is enabled from the first line of configuration. Without it a type-only import
is invisible to the tool, and a type-only import upward is exactly how a domain layer starts to know
the layer above it.

The check is not trusted because it was written. It is trusted because it has been seen to fail, and
because the project has been shown to be inside it — the two halves that the determinism linter
already proved were both necessary:

- **The rules live in a shared module parametric on its root**, used by the real configuration and by
  the fixture one. Two copies drift, and the test would then certify rules that are no longer the
  ones applied.
- **The fixtures are a miniature project** with the same layered shape, since the tool resolves real
  paths and cannot be fed six loose files. They are excluded from compilation and from the real lint,
  as the linter fixtures already are.
- **The check runs in a separate process** and what is observed is the outcome it reports to whoever
  started it — the exit code, the message — not the outcome of an assertion made inside the test.
- **The zones are asserted against representative paths that need not exist.** The fixtures prove the
  rules bite, but they bring their own root, so they cannot prove the project is inside them: a
  mistyped path in the real configuration would leave every fixture green and the engine unguarded.

One spec file holds both halves.

**Blocked by:** 02 — Three-layer layout.

**Status:** ready-for-agent

- [ ] `dependency-cruiser` is a dependency, configured with `tsPreCompilationDeps` enabled
- [ ] A first-class npm command runs the check over the project
- [ ] The command runs inside `npm run build` (ARC-14.3) and inside the fast unit lane
- [ ] The rules are defined once, in a module parametric on its root, shared by the real
      configuration and the fixture one
- [ ] Rule 1 is enforced: no file under `engine/` may import `excalibur`
- [ ] Its failure message names the frontier that was crossed
- [ ] A fixture violates rule 1 and makes the run exit non-zero
- [ ] A fixture crosses that frontier with an `import type` and is caught too
- [ ] A fixture importing `excalibur` from the presentation passes, since that is where it belongs
- [ ] One spec file asserts both the fixture outcomes and the zones of the **real** configuration,
      applied to representative paths that need not exist
- [ ] The fixture project is excluded from compilation and from the real lint
- [ ] The existing project passes the check unchanged
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

**Status:** done

- [x] `dependency-cruiser` is a dependency, configured with `tsPreCompilationDeps` enabled
- [x] A first-class npm command runs the check over the project
- [x] The command runs inside `npm run build` (ARC-14.3) and inside the fast unit lane
- [x] The rules are defined once, in a module parametric on its root, shared by the real
      configuration and the fixture one
- [x] Rule 1 is enforced: no file under `engine/` may import `excalibur`
- [x] Its failure message names the frontier that was crossed
- [x] A fixture violates rule 1 and makes the run exit non-zero
- [x] A fixture crosses that frontier with an `import type` and is caught too
- [x] A fixture importing `excalibur` from the presentation passes, since that is where it belongs
- [x] One spec file asserts both the fixture outcomes and the zones of the **real** configuration,
      applied to representative paths that need not exist
- [x] The fixture project is excluded from compilation and from the real lint
- [x] The existing project passes the check unchanged

## Closing notes

- **What was built.**

  ```
  dependency-cruiser.boundaries.mjs            ← the rules and the options, parametric on the root
  dependency-cruiser.config.mjs                ← boundaryConfiguration('src')
  dependency-cruiser.fixtures.config.mjs       ← the same, over the miniature project
  tests-headless/boundaries.spec.ts            ← the fixtures bite, and the project is inside them
  tests-headless/fixtures/boundaries/project/  ← engine/ and presentation/, four files
  ```

  `npm run boundaries` is the command; it sits in `npm run build` and in `npm run test:unit`, and
  CI picked it up without the workflow being edited, since the workflow runs `test:unit`.

- **The options are shared, not just the rules.** The ticket asks for the rules to be defined once.
  `tsPreCompilationDeps` got the same treatment, because it is the option that decides whether a
  type-only crossing is visible at all: were it set per configuration, the fixture would prove that
  type-only imports are caught *in the fixture run* while the real check quietly went blind. The
  spec asserts it on the real run as well, read back from the tool's own `optionsUsed`.

- **The reporter is `err-long`, and that decides where the exit code comes from.** The default `err`
  reporter prints the rule name and the two endpoints but **not** the comment, so the criterion
  "its failure message names the frontier" would have been met by a rule name alone. `err-long`
  prints the comment under each violation. The consequence for the spec: `--output-type json`
  **exits 0 whatever it finds**, so the exit-code assertions had to be made against the reporter the
  command actually uses. The spec therefore runs each target twice — once for the outcome a person
  gets, once for the same run as data.

- **The zone assertions read the rules back out of the tool.** There is no `--print-config` here, the
  equivalent of what `lint.spec.ts` uses. What there is: `summary.ruleSetUsed` in the JSON report,
  which is the tool's own account of what the configuration meant. The spec applies those patterns
  to representative paths — `src/engine/core/combat/rules.ts`, `src/game/loot/table.ts`, a step-8
  testbed scene — none of which exist, following the convention the determinism probes set.

- **The spec was mutation-tested, five ways.** A check nobody has seen fail is not a check. Each
  mutation was applied, the spec run, and the file restored:

  | Mutation | Result |
  |---|---|
  | the rule stops naming the engine | 5 of 10 red |
  | `from` widened from `^src/engine/` to `^src/` | 3 red, including the passing presentation fixture and the project itself |
  | `tsPreCompilationDeps` switched off | 2 red — the `import type` fixture and the real-run assertion |
  | the excalibur pattern loses its `(/|$)` | 1 red — a package merely named after it would have been caught |
  | **the root mistyped in the real configuration only** | 1 red, and every fixture green |

  The last row is the one the zone assertions exist for, and it behaved as the argument predicted:
  the fixtures bring their own root, so nothing in them notices that the project fell outside the
  rules.

- **Both exclusions were verified positively, not assumed.** A type error and a `Math.random()` were
  added to a fixture file; `npm run typecheck` and `npm run lint` both stayed green, and the file was
  restored. Without that, "excluded" would have been a line in `tsconfig.json` that nobody checked.

- **The fixture project has an `engine/` and a `presentation/` and no `game/`.** Rule 1 speaks about
  the first two; the `game/` layer arrives with the fixtures of ticket 05, which is what needs it.

- **Three stale comments were corrected**, all of them made false by this ticket rather than found
  wrong: `eslint.config.mjs` said the boundary rules would go in ESLint (they did not, and the head
  of `dependency-cruiser.boundaries.mjs` argues why), and `ci.yml` said the rules did not exist yet.
  The readme gains the command.

- **The wiring is asserted too, and that came out of the review.** Both axes found the same hole
  independently: every assertion started the tool directly, so a check dropped from `build` or from
  `test:unit` would have left the suite green — the hole the zone assertions exist to close, one
  level further out. Three assertions now read the scripts a person invokes, and they were
  mutation-tested like the rest: dropping the check from the build, dropping it from the unit lane,
  and pointing the command at a root other than the one the configuration is written for each
  produce exactly one red. That last one matters because the tool takes *what to cruise* as a
  command-line argument and not from its configuration, so the root is necessarily written twice.

- **Cost.** The check over `src` is ~1s for 43 modules and 96 dependencies. Ticket 06 asks for a
  baseline once cycle detection is on; this is the number before it.

## Left deliberately

- **ARC-1.2's second half has no owner.** The requirement reads "No file under `engine/` MUST import
  `excalibur` **or any rendering, DOM or audio API**". Rule 1 forbids the package; the rest is not
  enforced, and mostly cannot be by an import rule — `document`, `window` and `AudioContext` are
  globals, so there is no edge in the graph to refuse. ARC-14.2's own rule 1 asks only for
  `excalibur`, which is what this ticket promised and delivered. Catching the globals would be an
  ESLint `no-restricted-globals` zone over `engine/`, which is a different tool doing a different
  job, and belongs to a ticket that does not exist yet.

- **The CI trigger was left pointing at `master_disabled`.** Commit `a8e6f99` disabled the push
  trigger deliberately, so story 38 of the spec ("the check runs in CI on `master` and on pull
  requests") is met for pull requests only. Reversing someone else's deliberate change is not this
  ticket's business; what was in this ticket's business was not overstating it, so the header of
  `ci.yml` and the readme now say plainly that pushes to `master` run nothing and that one line
  changes it back.

- **One fixture edge is staging for ticket 05.** The fixture sandbox scene imports the fixture
  service's public surface. No rule speaks about that edge yet — rule 2 does, and it is ticket 05's.
  It is there because the ticket asks the fixtures to be "a miniature project with the same layered
  shape", and a presentation that imports nothing is four loose files in a directory tree, not a
  layered project.
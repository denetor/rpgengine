# 09 — Lint-enforced prohibitions

**What to build:** two rules hold up the determinism of the whole project, and neither is observable
until it is violated. Calling `Math.random()` anywhere breaks the reproducibility of games; using a
transcendental `Math` function on the deterministic path breaks reproducibility **across engines**,
and does so invisibly — the code works perfectly on the machine of whoever writes it, and diverges
in someone else's browser.

The boundaries must be enforced by a tool, not by discipline. When this ticket is done, a violation
fails at check time, not in production. The project has no linter today: this ticket introduces one.

`Math.sqrt` and `Math.imul` are **allowed** and must be excluded explicitly: ECMAScript specifies
their result exactly. The prohibition concerns transcendental functions only.

**Blocked by:** 02 — Core: deterministic uniform streams.

**Status:** done

- [x] A linter is configured and runnable through a dedicated command
- [x] `Math.random()` is forbidden everywhere except in the randomness service
- [x] `Math.log`, `Math.cos`, `Math.sin`, `Math.exp` and `Math.pow` are forbidden in the randomness
      service and in any path that produces deterministic values
- [x] `Math.sqrt` and `Math.imul` remain allowed
- [x] Error messages explain **why** and point to ADR 0001: a rule that looks arbitrary gets turned
      off
- [x] A test file that violates each prohibition makes the check fail
- [x] The existing code passes without changes, or with declared changes
- [x] The check is part of the pipeline, not just runnable by hand

## What was built

ESLint 9 (flat config), with `@typescript-eslint/parser` and **no style rules at all**: the linter
carries the ADR 0001 prohibitions and nothing else, so that a failure from it always means the same
thing.

- `eslint.determinism.mjs` — the rules *and the shape of the three zones*. Kept apart because two
  configurations apply them: the real one and the fixture one. Copies would drift, and the test
  would then prove the rules right while the zones they hang off had moved.
- `eslint.config.mjs` — the globs for each zone: everywhere (no `Math.random()`); the deterministic
  path — `src/engine/**`, `src/game/**`, `src/testbed/**` and `tests-browser/**` — (no
  transcendentals, no approximated `Math` constants, no `**`); and `src/engine/core/random/**` (the
  ARC-9.2 exception for `Math.random()`). `presentation/` and the excalibur entry points are
  deliberately out: a wobble drawn with `Math.sin` decides nothing and is replayed from state.
- `eslint.fixtures.config.mjs` + `tests-headless/fixtures/lint/**` + `tests-headless/lint.spec.ts` —
  the same pattern already used for the headless runner: files that break each prohibition on
  purpose, linted in a separate process, with the meta test asserting the exit code and the message.

The meta test has a second half, which turned out to matter more than the first. The fixtures prove
the *rules* bite, but they bring their own globs, so a mistyped `src/engine/**` in the real
configuration would leave every fixture green and the engine unguarded. So the test also asks the
real configuration, through `eslint --print-config`, what it forbids at a path in each zone.
`--print-config` answers for a path rather than a file, and the path need not exist — which is what
makes the assertion about the glob instead of about today's file inventory. Dropping any one of the
four deterministic globs now fails a test; before this, dropping `src/engine/**` failed nothing,
because the only files under it are the service's own, caught by the glob nested inside.

### Beyond the letter of the ticket

Three additions, each closing a hole that would have made the prohibition decorative:

- **`**` is forbidden too.** It is `Math.pow` under another name and approximated identically;
  without it the rule is one keystroke from being sidestepped.
- **The approximated `Math` constants** (`PI`, `SQRT2`, `SQRT1_2`, `E`, the logarithm bases) are
  forbidden on the deterministic path. ADR 0001 already says the noise must write
  `0.7071067811865476` as a literal rather than reach for `Math.SQRT1_2`; nothing enforced it.
- **`noInlineConfig` on the deterministic path**: an `eslint-disable` comment cannot switch the rule
  off there. ADR 0001 admits no exception, and this is precisely the rule someone silences because
  its violation looks harmless on their own machine.

### Declared change to existing code

`isolation.spec.ts` no longer searches its own source text for forbidden `Math` names — the linter
reads the syntax instead, covers the whole project rather than one directory, and no longer trips
over a doc comment that merely *names* a forbidden function. The environment and import assertions
in that file stay.

### Pipeline

`npm run lint` is the dedicated command; it runs at the head of both `npm run test:unit` and
`npm run build`, so a violation fails the check and the build.

**Open point for ARC-14.1**, which asks for the check to run *in CI*: this repository has no CI at
all — no workflow, no hook — for any of its suites. Wiring the linter into the npm scripts is the
whole of the pipeline that exists today. Introducing CI is a project-wide decision, not this
ticket's to take.

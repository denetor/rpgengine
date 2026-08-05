# 01 — Continuous integration for the unit lane

**What to build:** every push to `master` and every pull request runs the project's checks on a
machine that is not the author's. Today nothing does: the repository is on GitHub, has no workflow
and no git hook, and the whole pipeline is a set of npm scripts that hold for exactly as long as
whoever runs them remembers to. ARC-14.1 asks for the opposite in so many words — the boundaries
"enforced by a tool run in CI, not by discipline alone" — and ticket 09 of the random service left
this open as a project-wide decision rather than take it inside a ticket about linting.

This ticket takes it, and takes it **first**: the four tickets that follow are the layout and the
boundary check, and they should land inside a guard rather than be the guard that arrives last.

The workflow runs the **unit lane** only: install from the lockfile, lint, typecheck, headless tests.
The Playwright suite is **deliberately excluded** — it would need browsers provisioned in CI, which
is a separate decision with a separate cost — and the exclusion is stated in the workflow itself, so
that nobody reads a green tick as "the integration tests passed".

Nothing about the project's own scripts changes: CI runs what a developer runs.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] A GitHub Actions workflow runs on push to `master` and on `pull_request`
- [x] It installs from the lockfile, not from a resolution made at CI time
- [x] It runs the unit lane: lint, typecheck and the headless suite
- [x] It uses the Node version the project already declares, rather than a second one chosen here
- [x] The Playwright suite is not run, and the workflow says why in a comment
- [ ] A deliberately broken commit on a branch makes the pull-request check fail — see the closing
      note: the branch exists, the observation is on GitHub
- [x] The workflow adds no npm script that a developer cannot run locally

## Closing notes

- **`.github/workflows/ci.yml`, one job, four steps.** Checkout, `setup-node`, `npm ci`,
  `npm run test:unit`. That last line is the whole point: CI does not name lint, `tsc` and vitest
  itself, it names the script a developer already runs, so the two cannot describe different lanes.
  The boundary check of ticket 04 will be added to `test:unit` and appear here without this file
  being touched.
- **The Node version was declared twice, and the two disagreed.** `.nvmrc` said `22.23.1` while
  `Dockerfile.development` builds `FROM node:24` — so a workflow honouring `.nvmrc` to the letter
  would have run CI on a version nobody here develops on, and a green tick would have meant "passes
  on 22" while every local run meant "passes on 24". `.nvmrc` now says `24`, matching the container;
  the workflow reads `node-version-file: .nvmrc` and never repeats the number.
- **What was rehearsed before pushing.** A clean export of the tree, `npm ci` from the lockfile into
  an empty `node_modules`, then `npm run test:unit`, inside `node:24` — 13 files, 236 tests, exit 0.
  The same run on `node:22.23.1` is also green, which is what made the version split a decision
  rather than a forced move. Adding a `Math.random()` under `src/engine/` to that export turns the
  lane red at the lint step, with the ADR 0001 message, exit 1.
- **The one box left open is the one that cannot be observed from here.** A red pull-request check
  is a fact about GitHub, not about this tree, and it is not ticked on the strength of a local
  rehearsal. The branch `ci/prove-red` carries this workflow plus the `Math.random()` commit above;
  opening a pull request from it against `master` is the observation, and the check must go red at
  the lint step. Tick the box then, and delete the branch.
- **The exclusion is stated twice, on purpose.** The workflow header says what it does not run and
  why; `readme.md` repeats it under a *Continuous integration* heading next to the table of suites.
  A reader who wonders what a green tick covers is in one place or the other, not reliably in both.
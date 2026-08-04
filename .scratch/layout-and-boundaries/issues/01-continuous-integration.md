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

**Status:** ready-for-agent

- [ ] A GitHub Actions workflow runs on push to `master` and on `pull_request`
- [ ] It installs from the lockfile, not from a resolution made at CI time
- [ ] It runs the unit lane: lint, typecheck and the headless suite
- [ ] It uses the Node version the project already declares, rather than a second one chosen here
- [ ] The Playwright suite is not run, and the workflow says why in a comment
- [ ] A deliberately broken commit on a branch makes the pull-request check fail
- [ ] The workflow adds no npm script that a developer cannot run locally
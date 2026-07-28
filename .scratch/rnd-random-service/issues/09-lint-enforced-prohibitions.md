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

**Status:** ready-for-agent

- [ ] A linter is configured and runnable through a dedicated command
- [ ] `Math.random()` is forbidden everywhere except in the randomness service
- [ ] `Math.log`, `Math.cos`, `Math.sin`, `Math.exp` and `Math.pow` are forbidden in the randomness
      service and in any path that produces deterministic values
- [ ] `Math.sqrt` and `Math.imul` remain allowed
- [ ] Error messages explain **why** and point to ADR 0001: a rule that looks arbitrary gets turned
      off
- [ ] A test file that violates each prohibition makes the check fail
- [ ] The existing code passes without changes, or with declared changes
- [ ] The check is part of the pipeline, not just runnable by hand

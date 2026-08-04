# 05 — The four remaining edge rules

**What to build:** the other four crossings of ARC-14.2 that forbid an edge of the import graph fail
the build, each with a fixture that violates it and — just as important — a fixture that exercises
the neighbouring legal case and passes.

- **Rule 2 — a service is reachable only through its public surface.** ARC-2.1 says everything not
  exported from a service's `index.ts` is private to it, and until a tool says so it is private by
  convention. Two subtleties decide the pattern, and both need a fixture that passes: a service's own
  files import each other freely, and a spec sitting beside the code imports its own internals. A
  third: services live two levels below `engine/`, in their family directory; modules under `game/`
  are not services and ARC-2.1 does not reach them, so a `game/` module importing another must pass.
- **Rule 3 — no service imports another service** (ARC-4.1). Only one service exists today, so the
  fixtures are the only place this rule can be seen working at all — which is the argument for having
  them rather than against.
- **Rule 4 — nothing under `engine/` imports `game/` or `presentation/`**, and **rule 5 — nothing
  under `game/` imports `presentation/`** (ARC-1.1). One-way dependencies, checked instead of
  remembered.

Rule 4 forces a decision that the requirements currently leave silent, and silence reads as
prohibition: **the presentation may reach a service in `engine/` directly, through its public
surface, without passing through `game/`.** Strict layering would oblige every testbed scene to have
a module in `game/` written for no purpose but to let it through — code belonging to this game,
created to satisfy a linter — while §7.2 asks the opposite, that the scene prove *the presentation*
can drive the service. What strict layering appears to protect, that this game's rules do not end up
inside scenes, is not an import rule; it is point 3 of the definition of done.

That permission is hard to reverse once fifteen scenes rely on it, surprising to anyone who has read
"presentation → game → engine", and the result of a real alternative — so it is written down as
**ADR 0004**, and ARC-14.2 gains a note stating it.

**Blocked by:** 04 — Boundary check: the machinery, and the first rule.

**Status:** ready-for-agent

- [ ] Rule 2 is enforced: from outside a service, only its public surface may be imported
- [ ] Fixtures passing: a service's internal import, a spec beside the code importing its own
      internals, and a `game/` module importing another `game/` module
- [ ] Rule 3 is enforced: no service imports another service
- [ ] Rule 4 is enforced: nothing under `engine/` imports `game/` or `presentation/`
- [ ] Rule 5 is enforced: nothing under `game/` imports `presentation/`
- [ ] A fixture importing a service's public surface from the presentation **passes**
- [ ] Each rule has a fixture that violates it and makes the run exit non-zero
- [ ] Each failure message names the frontier that was crossed
- [ ] The zone assertions cover the paths each new rule speaks about
- [ ] `docs/adr/0004-*` records the permitted crossing, with the alternative that was rejected
- [ ] ARC-14.2 in `docs/REQUIREMENTS.md` carries the note about that crossing
- [ ] The existing project passes all five rules unchanged
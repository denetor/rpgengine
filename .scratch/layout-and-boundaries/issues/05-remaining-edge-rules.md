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

**Status:** done

- [x] Rule 2 is enforced: from outside a service, only its public surface may be imported
- [x] Fixtures passing: a service's internal import, a spec beside the code importing its own
      internals, and a `game/` module importing another `game/` module
- [x] Rule 3 is enforced: no service imports another service
- [x] Rule 4 is enforced: nothing under `engine/` imports `game/` or `presentation/`
- [x] Rule 5 is enforced: nothing under `game/` imports `presentation/`
- [x] A fixture importing a service's public surface from the presentation **passes**
- [x] Each rule has a fixture that violates it and makes the run exit non-zero
- [x] Each failure message names the frontier that was crossed
- [x] The zone assertions cover the paths each new rule speaks about
- [x] `docs/adr/0004-*` records the permitted crossing, with the alternative that was rejected
- [x] ARC-14.2 in `docs/REQUIREMENTS.md` carries the note about that crossing
- [x] The existing project passes all five rules unchanged

## Closing notes

- **The open question of the ticket, answered.** Rule 2's scope: a **service** is a directory two
  levels below `engine/`, so `engine/core/random/` is one and `engine/core/` is not. The two patterns
  that say so are written once at the top of `forbiddenEdges` and everything turns on them. Modules
  under `game/` are not services and no rule treats them as such — the fixture where one imports
  another passes, and a zone assertion says the same thing about the real configuration.

- **Rules 2 and 3 divide the work between them, and the seam is deliberate.** Rule 2 exempts *every*
  file that lives inside *any* service, not merely files of the service being imported. That looks
  like a hole — service A reaching into service B's internals — and it is closed by rule 3, which is
  stricter: it refuses a service the other service's `index.ts` as well. Nothing falls between the
  two, and the alternative (one rule with a backreference doing both jobs) cannot be written, because
  rule 2's `from` has to match files that are in no service at all. The review caught that this
  argument was the one thing in the ticket with no fixture under it — the crossing it turns on is now
  `rummages-in-the-clock.ts`, and it goes quiet if either rule is loosened.

- **`$1` is what makes rule 3 expressible.** "Another service" is the one thing no single pattern can
  say. `from` captures the whole service directory and `to.pathNot` refers back to it as `^$1/`.
  dependency-cruiser does honour the backreference inside `pathNot`, which was verified rather than
  assumed. The *whole path* is captured rather than the service's name, because two families may each
  hold a service called `random` and they would be different services — and that sentence started out
  as an untested claim: the mutation capturing only the name passed all thirty-three assertions. It
  is now a fixture, `engine/world/random/` and the file next door that imports it, and the mutation
  is red.

- **The zone assertions were rewritten from one path to a pair.** They used to ask "what rules name
  this path on their left / on their right", which cannot express rules 2 and 3 at all: their `to`
  side depends on where the import came *from*. They now ask `rulesForbidding(from, to)` — is this
  crossing closed? — which reads the way a person thinks and, as a side effect, lets ADR 0004 be
  asserted directly rather than inferred from the absence of a rule. The helper substitutes `$n` from
  the `from` match, which is a small reimplementation of what the tool does while it walks the graph;
  the fixtures are what prove the tool's own behaviour.

- **Eleven mutations, each red in the right place.** The four new rules, plus the two decisions that
  are not rules:

  | Mutation | Result |
  |---|---|
  | rule 2 forgets that the public surface is allowed | 5 red — every lawful crossing through an index |
  | rule 2 applied to files inside a service too | 5 red — the service's own internals and its spec |
  | rule 3 loses its `^$1/` backreference | 5 red — a service could no longer import itself |
  | rule 4 forgets `presentation/` | 3 red |
  | rule 5 pointed the other way (`presentation/` → `game/`, which is legal) | 6 red |
  | **a service read as one level below `engine/`** | 6 red, the family-level assertion among them |
  | **rule 2 read as "nothing but an index, anywhere"** | 7 red — including the `game/` module fixture |
  | **rule 3 capturing the service's name instead of its path** | 2 red — *after* the fixture below was added; before it, none |

  The last three are the ticket's subtleties, and each is now caught by the assertion written for it.

- **`vitest.config.ts` had to learn to skip the fixtures.** One of the passing fixtures is a
  `*.spec.ts` beside the code it tests — that is the whole point of it, since rule 2 must let a spec
  import the internals it sits next to — and `tests-headless/**/*.spec.ts` would have collected and
  run it for real. The default excludes are kept and the fixture tree added to them; replacing the
  defaults would have let `node_modules` back in.

- **The fixture project is 19 files, counted rather than estimated.** The tool cruises 21 modules
  (`excalibur` and `vitest` are two of them) over 18 dependencies: **10 violations**, one per
  violation fixture, and **8 lawful edges**, 6 of them inside the project. The spec asserts the count
  as well as the names, so a rule that starts biting somewhere new fails instead of going unread.

- **ADR 0004 and the note in ARC-14.2.** The permission is recorded with the alternative that was
  rejected and with what it costs, including the part that will look like an oversight to whoever has
  read "presentation → game → engine". The requirements table gains a paragraph under it pointing
  there, since the table's silence read as prohibition.
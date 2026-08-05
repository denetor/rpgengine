# 06 — No import cycles

**What to build:** rule 6 of ARC-14.2 — no import cycle anywhere in `src/`, at any depth.

It is a ticket of its own because it is not the same kind of rule as the other five. Those forbid an
edge between two named places and can be checked one import at a time; this one is a property of the
**whole graph**, and the answer for any single file depends on every other. It is the reason the tool
chosen in ticket 04 is a graph tool at all, and it is the only rule whose cost is worth measuring
after it lands: cycle detection is what makes this kind of check slow when a project grows.

ARC-4.6 says the acyclicity of the *service* graph is guaranteed by construction, since ARC-4.1
forbids services from importing each other, and the conceptual cycles — quests ↔ inventory ↔
dialogues — are resolved in the orchestration. That argument covers services. It does not cover a
cycle between two files inside one service, or between two modules of `game/`, which is what this
rule actually catches and what nothing else in the plan would.

The fixture is the smallest one in the suite and the least obvious to get right: a two-file cycle
proves the rule fires, and a longer cycle through a third file proves it is not a check on direct
self-reference. A shared module imported twice by unrelated files is the legal case, and it must
pass — a rule that mistakes a diamond for a cycle would block the project on its first real service.

**Blocked by:** 04 — Boundary check: the machinery, and the first rule. (Independent of 05; the two
can run in parallel.)

**Status:** done

- [x] Rule 6 is enforced over the whole of `src/`
- [x] A two-file cycle in a fixture makes the run exit non-zero
- [x] A three-file cycle is caught too, so the rule is not merely checking direct self-reference
- [x] A shared module imported by two unrelated files **passes**
- [x] The failure message names the files in the cycle, in order
- [x] The zone assertion confirms the rule speaks about the whole of `src/`, not one layer
- [x] The existing project has no cycle, and passes unchanged
- [x] The check's runtime on the current project is recorded in the ticket's closing notes, as the
      baseline against which a future slowdown is judged

## Closing notes

- **The rule is four lines**, and the ticket is right that it is not the same kind of rule as the
  other five: `from` is the whole of `src/` and `to` is `{ circular: true }`, which is not a place at
  all. Everything interesting was in the two halves around it.

- **The zone assertions had to learn that rule 6 is not an edge rule.** `rulesForbidding(from, to)`
  asks whether a crossing is closed, and rule 6 closes none — every edge of a cycle is an edge the
  other five wave through. Left alone, it would have been reported as forbidding *every* pair, and
  the six `toEqual([])` assertions that record the lawful crossings would have gone red for a rule
  that permits them all. So `closes()` now skips a circular rule explicitly, and rule 6 gets its own
  probe, `watchedForCycles(path)`, asserted over all four layers plus a service's insides. Scoping
  the rule to `engine/` alone turns that probe red, which is the criterion's whole point: a rule
  confined to one layer still catches cycles and still looks like it works.

- **A cycle is reported once, against whichever file the tool reached first.** Not once per member —
  which the first draft of the assertions assumed, and which cost a red run to find out. The ring in
  the JSON starts at the reported file's dependency and closes back on it. Since which file that is
  is the tool's business and not a property worth pinning, `cyclesReported()` rotates every ring to
  begin at the file that sorts first, and what is left to assert is membership and order.

- **The message criterion is asserted on the message, not on the JSON.** The `err-long` reporter
  prints the ring closed — `a → b → c → a` — so every consecutive step appears whichever file it
  starts from. The assertion checks the three steps rather than one rotation of the whole, which
  makes it independent of a traversal order that is not ours to fix.

- **Mutations.** Both go red, and the first is the one that matters:

  | Mutation | Result |
  |---|---|
  | rule 6 scoped to `engine/` instead of the whole root | 6 red, the whole-of-`src/` probe among them |
  | the rule deleted outright | 5 red |

  A third mutation was discarded rather than reported: setting `circular: false` turns every ordinary
  edge into a violation, so it reddens 27 assertions and proves nothing about rule 6. Deleting the
  rule object is the honest form of "the rule is gone".

  A mutation that makes the diamond fire has no configuration to write: a check that mistook a shared
  module for a cycle would be a defect in the tool, not a choice in this file. The fixture stays as
  the guard that would notice it — on an upgrade, or if the options around it are ever changed.

- **Runtime baseline, which is the criterion this ticket exists to record.**

  **Method**, because a number without one is not a baseline: the CLI invoked exactly as
  `npm run boundaries` invokes it, over `src`; one warm-up run discarded; seven timed runs; wall
  clock inside `rpgengine_app_1`; the same measurement repeated with the rule 6 object deleted.
  Project size at the time: **43 modules, 96 dependencies**.

  | | runs, sorted (ms) | median |
  |---|---|---|
  | with rule 6 | 425 427 430 431 **435** 445 458 | **435 ms** |
  | without rule 6 | 427 431 431 **434** 439 440 443 | 434 ms |

  **The delta is the durable half: 1 ms, against a spread of 33 ms within a single set.** Cycle
  detection costs nothing measurable at this size, and nearly all of the 435 ms is process start and
  TypeScript resolution rather than graph work.

  The absolute figure is **not comparable across machines**, and this was demonstrated rather than
  assumed: the same measurement taken by a reviewer on the same repository, under different load,
  gave 507 ms and 501 ms — 16% higher, with the same conclusion. So a future slowdown should be
  judged by re-running *both* columns on one machine, not by comparing against 435 ms. What this
  baseline really records is that at 43 modules the rule is free; the cost grows with the graph and
  says nothing yet about where it goes. Worth repeating when the engine holds ten services.

- **The fixture project is 30 files.** The tool cruises 32 modules over 29 dependencies: **13
  violations** — the ten edge crossings of tickets 04 and 05, plus one per cycle — and the lawful
  cases, the diamond's four files among them. The spec asserts the count, so a rule that starts
  biting a lawful file fails rather than going unread.

- **ARC-4.6's guarantee is intact and beside the point.** Acyclicity *between services* is guaranteed
  by construction, because ARC-4.1 forbids them to import each other — which is now itself enforced,
  by rule 3. What is left for rule 6 to catch is a cycle inside one service or between modules of
  `game/`, and the three-file fixture is deliberately the quest ↔ inventory ↔ dialogue shape that
  ARC-4.6 names, built out of `game/` modules where that argument does not reach.

- **A ring of pure types fails the build, and that is now a decision rather than an accident.** The
  review found it: `tsPreCompilationDeps` is on, so two interfaces that name each other — routine
  TypeScript, with nothing going round at runtime because the imports are erased — are reported as a
  cycle. Nothing acknowledged it, so whoever met it at 6pm would have been told to break a ring that
  does not exist.

  It was not switched off. Story 29 of the spec asks for type-only imports to be "checked like any
  other", and a frontier that can be crossed by importing a type across it is not a frontier;
  excluding them from rule 6 alone would trade a documented requirement for a convenience. So the
  consequence is pinned instead — a fixture in `game/cycle-of-types/`, an assertion naming it, and a
  sentence in the rule's own message saying `import type` counts. The fix is the ordinary one, a
  third module holding both types, and now the message says so.

- **What the reviews changed beyond that.** The rules function was still called `forbiddenEdges` and
  still documented as holding five rules, both of which this ticket made false; the file header still
  claimed every message names a frontier, which rule 6's does not. One test title said "for every
  rule" while looping over five. The rule's message had grown to 867 characters against neighbours
  averaging 400, almost all of it design argument that belongs in the header and not in front of
  someone whose build just failed. And the ring assertions had two mechanisms for the same problem:
  rotating rings to a canonical start *and* checking consecutive pairs in the message. The rotation
  is gone — membership is asserted sorted, order is asserted where a person reads it.
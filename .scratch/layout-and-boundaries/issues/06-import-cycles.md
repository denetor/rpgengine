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

**Status:** ready-for-agent

- [ ] Rule 6 is enforced over the whole of `src/`
- [ ] A two-file cycle in a fixture makes the run exit non-zero
- [ ] A three-file cycle is caught too, so the rule is not merely checking direct self-reference
- [ ] A shared module imported by two unrelated files **passes**
- [ ] The failure message names the files in the cycle, in order
- [ ] The zone assertion confirms the rule speaks about the whole of `src/`, not one layer
- [ ] The existing project has no cycle, and passes unchanged
- [ ] The check's runtime on the current project is recorded in the ticket's closing notes, as the
      baseline against which a future slowdown is judged
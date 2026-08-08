# 06 — The reusability proof: a clock for somebody else's night shift

**What to build:** the test that makes *"generic"* an executable claim rather than a line in a sheet
(ARC-3.4). The whole public surface, exercised against an event union **and a calendar invented for
something that is not a game**, with no type of this project anywhere in the file — no `EntityId`, no
quest, no combat, no poisoning, no respawn.

**The domain, and why this one: a bakery's night shift.** Doughs are set to prove and each has its own
deadline; the oven timer repeats every few minutes; the night is divided into named stretches —
*mixing*, *proving*, *baking*, *service* — that begin at fixed times of the clock and are **not of
equal length**. That last property is the reason for the choice: unequal, non-periodic phases are
exactly what a repeating timer cannot express, and rediscovering that in somebody else's vocabulary
is the only convincing way to show that the calendar is not a fact about this game's dawn and dusk. A
baker also does the two things this service was hardest to design for: waits (a batch advanced by
four hours at once, because nothing happens until it does) and cancels (the loaf pulled early).

`RND` picked an estate growing grapes and `BUS` a signal box on a branch line, for how plainly they
are not this project. The same instinct applies here, with the shape chosen on purpose rather than
for flavour.

The proof is worth exactly as much as its independence, so the file may not import a helper written
for the project's own specs. If a fixture is needed it is built inside the file, in the bakery's own
vocabulary — and the same goes for the calendar: a night shift with its own day length and its own
phase table, configured from scratch.

**A proof passes on the first run, which is the one thing that makes it worth suspecting.** It is
written after the service and asserts that nothing had to change, so "green" is exactly what a vacuous
file would also report. It must therefore be checked by **breaking the service twice** and confirming
the file notices — and by confirming it notices *only* what was broken. Two suggestions that bite:
anchoring a repetition to `now` instead of to its deadline should fail the oven timer's schedule and
nothing else; making the phase lookup assume equal-length stretches should fail the shift's
transitions and nothing else. A proof nobody has watched fail is a sentence, not a test.

This is also where the **whole surface** is exercised end to end for the first time in one file:
scheduling, repetition, cancellation, the ordering of a batch, world time and its transitions, a save
and a restore, and two clocks side by side that do not observe each other.

**Blocked by:** 01 — the clock and the queue; 02 — the calendar; 03 — the save door. It exercises the
whole surface, so it can only be honest once the surface is whole.

**Status:** done

- [x] The file names a domain that is plainly not this game, and contains no type, id or vocabulary
      from it
- [x] The calendar is invented too: its own day length and its own phase table, configured in the
      file
- [x] One-shot deadlines in the invented domain come due in order, and at the right instants
- [x] The repeating timer comes due the right number of times inside a single large advance, at
      deadlines anchored to the period
- [x] Cancelling stops a repetition, and cancelling something already due changes nothing else
- [x] The unequal, non-periodic phases of the shift are crossed exactly once each, in order, merged
      with the deadlines that fall between them
- [x] A save and a restore in the invented domain resume with exact remainders and continue the
      identical sequence
- [x] Two clocks in one process do not observe each other (ARC-8.3)
- [x] The file imports nothing from this project's own test helpers or fixtures
- [x] The service was broken twice and this file noticed, each time failing **only** the assertions
      about what was broken — recorded in the file's own comment
- [x] The unit lane is green: lint, typecheck, boundaries and the headless suite

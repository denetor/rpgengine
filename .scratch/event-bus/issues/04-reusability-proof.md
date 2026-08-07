# 04 — The reusability proof: a bus for somebody else's game

**What to build:** the test that makes *"generic"* an executable claim rather than a line in a sheet
(ARC-3.4). The whole public surface, exercised against an event union **invented for another game**,
with no type of this one anywhere in the file — no `EntityId`, no quest, no combat, no item.

The domain should be chosen so that a reader can tell at a glance it is not this project: `RND` used
an estate growing grapes, and the same instinct applies. What it must exercise is the surface, not a
scenario — subscriptions in both phases, a cascade that publishes from inside a handler, the
ordering, the trace, the failure policy, teardown.

This is also where the bus's half of **ARC-8.3** is proved: two buses created side by side, each
delivering only to its own subscribers, neither observing the other's events. That is the practical
check that no global state has crept in, and the convention `random/isolation.spec.ts` already set.

The proof is worth exactly as much as its independence, so the file may not import a helper written
for the project's own specs. If a fixture is needed it is built inside the file, in the invented
domain's own vocabulary.

**The domain, and why this one:** a **signal box on a single-track branch line** — track circuits
reporting a train, an interlocking deciding which signal may show what, barriers at a level crossing,
and separately the departure board on the platform and the row of lamps in front of the signaller.
`RND` picked an estate growing grapes for how plainly it is not this project, and the same instinct
applies, but this domain was chosen for its *shape* as well. A signal box is genuinely two-phase: the
interlocking must reach its conclusion before anything is displayed, or the board announces a
departure the interlocking is still in the middle of forbidding. BUS-6 arrived at independently, in
somebody else's vocabulary, is the only convincing way to show that BUS-6 is not a fact about this
game's panels. The cycle that trips the depth rail is a wiring fault of a kind signal engineers really
make — the signal lowers the barriers, the barriers put the signal back to danger — so the refusal
reads as a bug report in the invented domain too.

**A proof passes on the first run, which is the one thing that makes it worth suspecting.** It is
written after the service and asserts that nothing had to change, so "green" is exactly what a
vacuous file would also report. It was therefore checked by breaking the service twice and confirming
the file noticed: delivering each event to the interface during the drain instead of after it failed
the phase-order test **and only that one**, and moving the subscription registries to module scope
failed both isolation tests **and only those**. A proof nobody has watched fail is a sentence, not a
test.

**Blocked by:** 01 — the delivery contract; 02 — the safety rail; 03 — misbehaving handlers and
teardown. It exercises the whole surface, so it can only be honest once the surface is whole.

**Status:** done

- [x] The file names a domain that is plainly not this game, and contains no type, id or vocabulary
      from it
- [x] A cascade in the invented domain is delivered in generation order, and the presentation phase
      is served last
- [x] A trace registered through `onAny` records the invented domain's events, once each, in order
- [x] The failure policy behaves identically in the invented domain, in both phases
- [x] The depth limit trips on a cycle of invented events and names them in the message
- [x] `dispose()` leaves the invented bus registered with nothing
- [x] Two buses in one process do not observe each other: an event published on one reaches no
      handler of the other (ARC-8.3)
- [x] The file imports nothing from this project's own test helpers or fixtures
- [x] The unit lane is green: lint, typecheck, boundaries and the headless suite

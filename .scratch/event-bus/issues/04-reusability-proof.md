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

**Blocked by:** 01 — the delivery contract; 02 — the safety rail; 03 — misbehaving handlers and
teardown. It exercises the whole surface, so it can only be honest once the surface is whole.

**Status:** ready-for-agent

- [ ] The file names a domain that is plainly not this game, and contains no type, id or vocabulary
      from it
- [ ] A cascade in the invented domain is delivered in generation order, and the presentation phase
      is served last
- [ ] A trace registered through `onAny` records the invented domain's events, once each, in order
- [ ] The failure policy behaves identically in the invented domain, in both phases
- [ ] The depth limit trips on a cycle of invented events and names them in the message
- [ ] `dispose()` leaves the invented bus registered with nothing
- [ ] Two buses in one process do not observe each other: an event published on one reaches no
      handler of the other (ARC-8.3)
- [ ] The file imports nothing from this project's own test helpers or fixtures
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

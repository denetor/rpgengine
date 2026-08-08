# 01 — The vocabulary and the capability mask

**What to build:** the thing that turns *"this game owns these kinds of component"* into something a
machine can intersect in two instructions. A caller declares an ordered list of `ComponentKind`s and
gets back the means to name any subset of them as one value, to combine subsets, and to ask whether
one contains another.

This is the smallest piece with a meaning of its own, and it is the piece `SPX` will later share:
SPX-2 says the spatial index filters on **the mask `ENT` computes**, not on a tag vocabulary of its
own. Fixing it here, alone, is what stops a second vocabulary from being born the day the index is
written.

**Every kind has a bit — not only the markers.** `Health` has one exactly as `Targetable` does. A
capability is *owning a kind*; a **marker component** is simply the case where the value carries
nothing beyond its own presence. The alternative was tried and rejected in the grill log (§1): under a
markers-only mask, `each(maskOf(Health, Poisoned))` — the shape of every rules pass — is not
expressible, and a second parameter type appears beside the first.

**The mask is two 32-bit words, and the ceiling is 64 kinds.** This is not a preference:
JavaScript's bitwise operators coerce their operands to int32, so a single `number` would be a hard
ceiling of 32, and thirteen kinds are already named across the sheets with roughly as many obvious
ones unwritten. The ceiling is checked where the vocabulary is declared and **refuses loudly**; a
sixty-fifth kind must be a failed construction and never a bit that quietly landed on another kind.

**The bit position is derived from the declaration order, and it never leaves the process.** Nothing
in this ticket may serialize a mask, print one into a domain event, or otherwise let a bit position
become durable — ENT-5 forbids it because a bit is a position in an array (ARC-10.3), and TIME-13
writes timer payloads into save files. Within one run the positions only have to be deterministic,
which the declaration gives for free.

**What is deliberately absent**, so nobody adds it on the way past: no registry of kinds discovered at
runtime, no growing mask, no `BigInt`, no `Uint32Array` view handed to a caller. A mask value is
small, frozen and copied by value, and building one for a query is something a caller does once at
module init rather than per call.

The sheet is [`docs/services/entity-registry.md`](../../../docs/services/entity-registry.md) and it is
normative — ENT-3, ENT-5, ENT-17. The spec is
[`docs/specs/ent-entity-registry.md`](../../../docs/specs/ent-entity-registry.md), and the reasoning
behind the shape is in the [grill log](../grill-log.md), §§1–3.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A vocabulary of N kinds gives each kind a distinct bit, and the same declaration gives the same
      bits every time
- [ ] `maskOf()` with no kinds is the empty mask; `maskOf(k)` contains `k` and nothing else
- [ ] `maskOf(a, b)` contains `a`, contains `b`, and equals `maskOf(b, a)` — order of arguments is not
      meaning
- [ ] `hasAll` requires **every** bit of the required mask, not any: a mask of one kind does not
      satisfy a requirement of two
- [ ] `hasAll(m, emptyMask)` is true for every `m`, including the empty mask
- [ ] Kinds on both sides of the 32-bit word boundary behave identically — a mask combining the 5th
      and the 40th kind contains both, and contains neither the 4th nor the 41st
- [ ] The 64th kind is usable; the 65th is refused at declaration with a message naming the ceiling
- [ ] A duplicated kind in the declaration is refused, with a message naming the duplicate
- [ ] An empty vocabulary is refused
- [ ] A kind that was never declared cannot be asked for a bit, and the refusal says so
- [ ] Building a mask and testing it allocates nothing per call
- [ ] `CapabilityMask` is opaque at the type level: a plain `number`, and a bare `{ lo, hi }` object
      literal from outside, are not assignable to it
- [ ] Nothing in this ticket serializes a mask or writes a bit position anywhere durable
- [ ] The module imports nothing — not `excalibur`, not another service, nothing from `game/` or
      `presentation/`
- [ ] Every test enters through the service's public door; none names an internal module
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

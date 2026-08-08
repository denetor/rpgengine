# 06 — The reusability proof: a registry for somebody else's game

**What to build:** the executable verification that `ENT` is *generic* — the whole public surface
exercised with a vocabulary and archetypes invented for the test, belonging to a game this project is
not. Without it, "generic" is a claim in a header field (ARC-3.4).

The invented domain must be **plainly foreign**: not fantasy, not combat, nothing that could be
mistaken for a rehearsal of this game's model. `TIME`'s proof and `RND`'s set the tone — pick a
domain with its own nouns, and let the component kinds be things this game would never own. An
orchard, a print shop, a railway: kinds like `Ripens`, `Inked`, `Coupled`, and markers like
`Harvestable` or `Shuntable`. If a reader could not tell from the test file which game the engine
ships with, the proof has done its job.

**What it must actually exercise**, because a proof that only spawns proves very little: the
construction with a foreign vocabulary, spawning from foreign component sets with overrides, adding
and removing kinds at runtime, iterating by capability and checking the order, despawning, and a full
serialize-and-restore round trip. Every promise the sheet makes, made to a stranger.

**The one thing it must fail on**, and the reason this ticket comes last: if any assertion here needs
the registry to know something about *this* game — a kind it recognises, an archetype it treats
specially, a default it supplies — that is a defect in the service and not in the test. The proof is
the place where such a leak surfaces, and it surfaces as a test that cannot be written.

Worth stating because it is easy to get backwards: the proof is about the **headless service**. The
scene in ticket 05 adds nothing to it, which is why this ticket does not wait for step 4 to be
demonstrated.

The sheet is [`docs/services/entity-registry.md`](../../../docs/services/entity-registry.md) — ENT-16
and the test criteria — and ARC-3.4 in [`REQUIREMENTS.md`](../../../docs/REQUIREMENTS.md). Prior art
is the reusability spec of `TIME` and of `RND`.

**Blocked by:** 03 — the save door (the proof covers the whole surface, serialization included).

**Status:** ready-for-agent

- [ ] The test declares a vocabulary of component kinds belonging to an invented domain, with no
      overlap with this game's
- [ ] The invented domain includes at least one marker kind and one kind carrying data
- [ ] A registry is constructed with that vocabulary and a table of invented component sets
- [ ] Entities are spawned from those component sets, with and without overrides, and own what was
      declared
- [ ] Kinds are added and removed at runtime, and the capability mask follows
- [ ] Iteration by capability returns the right entities in ascending id order
- [ ] Despawning behaves as it does for this game: the id is not reused, the mask is all-zero, nothing
      throws
- [ ] A populated invented world survives a serialize-and-restore round trip unchanged, ids included
- [ ] The refusals behave the same for a stranger: unknown archetype, override naming an undeclared
      kind, empty component set, duplicate kind
- [ ] Nothing in the engine names a kind of this game, and the test needs no special case to pass
- [ ] The test enters through the service's public door only
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

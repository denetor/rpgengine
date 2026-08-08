# 02 — The registry: identity, components, iteration

**What to build:** the service itself, headless, for the path every other service walks. Things
exist: a caller spawns one from a component set and gets back an identity, reads and changes what it
owns, asks what it is capable of, and walks every entity owning a given set of kinds — in an order
that two runs of the same game agree on.

`createEntityRegistry({ kinds, componentSets })` receives the game's ordered vocabulary and a **flat**
table `ArchetypeId → ComponentSet`. It knows no kind by name and no archetype by meaning. Composition
of archetypes was resolved before it existed (ENT-8) and is not this service's business; in this
ticket the table is built by the test.

Commands return the domain events they produce and **publish nothing** (ARC-4.2): what comes back is
the caller's to publish, and here the caller is a test.

The four properties that are cheap now and unrecoverable later, and that are therefore the point of
the ticket:

- **The id is the identity *and* the storage slot.** Ids are allocated strictly increasing and never
  reused, which makes `id − base` a dense index. Spawn appends, despawn clears, and **the store is
  never compacted or renumbered** — not as an optimisation, but because entities reference each other
  by `EntityId` stored inside their own components, which are opaque plain data to this service. It
  cannot rewrite them, so a renumbering would silently repoint every cross-reference. This is
  [ADR-0005](../../../docs/adr/0005-the-entity-id-is-the-storage-slot.md), and it also closes off a
  generational index for the same reason.
- **Iteration is in ascending `EntityId` order, and that is the whole of the determinism rule.**
  Because ids only grow and nothing ever moves, the order cannot depend on the history of creation and
  destruction (ARC-9.4). There is **no** requirement that iteration narrow to the rarest required
  kind: `each` is called by a handful of rules passes per tick, not by every agent, and the quadratic
  disaster `SPX` exists to prevent is a different shape of problem. An earlier draft asked for the
  narrowing and it was deleted, not weakened — do not reintroduce it.
- **Storage and iteration are two structures, and the split is not optional.** The slot store holds
  identity-by-position and must never move. Iteration walks a **separate packed list of live ids in
  ascending order**, which may be compacted freely because it holds ids rather than positions, so
  moving an entry there changes nothing observable. Compaction is amortized and must never happen per
  despawn. This cannot be bolted on afterwards without rewriting `each`, which is why it lives here
  and not in a ticket of its own.
- **A spawn is one event.** `spawn` emits a single `entity-spawned` carrying the `EntityId` and the
  `ArchetypeId` — not one `component-added` per component, which would turn the loading of an area
  into a storm, and **not the capability mask**, which would put a bit position on a path that ends in
  a save file (ENT-5). Whoever needs the capabilities calls `capabilities(id)`: the entity exists by
  the time anyone reads the event.

`overrides` at spawn **replaces** the whole value of a kind the component set already declares and
**cannot introduce one it does not**. A spawned entity's mask is therefore always its component set's
mask, which is what keeps the shapes that exist in the game readable in the content. A guard who is
also a merchant is an archetype, not an override.

**What is deliberately absent:** no systems, no tick, no scheduler, no query language, no lookup by
name, no notion of a player, and no game logic of any kind — no damage, no death, no targeting. The
registry stores and returns data; the rules receive components as arguments (ARC-4.1). There is also
no `has(id, kind)` as a second concept: asking is a mask test, and there is one query concept rather
than two.

The sheet is [`docs/services/entity-registry.md`](../../../docs/services/entity-registry.md) and it is
normative — ENT-1, ENT-2, ENT-4, ENT-6, ENT-13, ENT-14, ENT-17, ENT-18. The spec is
[`docs/specs/ent-entity-registry.md`](../../../docs/specs/ent-entity-registry.md); the rejected
alternatives are in the [grill log](../grill-log.md), §§4, 7, 8, 10.

**Blocked by:** 01 — the vocabulary and the mask (there is nothing to ask an entity about without it,
and the per-entity mask is built from those bits).

**Status:** ready-for-agent

- [ ] Spawning from a component set returns a new id and the entity owns exactly that set's kinds
- [ ] Ids are strictly increasing within one registry's life and are never reused, including after a
      despawn
- [ ] A despawned id is not alive, yields `undefined` from `get`, an all-zero mask from
      `capabilities`, and **does not throw**
- [ ] An all-zero mask means "not alive" and nothing else: an empty component set is refused at
      construction, so a live entity always owns something
- [ ] `get` returns the component value the component set declared, and the override where one was
      given
- [ ] `add` gives an entity a kind it did not own, `remove` takes one away, and each moves exactly one
      bit of that entity's mask
- [ ] `add` on a kind already owned, and `remove` on a kind not owned, behave predictably and say so
      in what they return
- [ ] Every `add` and `remove` returns exactly one `component-added` / `component-removed`, and
      publishes nothing
- [ ] `spawn` returns exactly one `entity-spawned`; an archetype with N components does **not** return
      N + 1 events
- [ ] The `entity-spawned` payload carries the id and the archetype and **contains no mask**
- [ ] `despawn` returns exactly one `entity-despawned`
- [ ] `each` visits every live entity owning **all** the required kinds, and no others
- [ ] `each` visits in ascending `EntityId` order
- [ ] Two registries fed the same spawns but different histories of despawning visit the same
      survivors in the same order
- [ ] `each` with an empty required mask visits every live entity, in the same order
- [ ] Adding a component makes an entity appear in an `each` that previously skipped it; removing one
      makes it disappear
- [ ] Despawning during an `each` does not corrupt the walk, and the contract for whether the visit
      sees it is stated and tested
- [ ] `capabilities` on a live entity equals the mask of the kinds it owns, and does not allocate
- [ ] An `overrides` naming a kind the component set does not declare is refused, with a message
      naming the kind
- [ ] An override replaces the whole value of its kind; the entity's mask is unchanged by it
- [ ] An unknown `ArchetypeId` is refused with a message naming it
- [ ] A component set declaring no kinds is refused at construction
- [ ] Churn: after 10⁵ spawn-despawn cycles, an `each` costs in proportion to the entities alive, not
      to the ids ever allocated
- [ ] Hundreds of spawns and despawns in one batch trigger no per-despawn reorganization
- [ ] Two registries in one process do not observe each other (this service's half of ARC-8.3)
- [ ] `EntityId` is opaque at the type level: a plain `number` is not assignable to it
- [ ] The service imports nothing — not `excalibur`, not another service, nothing from `game/` or
      `presentation/` — and reads no clock and no global
- [ ] No test names an internal module, reaches for a slot, an ordinal or the iteration list: the
      storage of ADR-0005 must stay free to change
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

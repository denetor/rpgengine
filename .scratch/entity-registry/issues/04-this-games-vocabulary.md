# 04 — This game's vocabulary, and the registry inside the `GameContext`

**What to build:** the first entities this game actually owns. `game/` declares its own component
kinds, the bootstrap builds the registry with them and with the game's component sets, and the
`GameContext` hands the whole graph out — including the player, reachable by a stable reference and
never by scanning the world.

This is CTX-13 in practice, and the **order** is the substance of the ticket:

```
game/ declares the kinds  →  the content is validated and flattened against them
                          →  createGameContext  →  createEntityRegistry
```

A content file naming a component kind that does not exist therefore fails **while loading**, before
the context is built — which is where CTX-10 says a thing must fail, not at the first spawn hours
into a session.

**The vocabulary is code, not content, and it is imported rather than passed.** TypeScript types
cannot be produced from a JSON file at runtime: a vocabulary loaded from content would collapse the
typed `get`/`add` to `unknown` and push a type assertion onto every caller, which is the opposite of
what a branded `EntityId` is for. The kinds are the **schema** content is written in; the archetypes
stay data, so ARC-7.1 is untouched. And `createGameContext` imports the list rather than taking it as
an option, because it is not loaded, not configurable and not per-context — an option that can hold
only one value is a hook for a need that does not exist.

Two things this must not become. It must not make `ENT` less generic: the registry receives the
vocabulary as an argument and still knows no kind by name, which is exactly what ticket 06 proves. And
a frozen list of kind names is **not** the module-level service instance CTX-3 forbids — that
prohibition is about mutable state reached by importing it, and this is a constant the type system
reads too.

**The player is a well-known id held by the context** (CTX-12), established when the context is built
or when a save is loaded. Nothing may find the player by iterating the registry looking for a marker.
A well-known id refers to a live entity for the whole life of the context: a dead player is an entity
that has gained the components of death, not one that has been despawned.

**A starter vocabulary, kept honest.** Declare only the kinds the scene in ticket 05 needs to
demonstrate ARC-6.4 — a couple carrying data, a couple that are pure markers. The catalogue's full
list is not this ticket's job, and a vocabulary padded with kinds nothing uses is a vocabulary nobody
will prune.

**What is deliberately absent:** no rules, no systems, no combat, no interaction menu. The context
gains a registry and a player id; what anyone *does* with them is a later step.

The sheets are [`game-context.md`](../../../docs/services/game-context.md) (CTX-12, CTX-13) and
[`entity-registry.md`](../../../docs/services/entity-registry.md) (ENT-16), both normative. The spec is
[`docs/specs/ent-entity-registry.md`](../../../docs/specs/ent-entity-registry.md); the reasoning is in
the [grill log](../grill-log.md) §9.

**Blocked by:** 02 — the registry (there is nothing to put in the context); 03 — the save door
(`createGameContext` accepts a save, and cannot restore what the registry cannot).

**Status:** ready-for-agent

- [ ] `game/` declares an ordered list of component kinds, with at least one carrying data and one
      pure marker
- [ ] `createGameContext` imports that list; it is **not** an option of the factory
- [ ] The context exposes the registry, built with the game's vocabulary and component sets
- [ ] The context exposes `playerId`, established at construction and referring to a live entity
- [ ] `playerId` is also correct right after constructing a context from a save
- [ ] No code path reaches the player by iterating the registry or searching for a marker
- [ ] Content naming a component kind absent from the vocabulary fails while loading, before
      `createGameContext` is reached, with a message naming the file and the kind
- [ ] Archetype composition is resolved before construction: what the registry receives is a flat
      table, and nothing at runtime can ask what an archetype derives from
- [ ] Two archetypes sharing a base resolve to the same values for the components they share
- [ ] Two independent contexts can be created in one process without observing each other (CTX-4)
- [ ] `dispose()` releases the registry with the rest, and the context reacts to nothing afterwards
- [ ] The context serializes the registry's portion alongside the clock's, and a context built from
      that state has the same entities (CTX-9)
- [ ] The context is constructible headless, with no renderer and no canvas (CTX-7)
- [ ] No service instance is exported at module level; the kind list is a frozen constant and not
      mutable state (CTX-3)
- [ ] `ENT` still knows no kind by name: nothing in the engine names `Health` or any other kind
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

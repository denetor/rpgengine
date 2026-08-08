# Spec — `ENT`, the entity and component registry

**Service:** `ENT` · **Priority:** 1 · **Sheet:** [`services/entity-registry.md`](../services/entity-registry.md)
**Requirements:** ARC-6.1…6.5, ARC-5.2, ARC-5.3, ARC-9.4, ARC-10.2…10.4, ARC-7.1, ARC-7.2, ARC-4.1,
ARC-4.2, ARC-3.4, ARC-13.1 · **Step:** 4 of the plan in [`REQUIREMENTS.md`](../REQUIREMENTS.md)
**ADR:** [`0005`](../adr/0005-the-entity-id-is-the-storage-slot.md) — the id is the storage slot
**Grill log:** [`.scratch/entity-registry/grill-log.md`](../../.scratch/entity-registry/grill-log.md)

## Problem Statement

Nothing in this engine can say that something *exists*. The clock can defer a fact, the bus can
deliver one, the random service can decide one — and none of them has anything to decide it about.
Every sheet written so far names entities as if a registry were already there: combat resolves damage
against an `EntityId`, factions hold a standing towards one, the spatial index stores their positions,
the renderer maps them to `Actor`s, quests watch them die. Twelve sheets take an `EntityId` in their
signatures. The thing that issues one does not exist.

Building it late is not the risk. Building it as a class hierarchy is, and the pull towards one is
strong precisely because it feels natural: an `Npc` class, a `Chest` class, an `Item` class, and by
the time there is a merchant who fights and a friendly slime, the branches have to be cut apart
again. That is the failure the previous version of this project documented, and ARC-6 exists to
forbid it. But ARC-6 is a principle, and a principle without a service is an intention. Five
decisions are settled by this one piece of infrastructure, and every one of them is paid for by
everything written afterwards:

1. **What an entity's identity is.** Every service already stores `EntityId`s, and the entities
   reference each other by id *inside their own components*. Whether an id can be reused, and whether
   it can be renumbered, is decided at the first `spawn()` and is unrecoverable afterwards — because
   by then the ids are in save files, in blackboards, in quest state and in timers that have not come
   due yet.
2. **How an interaction decides who may take part.** Either the answer is "it owns the component"
   (ARC-6.2), efficiently and from one place, or every service grows its own way of asking, and the
   contextual interaction menu of the HUD ends up as a hardwired list of cases.
3. **Whether the same game twice means the same thing.** Every rules pass iterates entities. If the
   order of that iteration depends on the order of creation and destruction, the simulation is not
   reproducible (ARC-9.4), and it fails silently: the game runs, the replay diverges, nothing points
   at the cause.
4. **What a save contains.** The registry holds the largest share of dynamic state in the project.
   Whether an entity comes back as it was written, or is re-derived from content that may have
   changed, is a promise made to the player and to every migration written later.
5. **Whether the engine stays generic.** `ENT` is the first service that must handle *this game's*
   vocabulary — `Health`, `Faction`, `Lockable` — without knowing a word of it. Get that wrong and
   the engine ships with this game and no other, which is what ARC-3 exists to prevent.

None of the five is a performance problem. They are the same problem seen five times: the registry
decides what an entity *is*, and it decides it before any entity exists.

## Solution

A service `ENT` — **generic**, with no knowledge of this game — that is a map from an `EntityId` to a
set of plain-data components, plus one index over that map, behind a surface small enough to describe
in a sentence: **it stores what an entity owns, and it tells you who owns what.**

- **The id is the identity and the storage.** Ids are allocated strictly increasing and never reused,
  which makes `id − base` a dense index into the store. Spawn appends, despawn clears, iteration walks
  in ascending id order — so the deterministic order of ARC-9.4 costs nothing and cannot break,
  because nothing ever moves. The store is never renumbered, and
  [ADR-0005](../adr/0005-the-entity-id-is-the-storage-slot.md) records why that door is closed rather
  than merely unopened.
- **A capability is owning a kind.** Every `ComponentKind` has a bit in a 64-bit `CapabilityMask`.
  There is one query concept, not two: `SPX` filters on the same mask `ENT` computes, so an NPC
  looking for targets never receives decorative elements to discard. The mask is derived and never
  serialized — a bit is a position in an array, and ARC-10.3 forbids dynamic state from depending on
  one.
- **The vocabulary belongs to the game.** The registry knows no kind by name. The game declares an
  ordered list of kinds at compile time and hands it over at construction, which is what keeps `get`
  and `add` typed and what makes the reusability proof writable: the same registry, given an invented
  vocabulary, runs a foreign game.
- **Archetypes are authoring, component sets are runtime.** Composition and overriding are resolved
  where the content is validated, before the registry exists. What reaches the service is a flat
  table, and no archetype relation survives into the running game — otherwise the class hierarchy of
  ARC-6.1 would have re-entered through the data.
- **It publishes nothing and decides nothing.** Commands return the domain events they produce
  (ARC-4.2); the orchestration publishes them. No damage is computed here, no attacker is chosen. The
  rules services receive components as arguments.

## User Stories

### The developer writing the game's rules

1. As a developer writing a rules service, I want to receive components as plain values, so that my
   logic is a pure function I can test without a registry at all.
2. As a developer writing a rules pass, I want to iterate every entity owning a given set of kinds,
   so that I can apply a rule without knowing which archetypes exist.
3. As a developer writing a rules pass, I want that iteration to be in a defined order, so that two
   runs of the same game produce the same result.
4. As a developer writing a rules pass, I want that order to be independent of the order in which
   entities were created and destroyed, so that a replay does not diverge because an NPC died earlier.
5. As a developer writing a rules pass, I want to read a component by kind and get back a typed
   value, so that I do not write a type assertion at every call site.
6. As a developer, I want reading a component of a dead entity to return nothing rather than throw,
   so that a rule holding an id from last tick is a no-op and not a crash.
7. As a developer writing combat, I want to make a peaceful NPC hostile by adding a component, so
   that "a merchant who can fight" needs no new branch anywhere.
8. As a developer writing the lockpicking rule, I want a picked chest to lose `Lockable`, so that the
   world stops offering an interaction that no longer applies without anyone maintaining a list.
9. As a developer, I want every component added or removed to produce a domain event, so that the
   spatial index and the presentation update themselves rather than being told.
10. As a developer, I want commands to hand me the events they produced instead of publishing them,
    so that the orchestration stays the only thing that publishes.
11. As a developer, I want an entity to reference another only by id, so that a dangling reference is
    detectable and a cycle cannot block a save.

### The designer writing content

12. As a designer, I want to define an NPC as a list of components with initial values in a file, so
    that I do not need a programmer to add an enemy.
13. As a designer, I want to compose an archetype from others — a guard is a humanoid, a fighter, and
    a member of the guards — so that I do not duplicate definitions.
14. As a designer, I want to override single values when composing, so that two variants of the same
    creature are two short files rather than two long ones.
15. As a designer, I want a file naming a component kind that does not exist to fail when the game
    loads, so that I find my typo immediately rather than at the first spawn hours later.
16. As a designer, I want an archetype that declares no components to be refused, so that a file I
    half-wrote does not produce entities that silently take part in nothing.
17. As a designer, I want to add an interaction to an object by marking it — a barrel becomes
    targetable, a bench sittable — so that participation is a declaration and not a class.
18. As a designer, I want to change content without recompiling the game, so that balancing is my
    work and not a build.

### The developer of `SPX`, `REN` and the other consumers

19. As the developer of the spatial index, I want to receive an entity's capabilities as a bitmask, so
    that I can filter inside the index instead of handing back elements the caller discards.
20. As the developer of the spatial index, I want that mask to be the one `ENT` already computes, so
    that there is not a second tag vocabulary of my own to keep aligned.
21. As the developer of the spatial index, I want to be told when an entity's capabilities change, so
    that my stored mask does not go stale.
22. As the developer of the renderer, I want an event when an entity is spawned, so that I create an
    `Actor` in reaction rather than inventing entities of my own.
23. As the developer of the renderer, I want an event when an entity is despawned, so that no `Actor`
    outlives what it was drawing.
24. As the developer of the renderer, I want the spawn of an archetype with many components to be one
    event and not one per component, so that loading an area does not flood the bus.
25. As the developer of the AI, I want to ask what an entity is capable of without scanning the world,
    so that perception costs what the area costs and not what the world costs.

### The developer of the engine

26. As an engine developer, I want the registry to know no component kind by name, so that it is
    reusable in another game.
27. As an engine developer, I want to prove that reusability with a test that runs the registry on an
    invented vocabulary, so that "generic" is verified and not claimed.
28. As an engine developer, I want the registry to hold no game logic, so that the boundary between
    storage and rules stays where ARC-4.1 puts it.
29. As an engine developer, I want the registry to import nothing — not `excalibur`, not another
    service — so that it runs headless and the boundary check confirms it.
30. As an engine developer, I want spawning and despawning hundreds of entities in one frame to cost
    what it costs and not trigger a reorganization, so that loading an area does not stutter.
31. As an engine developer, I want a ceiling on the vocabulary that fails loudly at construction, so
    that the 65th kind is a refused start and not a bit that silently landed on another kind.
32. As an engine developer, I want queries not to allocate per call, so that a rules pass running
    every tick does not feed the garbage collector.

### The developer of the game's bootstrap

33. As the developer of the bootstrap, I want to build the registry in one explicit place with the
    rest of the graph, so that there is no singleton to import from deep inside.
34. As the developer of the bootstrap, I want to hand the registry the game's vocabulary and its
    component sets, so that the engine stays ignorant of both.
35. As the developer of the bootstrap, I want content validated before the registry exists, so that
    the registry is never partially valid.
36. As the developer of the bootstrap, I want two independent registries to be constructible in one
    process, so that a test can hold two worlds without them observing each other.
37. As the developer of the bootstrap, I want the player's id held explicitly, so that nothing reaches
    the player by scanning the world for a marker.

### The player, through whoever implements the save

38. As a player, I want my world to come back exactly as I left it, so that reloading is not a subtly
    different game.
39. As a player, I want a game patched between my save and my reload not to mutate the characters
    already in my world, so that an update does not rewrite my playthrough behind my back.
40. As a player, I want unique things to stay unique across a save, so that an id cannot come back
    meaning something else.
41. As whoever implements `SAVE`, I want each entity to record what it was spawned from, so that a
    migration can reach every entity of one kind without guessing.
42. As whoever implements `SAVE`, I want the registry to serialize only its own dynamic state with a
    version of its own, so that migrations stay local.

### The developer debugging, and the testbed

43. As a developer debugging, I want to open a save and see what an entity was spawned from, so that I
    can tell an entity's origin without reconstructing it.
44. As a developer at step 4, I want a testbed scene that spawns entities and adds and removes
    components live, so that the step is demonstrated through the presentation as §7.2 requires.
45. As a developer at step 4, I want that scene to show capabilities changing as components change, so
    that ARC-6.4 is visible rather than asserted.

## Implementation Decisions

### Modules

A new service family opens: `world`, mirroring the *World* section of the catalogue, with
`entity-registry` as its first service. The internal split follows the shape of `TIME` and `RND` —
one module per concern, one public surface, and nothing outside that surface visible to the project
(ARC-2.1):

- the **public surface**, exporting the factory, the restore factory, the state version, the mask
  helpers and the types;
- the **vocabulary**, which turns the game's ordered kind list into bit positions and validates it;
- the **mask**, holding the two-word representation and its operations;
- the **store**, holding the slot-indexed component columns, the per-entity masks and the id counter;
- the **iteration list**, the packed ascending list of live ids and its compaction;
- the **spawn path**, resolving a component set plus overrides into a new entity;
- the **serialization**, with its own version, and the restore factory.

### Public contract

```ts
type EntityId = number & { readonly __brand: 'EntityId' };

interface CapabilityMask {
  readonly lo: number;
  readonly hi: number;
}

function capabilityBit(kind: ComponentKind): CapabilityMask;
function maskOf(...kinds: readonly ComponentKind[]): CapabilityMask;
function hasAll(mask: CapabilityMask, required: CapabilityMask): boolean;

interface EntityRegistry {
  spawn(archetype: ArchetypeId, overrides?: Partial<ComponentSet>): CommandResult<EntityId>;
  despawn(id: EntityId): CommandResult<void>;
  isAlive(id: EntityId): boolean;

  get<C extends ComponentKind>(id: EntityId, kind: C): ComponentOf<C> | undefined;
  add<C extends ComponentKind>(id: EntityId, kind: C, value: ComponentOf<C>): CommandResult<void>;
  remove(id: EntityId, kind: ComponentKind): CommandResult<void>;

  capabilities(id: EntityId): CapabilityMask;
  each(required: CapabilityMask, visit: (id: EntityId) => void): void;

  serialize(): EntityState;
}

function createEntityRegistry(options: {
  kinds: readonly ComponentKind[];
  componentSets: ReadonlyMap<ArchetypeId, ComponentSet>;
}): EntityRegistry;
```

`restoreEntityRegistry` is a **factory** and deliberately not a method that reloads a live registry:
a registry that could be reloaded would briefly hold one game's entities and another's id counter,
and every `EntityId` handed out before it would point at a stranger (the same reasoning as
`restoreClock`, CTX-9).

### Identity and storage

Ids are allocated from a strictly increasing counter and never reused, including across a save and
reload. There is no generational variant: at ~10³ live entities per area a plain counter outlives any
campaign, and choosing one scheme is what lets the id double as the storage slot.

`id − base` indexes the store directly. Spawn appends, despawn clears the entity's mask, and **the
store is never compacted or renumbered.** The reason is not cost: entities reference each other by
`EntityId` stored inside their own components, which are opaque plain data to this service, so the
registry cannot rewrite them and a renumbering would silently repoint every cross-reference. This is
ADR-0005, and it also closes off a generational index for the same reason.

Because the span grows with churn rather than with the live population, iteration does not walk the
slots. It walks a **separate packed list of live ids in ascending order**, which may be compacted
freely — it holds ids, not identity-by-position, so moving an entry there changes nothing observable.
Compaction is amortized and never happens per despawn.

### Capabilities and the mask

One bit per `ComponentKind`, the bit being the kind's position in the game's declaration. `Health`
has a bit exactly as `Targetable` does: a capability is owning a kind, and a **marker component** is
the case where the value carries nothing beyond its own presence.

The mask is two 32-bit words, because JavaScript's bitwise operators coerce to int32 — so the
vocabulary is capped at 64 kinds and the cap is validated at construction. `capabilities(id)` returns
the frozen object the registry already holds, so the call does not allocate.

**The mask must not cross a serialization boundary.** It appears in no domain event, no save file and
no persisted form. A bit position is a position in an array, which ARC-10.3 forbids dynamic state
from depending on, and the route into a save is real: TIME-6 lets any member of the domain event
union be a timer payload, and TIME-13 writes pending timers with their payloads into the save. A mask
in an event is therefore a mask in a save, and a save read back after content reordered a kind would
mean different capabilities with nothing to fail on. Crossing a **service** boundary in-process is a
different thing and is what the mask is for: the orchestration reads it here and hands it to
`SPX.insert`.

### The vocabulary and the component sets

The registry knows no kind by name. The game declares an **ordered** list of kinds as a compile-time
declaration and the bootstrap hands it over; TypeScript types cannot be produced from a content file
at runtime, and a vocabulary loaded from JSON would collapse `ComponentOf<C>` to `unknown` and push a
type assertion onto every caller. The kinds are the **schema** content is written in, not content
itself, so archetypes stay data and ARC-7.1 is untouched.

Validation happens before the registry exists, on three points: at most 64 kinds, no duplicate kind,
and no empty component set. The third is what makes an all-zero mask mean *"not alive"* and nothing
else, so `isAlive` is that test rather than a second state to keep aligned with it.

Archetype composition and overriding are resolved by the content loader, against that same
vocabulary. What reaches the registry is a flat `ArchetypeId → ComponentSet` table, and the registry
must not know that archetypes derive from one another. The two words are distinct on purpose: the
**archetype** is what a designer writes, the **component set** is what it resolves to.

### Spawn, despawn and events

`spawn` emits one `entity-spawned` carrying the `EntityId` and the `ArchetypeId` — not one
`component-added` per component, and not the mask. Whoever needs capabilities calls `capabilities(id)`;
the entity exists by the time anyone reads the event. `despawn` emits `entity-despawned`. The
component events describe changes to an entity that already exists.

`overrides` replaces the whole value of a kind the component set already declares and **cannot
introduce one it does not**. A spawned entity's mask is therefore always its component set's mask: the
shapes that exist in the game stay readable in the content, and the saved `ArchetypeId` genuinely
describes the entity it names. A guard who is also a merchant is an archetype, not an override.

### Save and restore

Each live entity is serialized in full — component values plus originating `ArchetypeId` — with the
registry's own state version. There is no delta encoding against the component set's initial values:
at this order of magnitude it buys nothing and costs a second representation to keep correct.

Loading restores what was written and **must not** re-derive an entity from the current component
set. A save reads back what it wrote; a component added to `guard` after the save appears only on
guards spawned afterwards. The archetype id is kept as provenance — for reading a save, and as the
handle a `SAVE` migration needs to reach every entity of one kind. Content drift is a migration's job,
not a load-time surprise.

### Decisions taken deliberately against the obvious alternative

| Obvious | Chosen | Because |
|---|---|---|
| One dense array per kind, so iteration narrows to the rarest kind | One store indexed by id, iteration tests the mask | `each` is called by a handful of rules passes per tick, not by every agent; the quadratic disaster `SPX` prevents is a different shape. Narrowing costs a position map, a tombstone density and a compaction policy **per kind** |
| Generational index, so slots can be reused | Ids never reused, span never reclaimed | The version would have to be readable inside opaque component data (ADR-0005) |
| The capability mask travels in the spawn event | The event carries ids only | A bit position reaching a save file (ARC-10.3, via TIME-13) |
| Only marker kinds get a bit | Every kind gets a bit | Otherwise `each(maskOf(Health, Poisoned))` is not expressible and a second parameter type appears |
| Kinds declared in a content file | Kinds declared in `game/` as types | `get` and `add` would return `unknown` |
| Save deltas against the archetype | Save in full | "Where it is worthwhile" is not testable, and overlaying requires distinguishing "untouched" from "deliberately equal" |
| `overrides` may add a kind | Replace only | The set of shapes in the game would stop being inspectable in the content |

### Changes to other sheets

Already applied in the same session as this spec: `spatial-index.md` (`TagMask` → `CapabilityMask`,
`updateTags` → `updateCapabilities`, SPX-2 and SPX-7 reworded), `game-context.md` (CTX-12, the
well-known ids; CTX-13, the vocabulary and the order of construction), `CONTEXT.md` (four glossary
entries), `REQUIREMENTS.md` (the ADR index).

## Testing Decisions

### What makes a good test here

A test of this service tests **what a caller can observe**, and nothing else. The slot arithmetic, the
iteration list, the tombstone density, the compaction threshold and the bit positions are exactly the
choices ADR-0005 must leave free: a test that read them would freeze the design that the ADR spent its
argument justifying. This mirrors what `TIME`'s suite already states about its own queue — every test
enters through the public surface, and nothing reaches for the internals.

Determinism is tested as **agreement between two runs**, not as agreement with a recorded snapshot.
Two registries fed different histories of creation and destruction must iterate the same live
entities in the same order; that is a property, and it survives a refactor that a golden file would
break for no reason.

### The seam

**One seam: the service's public surface.** Every unit test constructs a registry through
`createEntityRegistry` (or `restoreEntityRegistry`) and asserts on what commands return, what
`get`/`capabilities`/`each` report, and what events come back. Spec files are named by **concern**,
not by module, as `TIME`'s are — identity, capabilities, components, spawn, refusals, serialization,
churn, reusability.

Two existing seams are reused and no new ones are added:

- the **testbed scene** `entities`, registered in the explicit scene registry and driven by the
  existing Playwright suite by `?scene=entities`, which is how §7.2 step 4 is demonstrated;
- the **boundary check**, which picks up the new service folder automatically once it sits two levels
  below `engine/`, confirming that it imports neither `excalibur` nor another service.

The resolution of archetypes into component sets is deliberately **not** a seam of this service: it
happens in the content loader, before construction, and belongs to whatever spec covers content
loading.

### What gets tested

- **Identity** — ids strictly increasing; a despawned id never reappears; a dead id yields
  `undefined`, an all-zero mask and no throw; two registries in one process do not observe each other.
- **Capabilities** — a spawned entity's mask is its component set's mask; adding and removing a
  component moves exactly one bit and emits exactly one event; `hasAll` agrees with `get` for every
  kind.
- **Iteration** — ascending id order; two runs whose creation and destruction histories differ visit
  the same entities in the same order; a mask requiring several kinds visits only entities owning all
  of them; iteration does not allocate.
- **Spawn and events** — an archetype with N components emits one `entity-spawned` and not N + 1; the
  payload contains no mask; `entity-despawned` accompanies every despawn.
- **Refusals** — 65 kinds, a duplicated kind, an empty component set, an unknown archetype, and an
  `overrides` naming a kind the component set does not declare: each refused, at construction or at
  the call, with a diagnostic naming what was wrong.
- **Serialization** — round trip on a populated world; ids preserved across it; a world reloaded
  after a component set gained a kind comes back unchanged; the state carries its own version.
- **Churn** — 10⁵ spawn-despawn cycles leave iteration proportional to the live entities rather than
  to the ids allocated, which is the property the split between store and iteration list exists to
  provide.
- **Reusability proof** (ARC-3.4) — the whole surface exercised with an invented vocabulary and
  invented archetypes, foreign to this game.

### Prior art

`src/engine/core/time/` is the closest model and should be read first: specs named by concern, all
entering through `./index`, a `reusability.spec.ts` that runs the service on a made-up domain, a
`serialization.spec.ts` covering the round trip and the version, a `refusals.spec.ts` for the
diagnostics, and an `independence.spec.ts` for two instances in one process. `src/engine/core/random/`
adds the pattern for a service whose state is large. The boundary meta test in `tests-headless/` and
the Playwright testbed suite in `tests/` are used as they are.

## Out of Scope

- **Systems and scheduling.** This is a data registry, not an ECS engine. Nothing here runs logic over
  entities on a tick; the rules passes live in the rules services and the orchestration drives them.
- **Archetype composition.** Resolving `guard` = `humanoid` + `fighter` belongs to content loading and
  is specified wherever that is. This service receives the flat table.
- **The `EntityId → Actor` binding.** It lives in the presentation (REN-2), and no component here
  references an `Actor` or duplicates a fact the `Actor` owns.
- **Positions and spatial queries.** `ENT` owns the authoritative position as component data; *finding
  entities by where they are* is `SPX`, which receives the mask and stores the position itself.
- **The player.** A generic registry has no notion of one; the well-known ids are CTX-12.
- **The save file.** `ENT` serializes its own portion with its own version; slots, format and
  migrations are `SAVE`.
- **Reclaiming the id span.** Not deferred — closed. See ADR-0005.
- **More than 64 component kinds.** If it is ever reached, it is a change to the mask representation
  and to `SPX` together, not a configuration.

## Further Notes

The sheet went from 15 requirements to 11 in a simplification pass and back to 14 under grilling. The
three that returned — the vocabulary's ownership, its validation, and the semantics of `overrides` —
covered things the sheet had never said. The shortest version was not the truest one, and the arc is
recorded in the grill log so that a future reader does not mistake the additions for scope creep.

Two claims made during that session were **wrong and corrected**, and both are worth knowing before
implementing. The first: retiring ENT-10 on the grounds that the tooling enforced it — the
`dependency-cruiser` rule catches an import of `excalibur`, not a component holding a closure, and it
is ENT-11 that bites. The second: proposing that slot-span growth be handled by rebasing at an area
load — rebasing is impossible, not merely costly, and discovering that is what produced the split
between the store and the iteration list.

Step 4 has no dependencies in the plan and can be built alongside `TIME` and `MAP`. `SPX` (step 8),
`REN` (step 6) and everything in the rules tier wait on it, which is why its public contract is worth
more scrutiny than its internals: the internals are behind one surface and ADR-0005 keeps them free,
but the contract is what twelve sheets have already been written against.

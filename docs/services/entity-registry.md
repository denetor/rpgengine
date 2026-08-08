# ENT — Entity and component registry

**Area:** World · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `ENT-*`

## Purpose

To be the register of everything that exists in the game world: it assigns stable identities, holds
the **components** every entity owns and answers the question *"which entities have this
capability?"*.

It is a map from an `EntityId` to a set of plain-data components, plus one index over that map.
Nothing else. It is the service that makes principle ARC-6.2 concrete: **an entity takes part in an
interaction because it owns the relevant component, not because it belongs to a class.** An
explosive barrel, a lock, a surveillance camera and an NPC are all targetable if they have
`Targetable`. None of them inherits from `Character`.

It contains **no game logic**: it computes no damage and decides who attacks whom. It stores and
returns data; the rules services receive the components as arguments (ARC-4.1). It knows no component
by name either: the vocabulary of kinds belongs to the game and arrives at construction (ENT-16),
which is what keeps this service *generic* (ARC-3).

It is not a full ECS engine with a system scheduler: it is the **domain data registry**. The
presentation counterpart (Excalibur's ECS, the `Actor`s) is a different thing and lives on the other
side (ARC-1.3). Which fact belongs to which of the two stores is decided once, in
[`rendering.md`](./rendering.md) (REN-17): what changes the outcome of the simulation lives here,
what only changes the picture lives on the `Actor`.

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, other services |
| Consumed by | all the rules services (which receive components, not the registry), orchestration |
| Dynamic state | live entities, component values |
| Static state | the ordered kind vocabulary; **component sets**: the flat table `ArchetypeId → ComponentSet` archetypes resolve to at load (ENT-8) |
| External data | `content/entities/*.json` — archetypes for NPCs, world objects, containers |
| Events emitted | `entity-spawned` (id, archetype), `entity-despawned`, `component-added`, `component-removed` |
| Order of magnitude | ~10³ live entities per area |

## Public API (indicative)

```ts
type EntityId = number & { readonly __brand: 'EntityId' };

/** 64 bits, one per ComponentKind (ENT-5). All zero means "not alive" — see ENT-17. */
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

  /** The mask the registry already holds, returned as-is: no allocation per call. */
  capabilities(id: EntityId): CapabilityMask;

  /** Iteration by capability: the heart of ARC-6.2. Ascending EntityId order (ENT-4). */
  each(required: CapabilityMask, visit: (id: EntityId) => void): void;
}

function createEntityRegistry(options: {
  /** The game's vocabulary, in a fixed order: the position is the bit (ENT-16, ENT-17). */
  kinds: readonly ComponentKind[];
  /** Already flat: composition was resolved at load (ENT-8). */
  componentSets: ReadonlyMap<ArchetypeId, ComponentSet>;
}): EntityRegistry;
```

Asking *"does this entity have `Targetable`?"* is `hasAll(capabilities(id), targetableBit)`: there is
one query concept, not two. Fetching the components a visit needs is `get`, one call per kind — the
price of not having a variadic `each` returning a mapped tuple, and worth paying until a profile says
otherwise.

## Requirements

**ENT-1** — Every entity **MUST** be identified by an opaque `EntityId`, allocated in **strictly
increasing order and never reused**. There is no generational-index variant: at ~10³ entities per
area a plain counter outlives any campaign, and one scheme instead of two is what lets the id double
as the **storage slot** — `id − base` is a dense index, so the id *is* the position. Spawn appends,
despawn clears, and the ordering of ENT-4 costs nothing. No lookup by string name (ARC-5.2). See
[ADR-0005](../adr/0005-the-entity-id-is-the-storage-slot.md), including why the base is never rebased.

**ENT-2** — An entity **MUST** be a plain **composition of components**. Hierarchies of entity
classes **MUST NOT** exist (ARC-6.1).

**ENT-3** — A component **MUST** be usable as a **capability marker** even without data:
`Targetable`, `Lockable`, `Flammable`, `Sittable`, `Lootable`, `Talkable`. Marking is declaring to
the world that the entity takes part in that interaction (ARC-6.2).

**ENT-4** — Iteration by capability (`each`) **MUST** visit entities in **ascending `EntityId`
order**. Determinism is then a consequence of ENT-1 rather than a discipline to keep: ids only ever
grow, so the order cannot depend on the history of creation and destruction (ARC-9.4). There is no
requirement that iteration cost track the rarest required kind — `each` is called by a handful of
rules passes per tick, not by every entity, and the disaster `SPX` exists to prevent (10³ agents each
scanning 10³ entities, ARC-13.1) is a different shape of problem.

**ENT-5** — An entity's capabilities **MUST** be exposed as a **`CapabilityMask`**, so that the
spatial index can filter without querying the registry entity by entity (SPX-2). The mask is **not a
second vocabulary**: one bit per `ComponentKind`, the bit being the kind's position in the
declaration of ENT-16, so `ENT` and `SPX` filter on the same thing and the mask is derived from the
component set rather than maintained beside it. `Health` has a bit exactly as `Targetable` does — a
capability is owning a kind, not owning a marker.

The mask **MUST NOT** cross a **serialization** boundary: it **MUST NOT** appear in a domain event,
in a save file, or in any other persisted form. A bit position is a position in an array, which
ARC-10.3 forbids dynamic state from depending on, and TIME-6 lets any domain event become a timer
payload that TIME-13 writes to the save — so a mask in an event is a mask in a save, and a save read
back after the content reorders a kind would silently mean other capabilities. Crossing a **service**
boundary in-process is a different thing and is exactly what the mask is for: the orchestration reads
it here and hands it to `SPX.insert`.

**ENT-6** — Components **MUST** be addable and removable at runtime: a peaceful NPC who turns hostile
gains `Combat`; a chest that has been picked loses `Lockable`. Every such change emits the
corresponding event, so that the spatial index and the presentation update themselves (ARC-6.4). This
is the **only** way an entity gains a capability it was not spawned with (ENT-18).

**ENT-7** — **Archetypes MUST** be validated data: an NPC is a list of components with initial
values in a file, not a subclass (ARC-7.1).

**ENT-8** — Archetypes **MUST** support composition and partial overriding (`guard` = `humanoid` +
`fighter` + `faction: guards`) without duplicating the definitions, and that composition **MUST** be
resolved **at load time**, where ARC-7.2 already validates the content. What reaches the registry is
a flat table `ArchetypeId → ComponentSet`, and the registry **MUST NOT** know that archetypes derive
from one another: unresolved inheritance at runtime would be the class hierarchy of ARC-6.1
re-entering through the data. The two words are distinct on purpose — the **archetype** is what a
designer writes, the **component set** is what it resolves to and the only form this service sees.

**ENT-11** — Every component **MUST** be plain serializable data: no functions, no runtime
references, and a reference to another entity **MUST** be an `EntityId` and never a direct object
reference — which is what keeps cycles from blocking serialization and makes dangling references
detectable (ARC-10.4).

The registry serializes each live entity **in full**, with its component values and its originating
`ArchetypeId`. No delta encoding against the component set's initial values: at this order of
magnitude it buys nothing and costs a second representation to keep correct. Loading restores what
was written and **MUST NOT** re-derive an entity from the current component set: a save reads back
what it wrote, and a component added to `guard` after the save appears only on guards spawned
afterwards. The archetype id is kept as **provenance** — for reading a save, and as the handle a
`SAVE` migration needs to reach every entity of one kind (see [`persistence.md`](./persistence.md)).

**ENT-13** — Spawn and despawn **MUST** emit events: the presentation creates and destroys the
`Actor`s in reaction to them, never the other way round. `spawn` **MUST** emit **one**
`entity-spawned`, carrying the `EntityId` and the `ArchetypeId` — not one `component-added` per
component, and not the capability mask (ENT-5). Whoever needs the capabilities calls
`capabilities(id)`: the entity exists by the time anyone reads the event. The component events of
ENT-6 describe changes to an entity that already exists; emitting them during spawn would turn the
area loading of ENT-14 into an event storm.

**ENT-14** — The registry **MUST** cope with the spawning and despawning of hundreds of entities in
a frame (loading an area) without expensive reorganizations. Spawn and despawn are therefore O(1) by
construction (ENT-1); the one reorganization that exists — compacting the iteration list of
ADR-0005 — **MUST** be amortized and **MUST NOT** happen per despawn.

**ENT-16** — The registry **MUST NOT** know any component kind by name. The game declares its own
**ordered** vocabulary of kinds and hands it to `createEntityRegistry`, which derives the bit
positions from it. TypeScript types cannot be produced from a content file at runtime, and a registry
whose kinds came from JSON would return `unknown` from `get` and push a type assertion onto every
caller; the kinds are the **schema** in which content is written, not content itself, so ARC-7.1 is
untouched — archetypes stay data. This is also what makes the reusability proof writable: the same
registry, given a made-up vocabulary, runs a foreign game (ARC-3.4). Where that declaration lives and
who hands it over is [`game-context.md`](./game-context.md) CTX-13.

**ENT-17** — The vocabulary and the component sets **MUST** be validated before the registry exists
(ARC-7.2), on three points: **at most 64 kinds**, because the mask is two 32-bit words and
JavaScript's bitwise operators work on int32; **no duplicate kind** in the declaration; and **no
empty component set**, because an entity owning nothing takes part in nothing. The third is what
makes an all-zero mask mean *"not alive"* and nothing else, so `isAlive` is that test rather than a
second state to keep aligned with it.

**ENT-18** — `overrides` at spawn **MUST** replace the whole value of a kind the component set
already declares, and **MUST NOT** introduce a kind it does not. A spawned entity's mask is therefore
always its component set's mask: the shapes that exist in the game stay readable in the content, and
the saved `ArchetypeId` of ENT-11 genuinely describes the entity it names. A guard who is also a
merchant is an archetype — which is what the composition of ENT-8 is for — not an override.

### Retired requirements

Ids are stable and never reused (see [`README.md`](./README.md)), so the gaps are deliberate.

| Id | Was | Where it went |
|---|---|---|
| `ENT-9` | The registry contains no game logic | Stated in *Purpose*; it restates ARC-4.1 and was never separately testable |
| `ENT-10` | No component references an `Actor` | Merged into ENT-11, which is the requirement that actually bites: `dependency-cruiser`'s `engine-may-not-import-excalibur` catches the import, but not a component holding a closure or a plain reference to a presentation object. The other half — components not duplicating a fact the presentation owns — is REN-17 and REN-18 |
| `ENT-12` | The player reachable by a stable reference | A *generic* registry (ARC-3) has no notion of a player. Now [`game-context.md`](./game-context.md) CTX-12, which holds the well-known ids |
| `ENT-15` | Entities reference each other only by `EntityId` | Merged into ENT-11: it is the same rule seen from the serialization side |

## Test criteria

- Create 10⁴ entities with different archetypes and iterate by capability: results in ascending
  `EntityId` order, identical across two runs whose creation and destruction histories differ.
- Adding and removing a component updates the capability mask and emits exactly one event.
- Spawning an archetype with N components emits one `entity-spawned`, not N + 1 events, and the
  event's payload contains no mask.
- A removed id is never reassigned; a dead id yields `undefined`, an all-zero mask and no throw.
- Serialization round trip on a populated world; a save reloaded after a component set gained a kind
  restores the entities unchanged (ENT-11).
- Two archetypes sharing a base resolve to the same component values, and the registry exposes no
  relation between them (ENT-8).
- Construction refuses a vocabulary of 65 kinds, one with duplicates, and a component set with no
  kinds (ENT-17).
- An `overrides` naming a kind absent from the component set is refused (ENT-18).
- Churn: 10⁵ spawn-despawn cycles leave `each` proportional to the live entities, not to the ids
  allocated (ENT-14).
- The registry works with a made-up component set, foreign to this game (ARC-3.4).

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-6 (components and capabilities), ARC-5.2
  (references), ARC-10.3 (never by index)
- [`ADR-0005`](../adr/0005-the-entity-id-is-the-storage-slot.md) — the id as storage slot, and why it
  is never rebased
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-11 (interactive objects), GP-27 (quest NPCs)
- [`spatial-index.md`](./spatial-index.md) · [`affordance.md`](./affordance.md) ·
  [`rendering.md`](./rendering.md) — REN-17, the split between this registry and Excalibur's ECS

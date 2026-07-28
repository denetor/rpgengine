# ENT — Entity and component registry

**Area:** World · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `ENT-*`

## Purpose

To be the register of everything that exists in the game world: it assigns stable identities, holds
the **components** every entity owns and answers the question *"which entities have this
capability?"*.

It is the service that makes principle ARC-6.2 concrete: **an entity takes part in an interaction
because it owns the relevant component, not because it belongs to a class.** An explosive barrel, a
lock, a surveillance camera and an NPC are all targetable if they have `Targetable`. None of them
inherits from `Character`.

It is not a full ECS engine with a system scheduler: it is the **domain data registry**. The
presentation counterpart (Excalibur's ECS, the `Actor`s) is a different thing and lives on the other
side (ARC-1.3).

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, other services |
| Consumed by | all the rules services (which receive components, not the registry), orchestration |
| Dynamic state | live entities, component values |
| Static state | **archetypes**: entity definitions as sets of components with initial values |
| External data | `content/entities/*.json` — NPC archetypes, world objects, containers |
| Events emitted | `entity-spawned`, `entity-despawned`, `component-added`, `component-removed` |
| Order of magnitude | ~10³ live entities per area |

## Public API (indicative)

```ts
type EntityId = number & { readonly __brand: 'EntityId' };

interface EntityRegistry {
  spawn(archetype: ArchetypeId, overrides?: Partial<ComponentSet>): CommandResult<EntityId>;
  despawn(id: EntityId): CommandResult<void>;
  isAlive(id: EntityId): boolean;

  get<C extends ComponentKind>(id: EntityId, kind: C): ComponentOf<C> | undefined;
  has(id: EntityId, kind: ComponentKind): boolean;
  add<C extends ComponentKind>(id: EntityId, kind: C, value: ComponentOf<C>): CommandResult<void>;
  remove(id: EntityId, kind: ComponentKind): CommandResult<void>;

  /** Iteration by capability: the heart of ARC-6.2. Deterministic order. */
  each<C extends readonly ComponentKind[]>(
    kinds: C, visit: (id: EntityId, ...c: ComponentsOf<C>) => void): void;

  capabilities(id: EntityId): TagMask;   // for the spatial index
}
```

## Requirements

**ENT-1** — Every entity **MUST** be identified by an **opaque, stable and never reused** `EntityId`:
after removal, its id **MUST NOT** be reassigned (generational versions are allowed). No lookup by
string name (ARC-5.2).

**ENT-2** — An entity **MUST** be a plain **composition of components**. Hierarchies of entity
classes **MUST NOT** exist (ARC-6.1).

**ENT-3** — A component **MUST** be usable as a **capability marker** even without data:
`Targetable`, `Lockable`, `Flammable`, `Sittable`, `Lootable`, `Talkable`. Marking is declaring to
the world that the entity takes part in that interaction (ARC-6.2).

**ENT-4** — Iteration by capability (`each`) **MUST** be efficient and **MUST** have a deterministic
order, independent of the order of creation and destruction (ARC-9.4).

**ENT-5** — The registry **MUST** expose an entity's capabilities as a **bitmask**, so that the
spatial index can filter without querying it entity by entity (SPX-2).

**ENT-6** — Components **MUST** be addable and removable at runtime: a peaceful NPC who turns hostile
gains `Combat`; a chest that has been picked loses `Lockable`. Every change emits the corresponding
event, so that the spatial index and the presentation update themselves (ARC-6.4).

**ENT-7** — **Archetypes MUST** be validated data: an NPC is a list of components with initial
values in a file, not a subclass (ARC-7.1).

**ENT-8** — Archetypes **MUST** support composition and partial overriding (`guard` = `humanoid` +
`fighter` + `faction: guards`), without duplicating the definitions.

**ENT-9** — The registry **MUST NOT** contain game logic: it computes no damage, decides who attacks
whom. It stores and returns data. The logic lives in the rules services, which receive the
components as arguments.

**ENT-10** — No component **MUST** contain references to `Actor`s or to rendering objects (ARC-1.3).
The `EntityId → Actor` binding is maintained by the presentation.

**ENT-11** — Every component **MUST** be serializable; the registry serializes the live entities with
their components and their originating archetype, by difference from the initial values where that
is worthwhile (ARC-10).

**ENT-12** — The **player** entity **MUST** be reachable by a stable reference, never found by
scanning the world (ARC-5.2).

**ENT-13** — Spawn and despawn **MUST** emit events: the presentation creates and destroys the
`Actor`s in reaction to them, never the other way round.

**ENT-14** — The registry **MUST** cope with the spawning and despawning of hundreds of entities in
a frame (loading an area) without expensive reorganizations.

**ENT-15** — An entity **MUST** be able to reference another only by `EntityId`, never by a direct
object reference: this guarantees that cycles do not block serialization and that dangling
references are detectable.

## Test criteria

- Create 10⁴ entities with different archetypes and iterate by capability: deterministic results and
  order.
- Adding and removing a component updates the capability mask and emits the events.
- A removed id is never reassigned; accessing a dead id returns `undefined`, it does not throw.
- Serialization round trip on a populated world.
- The registry works with a made-up component set, foreign to this game (ARC-3.4).

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-6 (components and capabilities), ARC-5.2
  (references)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-11 (interactive objects), GP-27 (quest NPCs)
- [`spatial-index.md`](./spatial-index.md) · [`affordance.md`](./affordance.md) ·
  [`rendering.md`](./rendering.md)

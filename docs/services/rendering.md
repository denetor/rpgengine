# REN — Rendering and scene adapter

**Area:** Presentation · **Nature:** domain · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `REN-*`

## Purpose

To be the **boundary** between the engine and Excalibur: the only place where a domain state becomes
an `Actor`, a sprite, an animation, a drawing order.

It is the inverse of all the other services: the others exist in order **not** to know Excalibur,
this one exists to contain it. If the presentation/domain separation fails, it fails here.

## Contract

| Item | Value |
|---|---|
| Depends on | `excalibur`; observes the bus · `AST` **deferred**: until step 16 of §7.2 it loads through Excalibur's `Loader` (REN-16) |
| Does NOT depend on | any domain service, except for **reading** through views |
| Consumed by | the game loop |
| Dynamic state | `EntityId → Actor` map, actor pool, animation state |
| Static state | archetype → appearance mapping, z-bands, animation definitions |
| External data | `content/visuals/*.json` — appearance per archetype, animations, effects |
| Events emitted | none towards the domain; it consumes domain events |

## Public API (indicative)

```ts
interface RenderAdapter {
  /** Reacts to domain events: an entity is born, an Actor is born. */
  onEntitySpawned(id: EntityId, view: EntityView): void;
  onEntityDespawned(id: EntityId): void;

  /** Synchronizes the Actors with the domain state, once per frame. */
  sync(world: WorldView, alpha: number): void;

  actorOf(id: EntityId): Actor | undefined;      // only inside the presentation
  playEffect(effect: EffectRequest): void;       // hits, particles, floating numbers
}
```

## Requirements

### Boundary

**REN-1** — This service, together with `HUD`, `AUD`, `CAM` and the input adapter, **MUST** be the
only one to import `excalibur` (ARC-1.2).

**REN-2** — The `EntityId → Actor` binding **MUST** live only here, as an explicit map. No `Actor`
**MUST** appear in a domain state (ARC-1.3).

**REN-3** — The direction of the dependency **MUST** be one-way: the presentation observes the domain
and reacts to its events; the domain **MUST NOT** know that `Actor`s exist (ARC-1.1).

**REN-4** — `Actor`s **MUST** be created and destroyed in reaction to `entity-spawned` and
`entity-despawned`, never on the presentation's own initiative (ENT-13).

**REN-5** — The presentation **MUST NOT** contain game rules: no damage computation, no AI decision,
no quest transition in an `onPreUpdate`.

### Drawing

**REN-6** — The ordering of elements **MUST** follow the z-bands and the Y-ordering of the base
defined in [`MAP-REQUIREMENTS.md`](../MAP-REQUIREMENTS.md) (MAP-1, MAP-5), with the values received
as construction parameters, never written in the code (CFG-1).

**REN-7** — Terrain rendering **MUST** apply the **Dual Grid System** by reading `MAP`'s data grid,
without owning its own copy of the truth (MAP-2, MAP-3, MAP-10).

**REN-8** — An entity's appearance **MUST** be **data**: the archetype → sprite mapping, animations
and offsets live in the content files, not in a class per enemy type (ARC-7.1).

**REN-9** — Animations **MUST** be driven by the **domain state** (moving, wounded, dead), not by a
parallel state machine that can diverge.

**REN-10** — `Actor`s **SHOULD** be reused through a pool for frequent entities (projectiles,
particles, floating numbers), avoiding per-frame allocations (ARC-13.3).

**REN-11** — The number of entities drawn **MUST** be limited to what is visible or nearby: culling
**MUST NOT** depend on a scan of all the world's entities (ARC-13.1).

**REN-12** — Interpolation between two simulation steps **MUST** be handled here: if the logic runs
at a fixed step (TIME-5), the rendering interpolates. The logic **MUST NOT** be altered in order to
look smooth.

**REN-13** — Visual feedback (damage numbers, flashing, shake, particles) **MUST** be triggered by
**domain events**, not by direct calls scattered through the logic.

**REN-14** — The whole service **MUST** be able to be **absent**: a headless game works without a
rendering adapter, and that is how the system tests run (ARC-1.4).

**REN-15** — Shake and flash effects **MUST** respect the accessibility preferences (GP-66, SET-1).

**REN-16** — This service is priority 1 and `AST` is priority 3: until `AST` exists, loading **MUST**
go through Excalibur's own `Loader`, confined to a **single module** of the presentation, so that
adopting `AST` (step 16 of [§7.2](../REQUIREMENTS.md#72--development-order)) is a change local to
`REN`. No other file **MUST** construct an `ImageSource` or a `Sound` directly.

## Test criteria

- A boundary test verifies that no file outside the presentation imports `excalibur` (ARC-14.2).
- A complete simulation runs without a rendering adapter, with the same results.
- Every `entity-spawned` produces exactly one `Actor`; every `entity-despawned` removes it, with no
  leaks after 10³ cycles.
- Y-ordering produces the correct overlapping on known cases.
- No reference to an `Actor` appears in a save document.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-1, ARC-13
- [`MAP-REQUIREMENTS.md`](../MAP-REQUIREMENTS.md) — MAP-1…MAP-6
- [`entity-registry.md`](./entity-registry.md) · [`map.md`](./map.md) · [`assets.md`](./assets.md) ·
  [`camera.md`](./camera.md) · [`settings.md`](./settings.md)

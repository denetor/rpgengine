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

**REN-12** — Interpolation between two simulation steps **MUST** be handled here: the logic runs at
the fixed step owned by the **driver**, and the rendering interpolates over the leftover lag it
exposes. The logic **MUST NOT** be altered in order to look smooth.

The fixed step is not the clock's (TIME-3): `TIME` advances by whatever it is given, and it is the
driver — Excalibur's `fixedUpdateTimestep`, with `currentFrameLagMs` — that turns a variable frame
into a constant one and says how far past the last step the frame is.

**REN-13** — Visual feedback (damage numbers, flashing, shake, particles) **MUST** be triggered by
**domain events**, not by direct calls scattered through the logic.

**REN-14** — The whole service **MUST** be able to be **absent**: a headless game works without a
rendering adapter, and that is how the system tests run (ARC-1.4).

**REN-15** — Shake and flash effects **MUST** respect the accessibility preferences (GP-66, SET-1).

**REN-16** — This service is priority 1 and `AST` is priority 3: until `AST` exists, loading **MUST**
go through Excalibur's own `Loader`, confined to a **single module** of the presentation, so that
adopting `AST` (step 16 of [§7.2](../REQUIREMENTS.md#72--development-order)) is a change local to
`REN`. No other file **MUST** construct an `ImageSource` or a `Sound` directly.

### Which components live on which side

Excalibur has its own ECS (`World`, `Entity`, `Component`, `Query`), and `ENT` is a second store of
entities and components. Two stores are a real cost: the same fact can end up written in both and
they drift apart. These requirements say where each fact lives, and the answer is never "in both".

**REN-17** — Every piece of state **MUST** have **one owner**, and the boundary is the test of
outcome: if losing it would change what the simulation produces, it belongs to `ENT`; if losing it
would only change the picture, it belongs to the `Actor`. Presentation state **MUST** be derivable:
destroying every `Actor` and rebuilding it from the domain **MUST** give the same game back
(REN-14).

| Fact | Owner | Note |
|---|---|---|
| Health, combat, faction, inventory, dialog, loot, quest flags | `ENT` | rules read it, `PER` serializes it |
| Authoritative position, facing, movement intent | `ENT` | the truth of *where* an entity is (REN-18) |
| Walkability, terrain, area topology | `MAP` | the truth of *where it may go* (REN-19) |
| `TransformComponent`, `GraphicsComponent`, `ColliderComponent`, `ActionsComponent` | `Actor` | derived every frame, thrown away with the scene |
| Interpolated position, visual offsets: bob, shake, hit recoil | `Actor` | never written back (REN-18) |
| Sprite, animation frame, tint, z-band | `Actor` | driven by domain state (REN-8, REN-9) |
| Pooled effects: particles, floating numbers | `Actor` | no domain entity behind them (REN-10) |

**REN-18** — The synchronization of position **MUST** be one-way: `sync` writes domain → `Actor`,
never the reverse. An `Actor`'s `pos` is a **derived value**, made of the domain position plus the
interpolation over the driver's lag (REN-12) plus purely visual offsets. Those offsets **MUST NOT**
re-enter the domain: an entity shaken by a hit has not moved.

**REN-19** — Excalibur's physics **MUST NOT** decide the outcome of anything. Colliders **MAY**
exist for pointer picking and visual effects; movement legality is `MAP`'s walkability and the rules
services. A headless run has no `BodyComponent` and **MUST** produce the same results (ARC-1.4).

**REN-20** — Excalibur components and tags **MUST NOT** be used as **capability markers**. Queries by
capability go through `ENT`'s mask (ARC-6.2, ARC-6.3, ENT-5), never through `world.query([...])` or
`entity.tags`. Two reasons: the iteration order of an Excalibur `Query` follows insertion into the
query and would break determinism (ARC-9.4, ENT-4), and the query would not exist at all in a
headless run.

**REN-21** — No `Actor` **MUST** be the origin of a domain entity: a visual element with no `EntityId`
behind it **MUST** be purely decorative. If it takes part in an interaction, it is spawned in `ENT`
first and the `Actor` follows (REN-4, ENT-13).

## Test criteria

- A boundary test verifies that no file outside the presentation imports `excalibur` (ARC-14.2).
- A complete simulation runs without a rendering adapter, with the same results.
- Every `entity-spawned` produces exactly one `Actor`; every `entity-despawned` removes it, with no
  leaks after 10³ cycles.
- Y-ordering produces the correct overlapping on known cases.
- No reference to an `Actor` appears in a save document.
- Destroying every `Actor` and rebuilding the scene from the domain leaves the simulation identical
  (REN-17).
- The same scripted run, headless and rendered, produces the same domain state frame by frame: a
  shake or an interpolation does not move anything (REN-18, REN-19).

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-1, ARC-13
- [`MAP-REQUIREMENTS.md`](../MAP-REQUIREMENTS.md) — MAP-1…MAP-6
- [`entity-registry.md`](./entity-registry.md) · [`map.md`](./map.md) · [`assets.md`](./assets.md) ·
  [`camera.md`](./camera.md) · [`settings.md`](./settings.md)

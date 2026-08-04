# Service sheets

One sheet per service. Every sheet is self-contained: it defines the service's **contract**, its
**public API**, its **numbered requirements** with their own prefix, and its **test criteria**.

The principles that hold for all of them (`ARC-*`), the complete catalogue and the priorities live
in the hub: [`../REQUIREMENTS.md`](../REQUIREMENTS.md). The features seen by the player live in
[`../GAMEPLAY.md`](../GAMEPLAY.md).

## Rules that hold for every sheet

- **Nature** — *generic* (reusable in another game) or *domain* (assumes this project's model). See
  ARC-3.
- **No service imports another service.** The dependencies listed are abstract ports or
  infrastructure. The wiring between services lives in `game/orchestration/` (ARC-4).
- **No service imports `excalibur`**, except the four presentation ones (ARC-1.2).
- **Commands return the events they produce**, they do not publish them (ARC-4.2).
- **Requirement IDs are stable** and are not reused.

## Index

### Core — infrastructure

| ID | Sheet | What it does |
|---|---|---|
| `BUS` | [event-bus.md](./event-bus.md) | Domain event transport, deterministic delivery |
| `CTX` | [game-context.md](./game-context.md) | Service graph composition, injection, lifecycle |
| `CFG` | [config.md](./config.md) | Composes, validates and freezes the parameters services are built with |
| `TIME` | [time.md](./time.md) | Game time, scheduler, world clock |
| `RND` | [random.md](./random.md) | Seedable RNG, Gaussian, Perlin, filtered randomness |
| `EXPR` | [expr.md](./expr.md) | Conditions and effects declared in data, evaluated once for all |
| `SAVE` | [persistence.md](./persistence.md) | Saving, slots, versioning, migrations |
| `INP` | [input.md](./input.md) | Abstract actions, contexts, rebinding, buffering |
| `SET` | [settings.md](./settings.md) | Player preferences, persisted outside the save |
| `I18N` | [localization.md](./localization.md) | Texts by key, languages, plurals |
| `AST` | [assets.md](./assets.md) | Asset manifest, bundles, loading |

### World

| ID | Sheet | What it does |
|---|---|---|
| `MAP` | [map.md](./map.md) | Data grid, walkability, areas — see also [MAP-REQUIREMENTS](../MAP-REQUIREMENTS.md) |
| `GEN` | [map-generation.md](./map-generation.md) | Procedural generation from seed and recipes |
| `SPX` | [spatial-index.md](./spatial-index.md) | Proximity and visibility queries |
| `ENT` | [entity-registry.md](./entity-registry.md) | Identity, components, capabilities |

### Agents

| ID | Sheet | What it does |
|---|---|---|
| `BB` | [blackboard.md](./blackboard.md) | Per-agent, per-group and global knowledge; memoization |
| `AI` | [utility-ai.md](./utility-ai.md) | Utility-based decision, personality, multiple reasoners |
| `AFF` | [affordance.md](./affordance.md) | Objects advertise their own use; perception |
| `PATH` | [pathfinding.md](./pathfinding.md) | Paths, reachability, flight |

### Game rules

| ID | Sheet | What it does |
|---|---|---|
| `STAT` | [stats.md](./stats.md) | Attributes, skills, perks, derived values, modifiers |
| `CBT` | [combat.md](./combat.md) | Single damage formula, status effects, death |
| `INV` | [inventory.md](./inventory.md) | Containers, weight, stacking, equipment |
| `LOOT` | [loot.md](./loot.md) | Weighted loot tables, anti-repetition filter, pity |
| `QST` | [quest.md](./quest.md) | Interpreter for staged and branching quests |
| `DLG` | [dialog.md](./dialog.md) | Adapter over the ink runtime: conditional conversations |
| `FAC` | [faction.md](./faction.md) | Factions, ranks, reputation, relations |
| `ECO` | [economy.md](./economy.md) | Prices, merchant liquidity, restocking |
| `CRM` | [crime.md](./crime.md) | Observed crimes, witnesses, bounties |

### Presentation

| ID | Sheet | What it does |
|---|---|---|
| `REN` | [rendering.md](./rendering.md) | Boundary with Excalibur, `EntityId → Actor`, drawing |
| `HUD` | [hud.md](./hud.md) | HUD, journal, inventory, menus, contextual interaction |
| `AUD` | [audio.md](./audio.md) | Music by situation, effects from events, mixing |
| `CAM` | [camera.md](./camera.md) | Following, bounds, zoom, shake |

## Template for a new sheet

```markdown
# XXX — Name

**Area:** … · **Nature:** generic | domain · **Priority:** 1-4 · **Status:** proposed
**Requirement prefix:** `XXX-*`

## Purpose
What it does and, above all, which problem it exists to prevent.

## Contract
| Item | Value |
|---|---|
| Depends on | … (abstract ports, never other services) |
| Does NOT depend on | `excalibur`, … |
| Consumed by | … |
| Dynamic state | … (what ends up in the save file) |
| Static state | … (what comes from the content files) |
| External data | … |
| Events emitted | … |
| Order of magnitude | … |

## Public API (indicative)
TypeScript signatures: they fix shape and responsibility, not the implementation.

## Requirements
**XXX-1** — … MUST/SHOULD/MAY …

## Test criteria
What the service's suite must demonstrate, including the reusability proof (ARC-3.4).

## Links
Game requirements served, relevant principles, related services.
```

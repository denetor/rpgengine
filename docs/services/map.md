# MAP — Map: data grid and collision

**Area:** World · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `MAP-*` — requirements `MAP-1…MAP-9` are defined in
[`MAP-REQUIREMENTS.md`](../MAP-REQUIREMENTS.md); this sheet defines their **service contract** and
adds `MAP-10` onwards.

## Purpose

Own the world's **data grid** — the logical truth about what is in every cell — and answer the
questions that gameplay and AI put to it: what is at (x,y), is it walkable, what does it cost to
cross it, which cells are in this area.

It is **pure domain**: it draws nothing. The Dual Grid System and Y-ordering are *rendering*
decisions that read this grid; the grid does not know they exist.

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, `TileMap`, other services |
| Consumed by | `PATH`, `AI`, `SPX`, `REN`, orchestration |
| Dynamic state | runtime modifications (door opened, bridge collapsed, area revealed) |
| Static state | terrain grid, per-terrain property table, named areas |
| External data | Tiled maps, generated maps (`GEN`), `terrains.json` (per-terrain properties) |
| Events emitted | `cell-changed`, `area-entered`, `area-exited` |
| Order of magnitude | maps up to 512×512 cells with O(1) walkability queries |

## Public API (indicative)

```ts
interface MapService {
  readonly width: number;
  readonly height: number;

  terrainAt(x: number, y: number): TerrainId;
  isWalkable(x: number, y: number): boolean;
  moveCost(x: number, y: number): number;          // Infinity = impassable
  propertiesAt(x: number, y: number): TerrainProperties;   // water, deep, noisy, dark…

  setTerrain(x: number, y: number, t: TerrainId): CommandResult<void>;
  setBlocked(x: number, y: number, blocked: boolean): CommandResult<void>;

  areaAt(x: number, y: number): AreaId | undefined;
  cellsOfArea(id: AreaId): Iterable<Cell>;
  areaKind(id: AreaId): 'handcrafted' | 'generated';   // determines respawn (GP-10)

  toWorld(cell: Cell): Vector2;   // in pixels, for the presentation
  toCell(world: Vector2): Cell;
  inBounds(x: number, y: number): boolean;
}
```

## Additional requirements

**MAP-10** — The service **MUST** be the **sole authority** on terrain walkability. Static collision
**MUST** derive from the data grid, not from hand-drawn colliders duplicated in the renderer.

**MAP-11** — A terrain's properties (walkable, movement cost, noisiness, ground type for sounds and
particles, brightness) **MUST** be **data** in a table keyed by `TerrainId`, not conditions
hardwired in the code.

**MAP-12** — Cell queries (`terrainAt`, `isWalkable`, `moveCost`) **MUST** be O(1) and
allocation-free: they are called thousands of times per path search (ARC-13.3).

**MAP-13** — The internal representation **SHOULD** be a flat typed array (`Uint16Array`), not an
array of arrays of objects.

**MAP-14** — Cell coordinates and world coordinates **MUST** be distinct types, or at least
distinguishable: confusing them is the most common mistake in this domain.

**MAP-15** — Runtime modifications **MUST** emit `cell-changed`, so that the renderer, the spatial
index and the pathfinding cache update themselves without having to periodically compare against the
grid.

**MAP-16** — The service **MUST** support **named areas** with boundaries, a kind (hand-drawn or
generated) and their own properties: they are the unit that respawn rules (GP-10), music (GP-55),
spawning and crime hook onto.

**MAP-17** — A tracked entity crossing an area's boundary **MUST** emit `area-entered` /
`area-exited`.

**MAP-18** — The serialized dynamic state **MUST** contain **only the differences** with respect to
the starting map (modified cells), not the whole grid: a generated map is rebuilt from its seed
(GEN-3) plus the differences.

**MAP-19** — The service **MUST** accept a map loaded from Tiled and a procedurally generated one
alike: the source **MUST NOT** be visible downstream (GP-7, GP-8, GP-9).

**MAP-20** — The service **MUST** be able to host **several maps** loaded at the same time (the
current area and the adjacent ones), with explicit identification: moving from one area to another
**MUST NOT** require rebuilding the context.

**MAP-21** — **Entity** collision (the footprint of a barrel, of a tree) does **NOT** belong to this
service but to `ENT`/`SPX`: the map knows the terrain, not who stands on it. Whoever needs to know
whether a cell is free queries both.

## Test criteria

- Build a synthetic 32×32 map and verify walkability, costs and boundaries.
- `toCell(toWorld(c)) === c` for every cell, edges included.
- Modifying a cell emits exactly one `cell-changed`.
- The serialization round trip contains only the expected differences.
- The service works with a made-up terrain set, foreign to this game (ARC-3.4).

## Links

- [`MAP-REQUIREMENTS.md`](../MAP-REQUIREMENTS.md) — MAP-1…MAP-9: layers, DGS, Y-ordering, overhead,
  data format
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-7, GP-8, GP-9, GP-10, GP-52
- [`map-generation.md`](./map-generation.md) · [`pathfinding.md`](./pathfinding.md) ·
  [`spatial-index.md`](./spatial-index.md) · [`rendering.md`](./rendering.md)

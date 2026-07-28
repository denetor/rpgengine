# Technical Requirement — Map structure and terrain rendering

**Project:** 2D top-down RPG on square tiles
**Component:** Map and rendering system
**Version:** 0.1 (draft)
**Status:** proposed

Requirement language: **MUST** = mandatory, **SHOULD** = recommended, **MAY** = optional.

> This document owns requirements `MAP-1…MAP-9` and specifies **how the world is drawn**.
> The map's **service contract** — API, dependencies, serializable state, requirements from `MAP-10`
> onwards — lives in [`services/map.md`](./services/map.md); the cross-cutting architectural
> principles live in [`REQUIREMENTS.md`](./REQUIREMENTS.md); the game features this document serves
> (GP-7, GP-8, GP-9, GP-52) live in [`GAMEPLAY.md`](./GAMEPLAY.md).
>
> The terms used here — data grid, drawing grid, Dual Grid System, terrain priority, base, z-band,
> overhead, footprint — are defined in [`../CONTEXT.md`](../CONTEXT.md), the project's single
> glossary.

---

## 1. Purpose

Define (a) the organization of the game map into layers and (b) the way terrain tiles are composed
through the **Dual Grid System (DGS)** applied to **3 terrain layers** stacked by priority. The
document fixes the conventions needed for authoring (the editor), the data format and the renderer to
be consistent.

---

## 2. Project parameters

| Parameter | Symbol | Default value | Notes |
|---|---|---|---|
| Tile size | `TS` | 32 px | square; configurable |
| Map width (cells) | `W` | — | project data |
| Map height (cells) | `H` | — | project data |
| Terrain layers | — | 3 | see MAP-2 |
| Tiles per DGS layer | — | 16 | see MAP-3 |

---

## 3. Requirements

### MAP-1 — Layered structure of the map

The map **MUST** be organized into the following layers, drawn from the bottom upwards (higher =
drawn later = in the foreground):

| # | Layer | Content | Ordering | z (default) |
|---|---|---|---|---|
| 6 | UI / HUD | interface | screen space (outside the world) | — |
| 5 | Weather / light | fog, rain, day/night tint | fixed | 20000 |
| 4 | Overhead | canopies, arches, roofs | fixed | 10000 |
| 3 | Entities / objects | character, NPCs, trunks, rocks, columns, bushes | **by base Y** | `0 … H·TS` |
| 2 | Ground detail | flowers, paths, decals, shadows | fixed | −900 |
| 1 | Terrain | 3 DGS sub-layers (MAP-2) | fixed | from −1000 |

The constant `z` bands (fixed layers) **MUST** be chosen so that they never intersect the
`0 … H·TS` range used by the Y-ordering (MAP-5).

### MAP-2 — Terrain with a 3-layer Dual Grid System

Every cell of the data grid **MUST** contain a single terrain identifier `terrain ∈ {0, 1, 2}`, where
the value also represents the **priority** (0 = lowest, 2 = highest). Example order (configurable):
`0 = water`, `1 = bare ground`, `2 = grass`.

The terrain **MUST** be rendered in 3 stacked passes, from the lowest priority layer to the highest:

- **T0 (base):** fill with terrain 0 over the whole map area.
- **T1:** DGS pass on the mask `mask1(x,y) = terrain(x,y) ≥ 1`, drawn on top of T0.
- **T2:** DGS pass on the mask `mask2(x,y) = terrain(x,y) ≥ 2`, drawn on top of T1.

Every DGS pass **MUST** treat "absent" corners (false mask) as transparent, so that the layer
underneath stays visible and produces the transition. This stacked-mask model **MUST** also correctly
handle the junctions where three terrains meet at the same vertex.

### MAP-3 — Dual Grid System parameters

The following rules apply to each DGS pass:

1. The drawing grid **MUST** have dimensions `(W+1) × (H+1)` and be positioned with an offset of
   `(−TS/2, −TS/2)` with respect to the data grid.
2. Every drawing tile at position `(dx, dy)` **MUST** sample the 4 data cells at its corners:
   `TL=(dx−1, dy−1)`, `TR=(dx, dy−1)`, `BL=(dx−1, dy)`, `BR=(dx, dy)`.
3. Cells outside the map bounds **MUST** be considered "absent" (inactive corner). This implies a
   padding border that closes the transitions at the edges.
4. The tile index (0–15) **MUST** be computed with the bit convention `TL=1, TR=2, BR=4, BL=8`,
   summing the bits of the active corners.
5. The `index → sheet cell` mapping **MUST** be defined by a 16-element `INDEX_TO_TILE` table, fixed
   once according to the layout of the layer's `.png`.
6. The two diagonal cases (indices 5 and 10, opposite corners active) **MUST** follow a documented
   convention, consistent throughout the game. Default: **connected** corners ("bridged").

### MAP-4 — Transitions between terrains

Transitions between terrains **MUST** be obtained exclusively by stacking (priority + DGS
transparency), with no dedicated tile sets for each pair of terrains. It follows that the edge of a
given terrain looks the same against any lower terrain. If a specific look is needed for a boundary
(e.g. sand between grass and water), it **MUST** be achieved by inserting an **intermediate terrain**
as an additional priority layer, not as a pairwise transition.

### MAP-5 — Y-ordering of entities

The character, NPCs and occludable objects (trunks, rocks, columns, bushes) **MUST** live in the same
sortable band (layer 3) and be ordered by the **Y of their base**. The `z` value of every sortable
element **MUST** equal the base's Y; for moving elements it **MUST** be updated every frame, for
static ones it **MAY** be set once.

Sortable sprites **SHOULD** be anchored at the bottom edge (`anchor = (0.5, 1)`), so that `pos.y`
coincides with the feet line.

### MAP-6 — Overhead layer

Elements that must always be above the character (canopies, arches, roofs) **MUST** live in the
overhead layer (layer 4), with a constant `z` greater than any possible value of the sortable band. A
"tall" object (e.g. a tree) **MUST** be split: the ground part (trunk) in the Y-sortable layer, the
upper part (canopy) in the overhead layer.

### MAP-7 — Collision

Collision **MUST** be data separate from rendering, defined by the object's footprint (in general its
base) and independent of drawing order. The character **MUST** be able to visually pass through
"tall" areas (e.g. under the canopy) while being blocked by the footprint (e.g. the trunk). Terrain
collision **MUST** be defined on the integer data grid, not on the offset drawing grid.

### MAP-8 — Data format and authoring

1. The terrain data grid (`terrain` per cell) **MUST** be the single source for gameplay, collisions
   and DGS rendering.
2. Authoring **SHOULD** happen in a map editor with layers named consistently with MAP-1 (e.g.
   `terrain`, `ground_detail`, `entities`, `overhead`, `weather`, and a non-rendered data/collision
   layer).
3. Any aesthetic variants of a tile (e.g. the full grass tile) **MUST** be chosen **deterministically**
   as a function of `(x, y)` (a hash), to avoid flickering between frames.

### MAP-9 — Non-functional requirements

1. The DGS drawing grids **SHOULD** be recomputed only when the terrain data changes, not every
   frame.
2. The system **MUST** keep the three concepts separate: shape (DGS/priority), variants (aesthetics),
   animation (time), so that they can coexist without conflicts.

---

## 4. Acceptance criteria

- [ ] The map is rendered according to the layer order of MAP-1.
- [ ] The terrain uses 3 DGS passes stacked by priority; the transitions between grass, bare ground
      and water are correct, including inner corners and three-way junctions.
- [ ] There are no tile sets dedicated to pairs of terrains: every terrain has a single 16-tile DGS
      set.
- [ ] At the map's edges the transitions close correctly thanks to the "absent" padding.
- [ ] The character appears **behind** a trunk when its base is higher up and **in front** when it is
      lower down.
- [ ] A tree's canopy always stays above the character, in both situations.
- [ ] The character is blocked by the footprint (trunk/column) but can visually pass under the
      overhead parts.
- [ ] Terrain variants are stable from one frame to the next (no flickering).

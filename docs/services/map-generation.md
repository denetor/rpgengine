# GEN — Procedural map generation

**Area:** World · **Nature:** generic · **Priority:** 3 · **Status:** proposed
**Requirement prefix:** `GEN-*`

## Purpose

Produce map **data grids** from a seed and a recipe: areas that are completely random, or composed
by connecting sectors taken from a pool of hand-drawn pieces. The output is the same format as a
Tiled map, so that downstream nobody can tell the two origins apart.

It does not generate *pixels* and does not generate *narrative content*: it produces terrain,
connections and **points of interest** that the orchestration will populate.

## Contract

| Item | Value |
|---|---|
| Depends on | `RND` (injected as a stream, not as a whole service) |
| Does NOT depend on | `excalibur`, `MAP`, other services |
| Consumed by | orchestration, which passes the result to `MAP` |
| Dynamic state | none: it is a function from (seed, recipe) to map |
| Static state | generation recipes, sector pools |
| External data | `content/generation/*.json` — recipes, room pools, constraints, biome tables |
| Events emitted | none |
| Order of magnitude | a 256×256 map in under 100 ms |

## Public API (indicative)

```ts
interface GeneratedMap {
  terrain: Uint16Array;              // same format as a loaded map
  width: number; height: number;
  entrances: readonly Cell[];
  pointsOfInterest: readonly { kind: PoiKind; cell: Cell; tags: string[] }[];
  regions: readonly { id: string; kind: RegionKind; cells: Cell[] }[];
}

interface MapGenerator {
  generate(recipe: RecipeId, seed: number): Result<GeneratedMap, GenerationError>;
}
```

## Requirements

**GEN-1** — The generator **MUST** be a **pure function** of (recipe, seed): no internal state
between two generations, no dependency on call order.

**GEN-2** — The same (recipe, seed) pair **MUST** produce a **bit-for-bit identical** map, today and
after a browser update (RND-4). It is a promise that only holds if the generator avoids the
transcendental `Math` functions (`log`, `cos`, `sin`, `exp`, `pow`), which ECMAScript does not
specify exactly: see [`adr/0001`](../adr/0001-bit-for-bit-reproducibility.md).

**GEN-3** — A generated map **MUST** be rebuildable from its seed rather than saved in full: the
save file holds the seed, the recipe and the differences (MAP-18).

**GEN-4** — At least two families of recipes **MUST** be supported:
- **free generation**, in which terrain arises from noise and rules (GP-8);
- **composition from a pool**, in which hand-drawn sectors are chosen, oriented and connected
  (GP-9).

**GEN-5** — Recipes **MUST** be **validated data** (ARC-7): noise parameters, biome thresholds,
sizes, densities, room counts, connection rules. Changing the generation **MUST NOT** require
recompiling.

**GEN-6** — Generation **MUST** guarantee **connectivity**: every point of interest and every exit
**MUST** be reachable from every entrance. The check is part of the generator, not an optional
external control.

**GEN-7** — If a recipe cannot satisfy the constraints, the generator **MUST** retry a limited
number of times and then **fail explicitly**, never return a broken map.

**GEN-8** — The generator **MUST** produce **typed points of interest** (entrance, exit, treasure
room, camp, water source) as **positional data**. Populating them with enemies, items and quests is
the orchestration's job, not the generator's.

**GEN-9** — Generation **SHOULD** be **decomposable into portions** that are reproducible
independently, by deriving one stream per portion (RND-5): this is needed to generate by chunks
without the result depending on the player's visiting order.

**It is not currently planned**, and this is consistent with the API above, which generates a whole
map per call. Consequently `RND` does not implement `derive()` (RND-5 is a **SHOULD**). The
hash-based seeding of RND-19 makes the addition additive: when chunked generation is actually
needed, implementing it will break neither saves nor already generated maps.

**GEN-10** — The generator **MUST** produce only `TerrainId`s valid with respect to the terrain
table; a recipe that names a non-existent one **MUST** fail validation (ARC-7.5).

**GEN-11** — The generator **MUST NOT** know `MAP`: it returns data, which the orchestration hands
to the map service (ARC-4.1).

**GEN-12** — The generator **SHOULD** expose a diagnostic mode that returns the intermediate stages
(noise map, biomes, rooms, corridors), so that the process can be observed and tuned.

**GEN-13** — Generation **MUST NOT** freeze the game: for large maps it **MUST** be runnable in
interruptible stages or off the main thread, while staying deterministic.

## Test criteria

- Same seed → identical map, across 100 different recipes.
- Connectivity verified on 1000 random seeds per recipe: no map with isolated points.
- An impossible recipe fails with a diagnostic error within the expected number of attempts.
- *(once GEN-9 is implemented)* Chunked generation in a different order produces the same world.
- The generator produces a valid map with a made-up terrain set (ARC-3.4).

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-8, GP-9, GP-10
- [`map.md`](./map.md) · [`random.md`](./random.md) · [`pathfinding.md`](./pathfinding.md)

# SPX — Spatial index

**Area:** World · **Nature:** generic · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `SPX-*`

## Purpose

Answer proximity questions quickly: *who is within N tiles? who is the nearest hostile target? which
entities are inside this rectangle?*

It exists for a precise reason: without an index, every NPC scans every entity in the scene on every
tick, and the cost grows with the square of the number of actors. It is the most common performance
defect in 2D games written in a straightforward way, and it is exactly what ARC-13.1 forbids.

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, `ENT`, other services |
| Consumed by | `AI`, `AFF`, `CRM`, `CBT` (area targets), orchestration |
| Dynamic state | indexed positions (rebuildable: **not** serialized) |
| Static state | the index's cell size |
| External data | cell size in the configuration |
| Events emitted | none |
| Order of magnitude | ~10³ moving entities, ~10⁴ proximity queries/second |

## Public API (indicative)

```ts
interface SpatialIndex {
  insert(id: EntityId, pos: Vector2, caps: CapabilityMask): void;
  move(id: EntityId, pos: Vector2): void;
  remove(id: EntityId): void;
  updateCapabilities(id: EntityId, caps: CapabilityMask): void;

  /** Writes into the buffer supplied by the caller: no allocation per query. */
  queryRadius(center: Vector2, radius: number, filter: CapabilityMask, out: EntityId[]): number;
  queryRect(rect: Rect, filter: CapabilityMask, out: EntityId[]): number;
  nearest(center: Vector2, maxRadius: number, filter: CapabilityMask): EntityId | undefined;

  /** Iteration ordered by increasing distance, without materializing the list. */
  forEachInRadius(center: Vector2, radius: number, filter: CapabilityMask,
                  visit: (id: EntityId, distSq: number) => boolean): void;
}
```

## Requirements

**SPX-1** — Proximity queries **MUST** cost in proportion to the number of entities **in the queried
area**, not to the total number of entities in the world (ARC-13.1).

**SPX-2** — The filter by **capability MUST** be applied *inside* the index, not downstream: an NPC
looking for targets **MUST NOT** receive and then discard decorative elements. The filter **MUST** be
the `CapabilityMask` that `ENT` already computes (ENT-5), not a string comparison and not a tag
vocabulary of the index's own (ARC-6.3). The index does not interpret the bits: it stores what it is
handed and intersects it.

**SPX-3** — Queries **MUST NOT** allocate: the caller supplies the buffer, or uses the callback-based
iteration (ARC-13.3).

**SPX-4** — Updating an entity's position **MUST** be amortized O(1) and **MUST NOT** require
removal and reinsertion if the cell does not change.

**SPX-5** — `nearest` **MUST** stop as soon as the result is certain, without examining the whole
maximum radius.

**SPX-6** — The index **MUST NOT** be serialized: it is a derived structure, rebuilt from the set of
entities on load (ARC-10.4).

**SPX-7** — The index **MUST NOT** own the entities nor know their properties: it knows id, position
and capability mask. Asking *what* an entity is is up to `ENT`.

**SPX-8** — The result of a query **MUST** have a deterministic order (by increasing distance, and
for equal distance by increasing id): an order that depends on the internal structure would make the
simulation non-reproducible (ARC-9.4).

**SPX-9** — The structure **MUST** be suited to predominantly moving entities in a space of
irregular density: a **uniform grid** with a tuned cell size is preferable to a quadtree, absent
measured evidence to the contrary.

**SPX-10** — The cell size **MUST** be configurable and **SHOULD** be of the order of the most
frequent query radius.

**SPX-11** — The service **SHOULD** offer a **visibility** query combining distance, angle and
terrain occlusion, since that is what perception and crime actually need (GP-47). Querying the
terrain happens through a port, not by importing `MAP`.

**SPX-12** — In development mode the index **SHOULD** be able to expose its own cells for diagnostic
visualization.

## Test criteria

- Equivalence with a brute-force scan over 10⁴ random positions: same results, same order.
- Performance: 10⁴ radius queries over 10³ entities within the declared budget, with zero
  allocations.
- The bitmask filter correctly excludes entities lacking the capability.
- Moving an entity within the same cell does not cause a reinsertion.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-6.3 (queries by capability), ARC-13 (performance)
- [`entity-registry.md`](./entity-registry.md) · [`utility-ai.md`](./utility-ai.md) ·
  [`affordance.md`](./affordance.md)

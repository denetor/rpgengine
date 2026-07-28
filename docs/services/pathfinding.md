# PATH — Pathfinding

**Area:** Agents · **Nature:** generic · **Priority:** 3 · **Status:** proposed
**Requirement prefix:** `PATH-*`

## Purpose

Compute paths on a grid and answer the reachability questions the AI asks before even moving: *is it
reachable? how much does it cost to get there? what is the first step?*

The service computes paths; it **does not move** entities. Movement, with its physics and its
animations, belongs to the presentation.

## Contract

| Item | Value |
|---|---|
| Depends on | a **navigability port** (`(x,y) → cost`), implemented on top of `MAP` + `ENT` |
| Does NOT depend on | `excalibur`, `MAP`, `ENT`, other services |
| Consumed by | orchestration (execution of `AI`'s intents) |
| Dynamic state | path cache, request queues, connected components |
| Static state | parameters: heuristic, diagonals, tolerances |
| External data | per-terrain movement costs (from `MAP`), per-frame budget in the configuration |
| Events emitted | `path-ready`, `path-failed` |
| Order of magnitude | ~50 requests/second on 256×256 maps, within a budget of ~2 ms/frame |

## Public API (indicative)

```ts
interface NavigationPort {
  cost(x: number, y: number): number;      // Infinity = impassable
  width: number; height: number;
}

interface Pathfinder {
  /** Asynchronous request: the computation can be spread over several frames. */
  request(from: Cell, to: Cell, agent: AgentProfile): PathRequestId;
  poll(id: PathRequestId): PathResult | 'pending';
  cancel(id: PathRequestId): void;

  /** Immediate answer over short distances, within a node budget. */
  findImmediate(from: Cell, to: Cell, agent: AgentProfile, maxNodes: number): PathResult | 'too-far';

  /** O(1) reachability through connected components: to be called before searching. */
  isReachable(from: Cell, to: Cell, agent: AgentProfile): boolean;

  /** Flight: the best cell within a radius that maximizes the distance from the threats. */
  findFleeTarget(from: Cell, threats: readonly Cell[], radius: number, agent: AgentProfile): Cell | undefined;

  invalidate(region: Rect): void;
}
```

## Requirements

**PATH-1** — The service **MUST** depend only on a **navigability port**, not on the map service: it
must be testable on a synthetic grid of costs (ARC-4.1).

**PATH-2** — The computation **MUST** be deterministic: for a given grid, endpoints and profile, the
returned path **MUST** always be the same, including how ties are broken in the priority queue
(ARC-9.4).

**PATH-3** — The service **MUST** support different **agent profiles**: an aquatic agent, a flying
one and a ground one read different costs on the same grid. The profile is data.

**PATH-4** — `isReachable` **MUST** answer in near-constant time through precomputed **connected
components**: this avoids launching expensive searches destined to fail, the worst case for
performance.

**PATH-5** — Requests **MUST** be spreadable **over several frames** with an explicit budget of
nodes explored per frame, never freezing the game (ARC-13.2).

**PATH-6** — Requests **MUST** have a priority: the path of the NPC chasing the player comes before
that of the farmer walking home.

**PATH-7** — Paths **MUST** be invalidated when navigability changes (door closed, bridge
collapsed), reacting to `cell-changed`: invalidation **MUST** be **regional**, not global.

**PATH-8** — The service **MUST** support a **crossing cost** beyond simple passability: mud slows
you down, roads are preferred, a guarded area is avoided by someone with a bounty. Additional
contextual costs **MUST** be addable by the agent's profile.

**PATH-9** — The returned path **SHOULD** be **simplified** (removal of collinear nodes, smoothing)
before delivery, so that movement does not look like stair steps.

**PATH-10** — The service **MUST** offer a **flight** search: not a path towards a destination, but
the destination within a radius that maximizes the distance from the threats while staying
reachable. It is needed by GP-29 and cannot be expressed as an ordinary A-to-B search.

**PATH-11** — If the destination is occupied or impassable, the service **SHOULD** return the path
to the **nearest free cell** to it, instead of failing: that is nearly always what is wanted.

**PATH-12** — Paths **MUST NOT** be serialized: they are recomputable (ARC-10.4).

**PATH-13** — The computation **MUST NOT** allocate per explored node: structures are reused across
requests (ARC-13.3).

**PATH-14** — The service **MUST NOT** move entities nor know their representation: it returns
cells.

## Test criteria

- On known synthetic grids (mazes, corridors, isolated areas) the path is optimal and reproducible.
- `isReachable` is consistent with the outcome of the full search over 10⁴ random pairs.
- A request spread over several frames produces the same result as an immediate one.
- Regional invalidation does not clear the cache for the whole map.
- The flight search from three threats picks the expected cell.
- Performance: 50 requests on a 256×256 map within the declared budget, with zero allocations.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-13 (performance)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-13, GP-29
- [`map.md`](./map.md) · [`utility-ai.md`](./utility-ai.md)

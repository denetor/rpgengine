# BB — Blackboard

**Area:** Agents · **Nature:** generic · **Priority:** 3 · **Status:** proposed
**Requirement prefix:** `BB-*`

## Purpose

Provide the **memory** on which agents reason: what an NPC knows, what their group knows, what is
known to everyone. It serves two purposes at once:

1. **sharing knowledge** between entities — if my companions are dead I lose courage and flee
   (GP-31); if a guard has seen the player steal, every guard in the city knows it;
2. **computing exactly once** what many need — the player's known position, the count of living
   allies, an area's alert level should not be recomputed by every NPC on every evaluation.

The blackboard is **memory, not truth**: it holds what the agent *believes*, which may be wrong or
stale. It is this distinction that makes NPCs believable — they look for the player where they last
saw them, not where they really are.

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, `ENT`, `AI`, other services |
| Consumed by | `AI` (which receives it as a read-only context), orchestration (which writes it) |
| Dynamic state | all the boards and their values, with timestamp and decay |
| Static state | key schema: type, scope, decay policy |
| External data | `content/ai/blackboard-keys.json` |
| Events emitted | `belief-changed` (optional, for immediate reactions) |
| Order of magnitude | ~10³ agents × ~20 keys, reads ~10⁴/second |

## Public API (indicative)

```ts
type Scope =
  | { kind: 'entity'; id: EntityId }     // private to the agent
  | { kind: 'group'; id: GroupId }       // squad, faction, pack
  | { kind: 'global' };                  // known to everyone

interface Blackboard {
  set<K extends BbKey>(scope: Scope, key: K, value: BbValue<K>, at: GameTimeMs): void;
  get<K extends BbKey>(scope: Scope, key: K, now: GameTimeMs): BbEntry<BbValue<K>> | undefined;
  forget(scope: Scope, key: BbKey): void;

  /** Cascading resolution: entity → groups it belongs to → global. */
  resolve<K extends BbKey>(id: EntityId, key: K, now: GameTimeMs): BbEntry<BbValue<K>> | undefined;

  /** Derived value computed at most once per tick and shared. */
  memo<T>(scope: Scope, key: DerivedKey, now: GameTimeMs, compute: () => T): T;

  joinGroup(id: EntityId, group: GroupId): void;
  leaveGroup(id: EntityId, group: GroupId): void;

  /** Read-only view passed to the reasoner (AI-3). */
  snapshot(id: EntityId, now: GameTimeMs): BlackboardView;
}

interface BbEntry<T> { value: T; writtenAt: GameTimeMs; confidence: number; }
```

## Requirements

**BB-1** — Three scopes **MUST** exist: **entity** (private), **group** (squad, faction, pack) and
**global**. An entity **MUST** be able to belong to several groups.

**BB-2** — Reading **MUST** resolve in a cascade — entity, then groups, then global — with
precedence to the most specific and a deterministic order for consulting the groups (ARC-9.4).

**BB-3** — Every value **MUST** carry a **timestamp** and a **confidence**: the reader must be able
to tell *"the player is here"* from *"the player was here thirty seconds ago"*.

**BB-4** — Keys **MUST** support a **decay** policy declared in data: hard expiry, linear decay of
the confidence, or permanence. Decay **MUST** be computed at read time, not with a periodic sweep
over all the entries.

**BB-5** — Keys **MUST** be typed: reading a key with the wrong type **MUST** be a compile error. No
`Record<string, any>` board.

**BB-6** — The blackboard **MUST** offer **per-tick memoization** (`memo`) for expensive derived
values shared by several agents: number of living allies, group centroid, area alert level. The
computation happens **at most once per tick**, and the result **MUST** be identical for all readers
in the same tick.

**BB-7** — The service **MUST NOT** contain decision logic: it does not decide what to do with what
it knows. It is memory, not reasoning (separation from `AI`).

**BB-8** — The service **MUST NOT** know the entities: it receives `EntityId`s and values. It does
not query `ENT`, does not read positions. It is the orchestration that writes what the agents
perceive.

**BB-9** — A **read-only view MUST** be passed to the reasoner: the AI reads, it does not write.
Writing during evaluation would make the outcome depend on the order of the agents.

**BB-10** — The state **MUST** be serializable: an NPC who has seen the player steal **MUST**
remember it after loading. The only entries excluded are those marked as ephemeral.

**BB-11** — Knowledge propagation among the members of a group **MUST NOT** be instantaneous by
default: it **MUST** be modellable as a write to the group scope with a configurable delay or
communication radius, so that information spreads plausibly.

**BB-12** — Keys **MUST** be declared as data (name, type, allowed scope, decay): the set of facts an
NPC can remember is **content**, not code (ARC-7.1).

**BB-13** — Removing an entity **MUST** clean up its private board and its memberships, leaving no
dangling entries.

**BB-14** — In development it **SHOULD** be possible to inspect an agent's board in order to
understand why it made a decision: it is the primary AI debugging tool.

## Test criteria

- Cascading resolution returns the most specific value, with a deterministic group order.
- Confidence decays as declared; an expired entry is no longer returned.
- `memo` computes exactly once per tick and returns the same value to 100 readers.
- Serialization round trip with ephemeral entries correctly excluded.
- Removing an entity leaves neither entries nor memberships.
- The service works with made-up keys and scopes (ARC-3.4).

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-29, GP-31
- [`utility-ai.md`](./utility-ai.md) · [`affordance.md`](./affordance.md) · [`time.md`](./time.md)

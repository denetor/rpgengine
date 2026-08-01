# LOOT — Loot tables and drops

**Area:** Game rules · **Nature:** generic · **Priority:** 3 · **Status:** proposed
**Requirement prefix:** `LOOT-*`

## Purpose

Decide **what drops** when an enemy dies, a chest is opened, a herb is picked. It takes a table and a
context, and returns a list of items.

The service is small by choice: it creates no entities, fills no containers, knows nothing about the
inventory. It draws from tables. But it is the point where **perceived randomness** matters more
than anywhere else, because loot is what the player watches most closely and on which they build
theories about how the game works.

## Contract

| Item | Value |
|---|---|
| Depends on | an `RND` stream · `EXPR`, injected as an evaluator, for the conditions on the tables (ARC-7.3, EXPR-14) |
| Does NOT depend on | `excalibur`, `INV`, `ENT`, other services |
| Consumed by | orchestration (on an entity's death, on opening a container) |
| Dynamic state | pity counters · the state of the filtered channels belongs to `RND` (RND-9) |
| Static state | loot tables |
| External data | `content/loot/*.json` |
| Events emitted | none: it returns a result |

## Public API (indicative)

```ts
interface LootTable {
  id: LootTableId;
  rolls: { min: number; max: number };            // how many draws
  entries: readonly LootEntry[];
  guaranteed?: readonly LootEntry[];              // always present
}

type LootEntry =
  | { kind: 'item'; item: ItemId; weight: number; quantity: { min: number; max: number };
      conditions?: readonly LootCondition[] }
  | { kind: 'table'; table: LootTableId; weight: number }      // nested tables
  | { kind: 'nothing'; weight: number };

interface LootService {
  roll(table: LootTableId, ctx: LootContext): Result<readonly LootDrop[], LootError>;
}

interface LootContext {
  readonly channel: string;            // for filtered randomness (RND-9)
  readonly luck?: number;
  readonly tags?: readonly string[];   // conditions: area, time, difficulty
}
```

## Requirements

**LOOT-1** — Loot tables **MUST** be **validated data**, never code (ARC-7.1). Every `ItemId` named
**MUST** exist, as verified by the content integrity check (ARC-7.5).

**LOOT-2** — Tables **MUST** support **nesting**: a table may draw from other tables. Recursion
**MUST** be detected at validation time, not at runtime.

**LOOT-3** — A draw **MUST** use the weights through `RND`'s primitive (RND-8), without
reimplementing it.

**LOOT-4** — Entries **MUST** be able to carry **conditions** (area, time of day, requester's tags,
quest state) evaluated with the shared precondition interpreter (ARC-7.3). The service **MUST NOT**
evaluate them itself: it receives an already-resolved context or an injected evaluator.

**LOOT-5** — The service **MUST** support per-channel **filtered randomness** (RND-9): loot from the
same type of enemy **MUST NOT** repeat the same item many times in a row, even when the probability
would allow it. The service merely passes the `channel` to `RND.filtered()`: it keeps no memory of
its own and does not reimplement the filter.

**LOOT-6** — The service **SHOULD** support a **pity** mechanism: the probability of a rare item
grows with every unsuccessful draw and resets when it is obtained. It reduces the frustration of the
long tail without altering the declared average.

**LOOT-7** — The state of the **pity counters** **MUST** be serialized: saving and reloading **MUST
NOT** be usable to manipulate outcomes. The **filter**'s state does not belong to this service:
channel memories belong to `RND`, which maintains them (RND-9) and serializes them (RND-13). LOOT
passes a `channel` and nothing else.

The division is not arbitrary. **Pity** is a game rule — "after N empty attempts the rare item is
guaranteed" — and lives where the loot rules live. The **filter** is a randomness technique, and
lives in the game's single source of randomness.

**LOOT-8** — A draw **MUST** be reproducible given the `RND` stream and the context.

**LOOT-9** — The service **MUST** return **drop descriptions** (item, quantity, initial state), not
instances placed into containers: creating the entities or filling the inventory is up to the
orchestration (ARC-4.1).

**LOOT-10** — It **MUST** be possible to declare **guaranteed** entries, which do not go through the
draw: the boss always leaves their key.

**LOOT-11** — Tables **MUST** be able to express a variable number of draws and the possibility that
a draw yields nothing, without contrivances such as an implicit "empty" entry.

**LOOT-12** — The service **MUST** offer an offline tool for the **statistical analysis** of a
table: effective probabilities, expected value, unreachable items. Nested tables with weights make
the real probability far from intuitive, and that is how drops nobody has ever seen come about.

## Test criteria

- Over 10⁶ draws, the frequencies match the declared weights within tolerance.
- Nested tables produce the expected compound probabilities.
- The filter reduces consecutive repetitions compared with the unfiltered weighted draw. The
  resulting distribution does **not** match the nominal weights — the filter shifts it by
  construction (RND-9); monotonicity and a golden vector are asserted, as in `random.md`.
- The pity counter guarantees the item within the declared maximum.
- A recursive table is rejected at validation time.
- Same seed and same context → same loot.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-25
- [`random.md`](./random.md) · [`inventory.md`](./inventory.md) · [`combat.md`](./combat.md)

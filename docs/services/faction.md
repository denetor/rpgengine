# FAC — Factions and reputation

**Area:** Game rules · **Nature:** generic · **Priority:** 3 · **Status:** proposed
**Requirement prefix:** `FAC-*`

## Purpose

Keep faction membership, the player's reputation with each of them, the individual relationship with
single NPCs, and the relations between factions.

A faction, here, is any group with a collective identity: the citizens of a city, a merchants'
corporation, a thieves' guild, a religious order, a wolf pack. The service does not distinguish:
they are all factions with levels, reputation and relations.

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, `ENT`, `DLG`, other services |
| Consumed by | orchestration; `DLG` and `ECO` receive the **values** through the facts view |
| Dynamic state | reputation per faction, individual modifiers, membership rank |
| Static state | faction definitions, ranks, relations, attitude thresholds |
| External data | `content/factions/*.json` |
| Events emitted | `reputation-changed`, `standing-changed`, `rank-changed`, `faction-joined`, `faction-left`, `became-hostile` |

## Public API (indicative)

```ts
interface FactionDefinition {
  id: FactionId;
  ranks: readonly { id: RankId; threshold: number; benefits: readonly Benefit[] }[];
  relations: Readonly<Record<FactionId, number>>;    // -1..1: allied … enemy
  propagation: number;                               // how much changes propagate to allies
  thresholds: readonly { at: number; standing: Standing }[];   // hostile, wary, neutral, friendly
}

interface FactionService {
  reputation(faction: FactionId): number;
  /** Effective reputation towards a single NPC: faction + individual modifier. */
  standingWith(npc: EntityId, npcFactions: readonly FactionId[]): { value: number; standing: Standing };

  applyDelta(source: ReputationSource, delta: FactionDelta): CommandResult<readonly ReputationChange[]>;
  applyPersonalDelta(npc: EntityId, delta: number): CommandResult<void>;

  rank(faction: FactionId): RankId | undefined;
  hasBenefit(faction: FactionId, benefit: BenefitId): boolean;
  areHostile(a: FactionId, b: FactionId): boolean;
}
```

## Requirements

**FAC-1** — The service **MUST** treat factions of different natures uniformly — geographical,
professional, criminal, religious — without distinct types (GP-40).

**FAC-2** — Every faction **MUST** have **N ranks** with thresholds and benefits declared in data,
which unlock advantages and dialogue options (GP-41).

**FAC-3** — There **MUST** be a player reputation with each faction, on a declared scale bounded at
the extremes (GP-42).

**FAC-4** — There **MUST** be an **individual modifier** per NPC, combined with the faction one
according to a declared rule (GP-43). An NPC **MUST** be able to be the player's friend while
belonging to a hostile faction.

**FAC-5** — An NPC **MUST** be able to belong to **several factions**; the effective reputation
towards them is a deterministic and documented combination of the factions they belong to, plus the
individual modifier.

**FAC-6** — **Relations between factions MUST** partially propagate changes: helping the city guard
worsens reputation with the thieves (GP-44). Propagation **MUST** be limited to one step, or at any
rate be non-recursive, to avoid uncontrollable cascades.

**FAC-7** — The service **MUST** return a discrete **attitude** (hostile, wary, neutral, friendly,
devoted) derived from the continuous value through thresholds with **hysteresis**: without
hysteresis an NPC oscillates between hostile and neutral around the threshold.

**FAC-8** — Changes **MUST** emit events only when something observable changes (a threshold
crossed, a rank changed), not on every single-point increment.

**FAC-9** — The service **MUST NOT** decide the consequences: it does not attack, does not change
prices, does not open dialogues. It supplies values and attitudes; the consequences belong to the
orchestration (ARC-4.1).

**FAC-10** — Factions **MUST** be defined as data, relations, ranks and thresholds included
(ARC-7.1). Adding a faction **MUST NOT** require changes to the code.

**FAC-11** — The service **MUST** support **non-symmetric** reputations and per-faction initial
values, including factions that are hostile from the start.

**FAC-12** — Factions **MUST** be usable as **groups** for the blackboard (BB-1): the city guard is
both a faction and a group that shares knowledge. The wiring belongs to the orchestration, it is not
an import between services.

**FAC-13** — The service **MUST** be cheaply queryable: `standingWith` is evaluated continuously by
the AI and on every dialogue opening.

**FAC-14** — The state **MUST** be serializable, with individual modifiers indexed by stable
`EntityId`.

**FAC-15** — The service **MUST** work with made-up factions, including non-hierarchical structures
(ARC-3.4).

## Test criteria

- Propagation between allied and enemy factions produces the expected changes, with no cascades.
- Hysteresis prevents the attitude oscillating around the threshold.
- The rank changes exactly when the threshold is crossed, with a single event.
- The combination of several factions and the individual modifier is deterministic and documented.
- Serialization round trip with hundreds of individual modifiers.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-40…GP-44, GP-38, GP-45, GP-48
- [`dialog.md`](./dialog.md) · [`economy.md`](./economy.md) · [`crime.md`](./crime.md) ·
  [`blackboard.md`](./blackboard.md)

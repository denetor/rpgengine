# CBT — Combat

**Area:** Game rules · **Nature:** domain · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `CBT-*`

## Purpose

To be the **single point** at which damage is computed and a status effect is applied. It receives a
hit request with all the necessary data, and returns the outcome and the events produced.

The defect this service exists to prevent is documented in
[`previous-version/ASSESSMENT-REPORT.md`](../previous-version/ASSESSMENT-REPORT.md): several
independent implementations of `takeHit`, each with its own rules, reaching into other objects'
state with `(other as any).model`. One formula, one typed contract.

## Contract

| Item | Value |
|---|---|
| Depends on | an `RND` stream |
| Does NOT depend on | `excalibur`, `ENT`, `STAT`, other services |
| Consumed by | orchestration |
| Dynamic state | current health, active status effects, recovery timings, threat |
| Static state | damage types, resistance tables, status definitions, formulas |
| External data | `content/combat/damage-types.json`, `status-effects.json`, `formulas.json` |
| Events emitted | `damage-dealt`, `damage-blocked`, `status-applied`, `status-expired`, `entity-died`, `knockback-applied` |

## Public API (indicative)

```ts
interface DamageInfo {
  readonly source: EntityId | 'environment';
  readonly amount: number;
  readonly type: DamageTypeId;
  readonly knockback?: { direction: Vector2; force: number };
  readonly statuses?: readonly StatusApplication[];
  readonly canCrit: boolean;
  readonly tags: readonly DamageTag[];          // 'melee' | 'ranged' | 'magic' | 'trap' | …
}

interface CombatSnapshot {                       // supplied by the caller: the service does not look for it
  readonly resistances: Readonly<Record<DamageTypeId, number>>;
  readonly defense: number;
  readonly currentHealth: number;
  readonly maxHealth: number;
  readonly guardState: GuardState;               // block, dodge, i-frames
  readonly immunities: readonly DamageTypeId[];
}

interface CombatService {
  resolve(target: EntityId, snap: CombatSnapshot, dmg: DamageInfo, now: GameTimeMs)
    : CommandResult<DamageOutcome>;
  applyStatus(target: EntityId, status: StatusApplication, now: GameTimeMs): CommandResult<void>;
  tickStatuses(now: GameTimeMs): CommandResult<void>;
  heal(target: EntityId, amount: number, source: EntityId | 'item'): CommandResult<HealOutcome>;
}
```

## Requirements

### A single formula

**CBT-1** — There **MUST** be **a single point** where damage is computed. No other part of the code
**MUST** be able to reduce an entity's health (GP-19).

**CBT-2** — Damage **MUST** go through the typed `DamageInfo` structure. No reaching into other
objects' properties through casts: the caller supplies an explicit `CombatSnapshot`.

**CBT-3** — The formula **MUST** be declared in data and documented, with the order in which factors
are applied made explicit (base → variation → resistance → defence → critical → reductions →
minimum).

**CBT-4** — The computation **MUST** be deterministic given the `RND` stream: no `Math.random()`
(ARC-9.2). Damage variation **SHOULD** use the Gaussian source (RND-6), not the uniform one: hits
cluster around the nominal value, with rare tails.

**CBT-5** — The service **MUST NOT** read other services' state: it receives everything it needs.
That is what makes it testable with made-up data.

### Game rules

**CBT-6** — There **MUST** be **damage types** with per-entity resistances and vulnerabilities
(GP-14). The set of types is **data**: adding one does not touch the code.

**CBT-7** — There **MUST** be **timed status effects** — poison, bleeding, stun, slow, buffs and
debuffs — with declared duration, periodicity, intensity and **stacking** rules (replaces, adds,
refreshes the duration, has a maximum number of applications) (GP-15).

**CBT-8** — Statuses **MUST** expire through `TIME` (TIME-7), not with private counters, so that they
survive saving and pausing correctly.

**CBT-9** — A hit **MUST** be able to produce **knockback** and **hitstun** parameterized by the
weapon (GP-16). The service computes their magnitude and direction; applying them to movement is the
presentation's job, reacting to the event.

**CBT-10** — **Blocking, dodging and invulnerability windows MUST** be supported: the guard state is
part of the snapshot, and the outcome distinguishes a full hit, a blocked one, a dodged one and a
completely avoided one (GP-17).

**CBT-11** — The service **MUST** treat melee, ranged and magical attacks the same way, for the
player and for NPCs (GP-18): they differ in the data, not in the code path.

**CBT-12** — Damage **MUST** be able to come from the environment (traps, fire, falling) with no
source entity.

**CBT-13** — An entity marked as **unkillable** (quest NPC, GP-27) **MUST NOT** be able to die:
damage is applied down to a minimum threshold and the outcome declares this explicitly. The rule
**MUST** live here, not be remembered at every point that deals damage.

**CBT-14** — Death **MUST** be an outcome computed by the service, which emits `entity-died` exactly
once. An already dead entity **MUST NOT** be able to die again, nor take damage.

**CBT-15** — The service **SHOULD** keep a **threat table** per target (who hit me, how much, when):
it is what lets the AI react believably (GP-29) without reconstructing it itself.

**CBT-16** — Entities **MUST** be able to be immune to specific damage types and statuses.

**CBT-17** — The result **MUST** be a rich structure (damage dealt, damage absorbed, critical, kill,
statuses applied and refused), not a number: it is what feeds the HUD, floating numbers, sounds and
AI.

**CBT-18** — The service **MUST NOT** move entities, play animations or sounds: it emits events.

## Test criteria

- The formula produces the expected values on a table of known cases, including immunity, total
  resistance, vulnerability and minimum damage.
- Same seed → same sequence of hits, criticals and variations.
- Status stacking rules behave as declared for each policy.
- A quest NPC taken below zero survives, with an explicit outcome.
- A dead entity takes no further damage nor emits a second `entity-died`.
- Statuses survive a save cycle with the correct remaining duration.
- The service works with made-up damage types and statuses (ARC-3.4).

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-14…GP-19, GP-27
- [`stats.md`](./stats.md) · [`random.md`](./random.md) · [`time.md`](./time.md) ·
  [`loot.md`](./loot.md)

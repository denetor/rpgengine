# STAT — Attributes and progression

**Area:** Game rules · **Nature:** domain · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `STAT-*`

## Purpose

Hold the **attributes**, the **skills** and the **perks** of the entities, compute the derived values
(health, energy, carrying capacity, defences) and manage progression.

This game's progression model is deliberately different from the classic one: **there are no
levels**. There is no single number summarizing the character's power, there are no experience
points to spend. Individual attributes grow through **training with masters**, skills also grow
**with use**, and some **perks** arrive when thresholds are crossed or as time passes. The service
must make this model natural, not emulate it on top of a level-based system.

## Contract

| Item | Value |
|---|---|
| Depends on | `EXPR`, injected as an evaluator, for the derived-value formulas (STAT-6, EXPR-12) |
| Does NOT depend on | `excalibur`, other services |
| Consumed by | orchestration; `CBT`, `INV`, `DLG`, `ECO` receive the **values**, not the service |
| Dynamic state | base values, per-skill experience, unlocked perks, active modifiers |
| Static state | definitions of attributes, skills, perks, formulas for derived values |
| External data | `content/stats/attributes.json`, `skills.json`, `perks.json`, `derived.json` |
| Events emitted | `attribute-raised`, `skill-improved`, `perk-unlocked`, `derived-changed`, `training-completed` |

## Public API (indicative)

```ts
interface StatBlock {
  base(attr: AttributeId): number;
  effective(attr: AttributeId): number;        // base + modifiers, with caps
  skill(skill: SkillId): number;
  hasPerk(perk: PerkId): boolean;
  derived(stat: DerivedId): number;            // health, energy, carrying capacity, defence…
}

interface StatsService {
  train(id: EntityId, attr: AttributeId, quality: number): CommandResult<TrainingOutcome>;
  useSkill(id: EntityId, skill: SkillId, difficulty: number): CommandResult<SkillCheck>;

  addModifier(id: EntityId, m: StatModifier): CommandResult<ModifierId>;   // equipment, buff, encumbrance
  removeModifier(id: EntityId, m: ModifierId): CommandResult<void>;

  meets(id: EntityId, req: readonly Requirement[]): boolean;   // equip and dialogue requirements
  evaluate(id: EntityId): StatBlock;
}
```

## Requirements

### Model

**STAT-1** — There **MUST NOT** be any character level nor a global experience counter: progression
happens per **individual attribute** (GP-1).

**STAT-2** — Attributes **MUST** improve through **training with masters**, with cost, time and limit
depending on the master and on the current value (GP-2). A master **MUST** be able to teach up to a
maximum of their own: beyond that, a better master is needed.

**STAT-3** — **Skills** (lockpicking, alchemy, persuasion, bargaining) **MUST** be distinct from
attributes and improve **with use**, with diminishing returns, and/or with training (GP-4).

**STAT-4** — **Perks MUST** unlock when thresholds on one or more attributes are crossed or as time
passes, not by spending points (GP-3). The conditions are data.

**STAT-5** — **Derived values** (health, energy, mana, carrying capacity, defences) **MUST** be
computed from formulas declared in data, never stored as independent values that can diverge (GP-6).
The exception is **current values** — current health — which are state, while the maximum is derived.

**STAT-6** — The formulas for derived values **MUST** be data-driven and expressed with the shared
expression interpreter (ARC-7.3), not as TypeScript functions for each derived value.

### Modifiers

**STAT-7** — Modifiers (equipment, buffs, debuffs, encumbrance, wounds) **MUST** be **tracked by
origin** and individually removable: taking off the armour removes exactly its contribution.

**STAT-8** — The order in which modifiers are applied (additive, multiplicative, caps) **MUST** be
declared and deterministic: two modifiers applied in a different order **MUST** give the same result
(ARC-9.4).

**STAT-9** — The effective value **MUST** be computable without side effects and **SHOULD** be
memoized with invalidation on every modifier change: it is read many times per frame.

**STAT-10** — Every attribute and skill **MUST** have a declared minimum, maximum and cap; no code
path **MUST** be able to take a value out of range.

### Interoperability

**STAT-11** — The service **MUST** expose `meets(requirements)` as the single primitive for
equipment, dialogue and interaction requirements (GP-5, GP-39): a single evaluation point, reused by
everyone.

**STAT-12** — Skill checks (lockpicking, persuasion) **MUST** be resolved by this service with a
single mechanism, using the appropriate `RND` stream, and return a structured outcome (success,
margin, critical) instead of a boolean.

**STAT-13** — The service **MUST NOT** know about combat, inventory or dialogues: it supplies values
and verdicts. Deciding what to do with them is the orchestration's job (ARC-4.1).

**STAT-14** — Every permanent change **MUST** emit the corresponding event, so that HUD, audio and
journal react without polling the state.

**STAT-15** — The set of attributes, skills and perks **MUST** be defined as **data**: adding an
attribute **MUST NOT** require changes to the code. It is also what makes the service reusable in a
game with a different character model.

## Test criteria

- The effective value is independent of the order in which modifiers are applied.
- Removing equipment returns exactly to the previous values, with no drift over 10³ cycles.
- Repeated use of a skill improves it along the expected diminishing-returns curve.
- A perk unlocks exactly when the threshold is crossed, exactly once.
- Derived values change consistently as the base attributes vary.
- The service works with a made-up set of attributes (ARC-3.4).

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-1, GP-2, GP-3, GP-4, GP-5, GP-6, GP-21, GP-22
- [`combat.md`](./combat.md) · [`inventory.md`](./inventory.md) · [`dialog.md`](./dialog.md)

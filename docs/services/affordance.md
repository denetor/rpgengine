# AFF — Affordances and perception

**Area:** Agents · **Nature:** generic · **Priority:** 4 · **Status:** proposed
**Requirement prefix:** `AFF-*`

## Purpose

Let the elements of the world **advertise what they offer**, and let the agents discover it without
knowing them.

A water source declares "I reduce thirst". A rabbit declares "I am food, for whoever is strong
enough to catch me". A chair declares "you can sit here". A fire declares "I give warmth, and I burn
whoever comes too close".

The gain is structural: **adding an object to the world adds a possible behaviour to every NPC,
without touching the AI.** Without this service, every new object would require a new action
hardwired into the reasoner, and the AI would grow along with the object catalogue.

## Contract

| Item | Value |
|---|---|
| Depends on | abstract ports for proximity and for reading components (not `SPX` or `ENT` directly) |
| Does NOT depend on | `excalibur`, `AI`, other services |
| Consumed by | orchestration, which composes its results into `AI`'s context |
| Dynamic state | claims in progress, availability, cooldowns |
| Static state | catalogue of affordances and their requirements |
| External data | `content/ai/affordances.json` |
| Events emitted | `affordance-claimed`, `affordance-released`, `affordance-consumed` |
| Order of magnitude | ~10² active affordances per area |

## Public API (indicative)

```ts
interface AffordanceOffer {
  readonly provider: EntityId;
  readonly kind: AffordanceKind;                  // 'drink' | 'sit' | 'eat' | 'warm' | 'hide' | …
  readonly satisfies: Partial<Record<NeedId, number>>;   // how much it reduces which need, 0..1
  readonly requires?: readonly Requirement[];     // minimum strength, item held, faction…
  readonly cost?: { timeMs: number; risk: number };
  readonly capacity: number;                      // how many agents at once
  readonly exclusive: boolean;
}

interface AffordanceService {
  /** Offers perceivable by an agent: filtered by distance, requirements and availability. */
  query(seeker: SeekerSnapshot, near: readonly EntityId[], now: GameTimeMs): readonly AffordanceOffer[];

  claim(offer: AffordanceOffer, seeker: EntityId, now: GameTimeMs): CommandResult<ClaimId | 'unavailable'>;
  release(claim: ClaimId, now: GameTimeMs): CommandResult<void>;
  consume(claim: ClaimId, now: GameTimeMs): CommandResult<void>;
}
```

## Requirements

**AFF-1** — An entity **MUST** be able to declare its own affordances through a component
(`Provides`), as archetype data: it is the concrete form of ARC-6.2 applied to intentions (GP-32).

**AFF-2** — An affordance **MUST** declare **which needs it satisfies and to what degree**, on a
scale comparable with the AI's inputs (`0..1`): that is what lets the reasoner compare drinking,
eating and resting without knowing their nature.

**AFF-3** — An affordance **MUST** be able to declare **requirements** on the seeker — minimum
strength, diet (carnivore), item held, faction membership, not being hostile to the provider. The
rabbit is food, but only for whoever is strong enough to catch it.

**AFF-4** — An affordance **MUST** be able to declare a **cost**: time required and risk. A reasoner
must be able to prefer a nearby pool to a distant river, and a safe river to a guarded one.

**AFF-5** — The service **MUST** manage **capacity and claiming**: a chair takes one person, a fire
four. An exclusive affordance already claimed **MUST NOT** be offered to others, preventing ten NPCs
from converging on the same object.

**AFF-6** — Claims **MUST** expire: an agent who dies, changes their mind or is interrupted **MUST
NOT** block the object forever. Expiry goes through `TIME`.

**AFF-7** — An affordance **MUST** be able to be **consumable** (a berry disappears, a pool dries
up) or **regenerable** with a cooldown.

**AFF-8** — The provider **MUST NOT** know the seeker and vice versa: the connection is made by
**affordance kind**, never by identity. A new drinkable object is immediately usable by every
existing thirsty agent, without changing anything.

**AFF-9** — The service **MUST NOT** decide: it proposes options that can be evaluated. The choice
belongs to `AI` (separation of responsibilities).

**AFF-10** — The search **MUST** start from candidates already filtered by the spatial index, not
from a scan of the world (ARC-13.1), and be limited by a maximum number of offers returned.

**AFF-11** — The service **MUST** model **perception**: an affordance is offered only if the seeker
can notice it, according to distance, viewing angle, occlusion or memory (they saw it in the past,
`BB`). An NPC **MUST NOT** magically know every water source on the map.

**AFF-12** — The service **MUST** also be able to model **negative** or dangerous affordances (fire
burns, a cliff kills), so that the reasoner can avoid them with the same mechanism it uses to seek
the others.

**AFF-13** — The affordance catalogue **MUST** be validated data (ARC-7): affordance kinds, needs
satisfied, requirements and costs **MUST NOT** be hardwired in the code.

**AFF-14** — Claims **MUST** be serialized or cleanly cancelled on save: no orphan claim after
loading.

**AFF-15** — The **player SHOULD** also be able to query nearby affordances: it is what feeds the
interface's contextual interaction — "drink", "sit", "talk", "pick the lock" (GP-54).

## Test criteria

- A thirsty agent receives the water source among the offers; a sated agent does not.
- An unmet requirement excludes the offer (the weak wolf does not see the rabbit as food).
- An exclusive affordance that has been claimed does not appear to other seekers; on expiry it
  reappears.
- A consumed affordance disappears; a regenerable one reappears after the cooldown.
- An affordance behind a wall is not perceived; if already known from memory, it is.
- Adding a new affordance kind to the data requires no changes to the AI code (ARC-3.4).

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-32, GP-47, GP-54
- [`utility-ai.md`](./utility-ai.md) · [`blackboard.md`](./blackboard.md) ·
  [`entity-registry.md`](./entity-registry.md) · [`spatial-index.md`](./spatial-index.md)

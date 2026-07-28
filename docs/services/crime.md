# CRM — Crime and notoriety

**Area:** Game rules · **Nature:** domain · **Priority:** 4 · **Status:** proposed
**Requirement prefix:** `CRM-*`

## Purpose

Establish when a player action is a crime, who notices it, and what consequences follow in terms of
bounty and notoriety with the factions.

The principle that holds the whole service up: **a crime exists only if someone sees it.** Stealing
in an empty room is not an offence; stealing in front of a guard is. That makes the system a matter
of *perception* before it is a matter of rules.

## Contract

| Item | Value |
|---|---|
| Depends on | a **perception port** (implemented on top of `SPX`/`AFF`) |
| Does NOT depend on | `excalibur`, `FAC`, `ENT`, other services |
| Consumed by | orchestration |
| Dynamic state | bounties per faction, known crimes, witnesses, search state |
| Static state | catalogue of offences, severity, statute of limitations, jurisdiction rules |
| External data | `content/crime/offenses.json`, `jurisdictions.json` |
| Events emitted | `crime-witnessed`, `bounty-changed`, `crime-reported`, `bounty-cleared`, `arrest-demanded` |

## Public API (indicative)

```ts
interface CrimeReport {
  readonly offense: OffenseId;              // theft, assault, murder, burglary, trespassing
  readonly perpetrator: EntityId;
  readonly victim?: EntityId;
  readonly at: Cell;
  readonly jurisdiction: FactionId;
  readonly severity: number;
}

interface CrimeService {
  /** The orchestration declares the fact; the service decides whether and by whom it is perceived. */
  report(crime: CrimeReport, witnesses: readonly WitnessSnapshot[], now: GameTimeMs)
    : CommandResult<CrimeOutcome>;

  bounty(faction: FactionId, who: EntityId): number;
  isWanted(faction: FactionId, who: EntityId): boolean;
  payBounty(faction: FactionId, who: EntityId, amount: number): CommandResult<void>;
  serveSentence(faction: FactionId, who: EntityId): CommandResult<void>;

  /** Statute of limitations and forgetting: crimes age. */
  tick(now: GameTimeMs): CommandResult<void>;
}
```

## Requirements

**CRM-1** — An action **MUST** produce consequences only if **observed** by a witness able to
perceive it: distance, field of view, occlusion, lighting, noise (GP-47). The evaluation goes
through a perception port, not through an imported `SPX` (ARC-4.1).

**CRM-2** — The catalogue of offences, their severity and the competent jurisdiction **MUST** be
data (ARC-7.1). What counts as an offence depends on the place: hunting is lawful in the woods, not
in the baron's reserve.

**CRM-3** — A witness **MUST** have to **report** the crime for it to produce a bounty: reporting
takes time, a journey towards an authority, and can be prevented (the witness flees or is
eliminated). Without this step the system becomes an instant and unconvincing punishment.

**CRM-4** — The bounty **MUST** be **per faction and per jurisdiction**: being wanted in one city
**MUST NOT** imply being wanted everywhere (GP-48).

**CRM-5** — Notoriety **MUST** have consequences observable through events: hostile guards, worse
prices, foreclosed dialogue options, arrest. The consequences are **applied by the orchestration**,
not by this service (ARC-4.1).

**CRM-6** — The service **MUST** distinguish a **known crime** (a bounty exists) from a **suspected
crime** (a witness saw but has not reported): they are different states with different consequences.

**CRM-7** — Knowledge of the crime **MUST** propagate through the group blackboard (BB-1, BB-11),
with a delay: the city's guards learn about it in plausible times, not instantly. The wiring belongs
to the orchestration.

**CRM-8** — Crimes **MUST** have a **statute of limitations**: severity and bounty decay over time
according to declared rules, through `TIME`.

**CRM-9** — There **MUST** be ways of clearing the bounty: payment, a prison sentence, a faction's
intercession, bribery. Each with its own consequences (money, time, reputation).

**CRM-10** — Stolen items **MUST** be markable as **stolen**, with consequences on selling (ECO-7).
The mark decays or is removed according to a rule.

**CRM-11** — The service **MUST** be applicable to NPCs too, not just to the player: an NPC who
kills another NPC in front of a guard **MUST** be treated by the same rules. It is the test that
proves the system is general and not a special case sewn onto the player.

**CRM-12** — The service **MUST NOT** decide the outcome of fights nor move guards: it emits events
and requests (`arrest-demanded`), which the AI and the orchestration translate into behaviour.

**CRM-13** — The state **MUST** be serializable: bounties, known crimes and witnesses in transit.

## Test criteria

- A crime with no witnesses produces no bounty; with a witness and a successful report, it does.
- Eliminating the only witness before the report prevents the bounty — and is itself a crime if
  observed.
- The bounty stays confined to the competent jurisdiction.
- The statute of limitations reduces the bounty as declared.
- The same rules applied to an NPC produce the same treatment (CRM-11).
- Serialization round trip with crimes and pending witnesses.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-47, GP-48
- [`faction.md`](./faction.md) · [`affordance.md`](./affordance.md) ·
  [`spatial-index.md`](./spatial-index.md) · [`economy.md`](./economy.md)

# QST — Quests

**Area:** Game rules · **Nature:** generic · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `QST-*`

## Purpose

Keep the progress state of the quests and evaluate, against what happens in the world, whether an
objective is achieved, failed or unlocked.

The service is an **interpreter of state machines defined in data**: it knows no quest in
particular. "Find Aramis's sword" is a file, not a class.

## Contract

| Item | Value |
|---|---|
| Depends on | the shared **precondition/effect interpreter** (ARC-7.3) |
| Does NOT depend on | `excalibur`, `INV`, `DLG`, `ENT`, other services |
| Consumed by | orchestration, HUD (journal), `DLG` (through the evaluator) |
| Dynamic state | state of every quest, achieved objectives, counters, timestamps |
| Static state | quest definitions |
| External data | `content/quests/*.json` |
| Events emitted | `quest-started`, `objective-completed`, `quest-advanced`, `quest-completed`, `quest-failed`, `quest-reward-granted` |

## Public API (indicative)

```ts
interface QuestDefinition {
  id: QuestId;
  titleKey: TextKey;                      // I18N key, not text (I18N-1)
  stages: readonly QuestStage[];
  prerequisites: readonly Condition[];
  failConditions?: readonly Condition[];
  repeatable: boolean;
}

interface QuestStage {
  id: StageId;
  objectives: readonly Objective[];       // discriminated union: kill, collect, reach, talk, escort…
  completion: 'all' | 'any' | { count: number };
  onEnter?: readonly Effect[];
  onComplete?: readonly Effect[];
  next?: StageId | readonly { to: StageId; when: Condition }[];   // branches
}

interface QuestService {
  start(id: QuestId, ctx: WorldFacts): CommandResult<StartOutcome>;
  /** The single entry point for world facts: the orchestration turns events into facts. */
  notify(fact: WorldFact, ctx: WorldFacts): CommandResult<readonly QuestChange[]>;
  fail(id: QuestId, reason: FailReason): CommandResult<void>;

  status(id: QuestId): QuestStatus;
  isObjectiveComplete(id: QuestId, obj: ObjectiveId): boolean;
  active(): readonly QuestId[];
  journal(): readonly JournalEntry[];      // for the HUD: keys, not text
}
```

## Requirements

### Definition as data

**QST-1** — Quests **MUST** be defined in **validated data files**, editable by a narrative designer
without recompiling (ARC-7.1, ARC-7.4, GP-33).

**QST-2** — Objectives, preconditions and effects **MUST** be **typed discriminated unions**,
evaluated by the shared interpreter (ARC-7.3). The service **MUST NOT** contain a `switch` holding
the logic of every kind of quest.

**QST-3** — Every reference (item, NPC, area, another quest) **MUST** be verified by the content
integrity check (ARC-7.5): a quest that names a non-existent item **MUST** be detected before it
starts.

**QST-4** — Quests **MUST** support **stages** with multiple objectives and completion rules (all,
any, N out of M).

**QST-5** — Quests **MUST** support **branches**: the next stage may depend on a condition, rather
than simply being the next one in the list.

### Progress

**QST-6** — The service **MUST NOT** subscribe to the bus (ARC-4.3): it receives **world facts**
through `notify`, translated by the orchestration from the domain events. That way it stays queryable
with synthetic facts in a test.

**QST-7** — Evaluation **MUST** be idempotent with respect to repeated facts: the same fact
delivered twice **MUST NOT** advance an objective twice.

**QST-8** — **Failure MUST** be a first-class outcome, with conditions of its own and defined
consequences (alternative branches or closure), not merely the absence of success (GP-35).

**QST-9** — The service **MUST** declare the **rewards** as effects, without granting them: granting
them is the orchestration's job, talking to `INV`, `STAT` and `ECO` (ARC-4.1).

**QST-10** — The state of every quest **MUST** be cheaply queryable by dialogues, AI and the world
(GP-34): it is a very frequent read, and **MUST** be O(1).

**QST-11** — The service **MUST** produce the **journal** as data (text keys, status, visible and
hidden objectives), never as formatted text (I18N-8, GP-50).

**QST-12** — Objectives **MUST** be hideable until they are discovered, without the journal
revealing their existence.

**QST-13** — Quests **MUST** be able to be repeatable, with controlled state reset and a completion
counter.

**QST-14** — The state **MUST** be serializable and refer to the definitions by **stable ID**
(ARC-10.3).

**QST-15** — Loading a save with a quest definition **changed incompatibly** (a stage removed)
**MUST** be detected and reported, not ignored (SAVE-15).

**QST-16** — The service **MUST** work with made-up quests and objective types foreign to this game:
objective types are an extensible set, registered from the outside (ARC-3.4).

## Test criteria

- A synthetic three-stage quest with branches advances along the right branch given the facts
  supplied.
- The same fact delivered twice does not produce double progress.
- A failure condition closes the quest with the expected outcome and allows no further progress.
- Serialization round trip with half-done quests, counters included.
- The journal exposes keys, never text.
- A definition that names a non-existent id is rejected at validation time.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-20, GP-27, GP-33, GP-34, GP-35, GP-50
- [`dialog.md`](./dialog.md) · [`inventory.md`](./inventory.md) · [`faction.md`](./faction.md)

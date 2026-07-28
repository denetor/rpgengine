# DLG — Dialogues

**Area:** Game rules · **Nature:** generic · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `DLG-*`

## Purpose

Conduct a conversation: given a dialogue node and the state of the world, establish which options
are available, which are visible but foreclosed, and where each choice leads.

The service is an **interpreter of graphs defined in data**. It contains no lines, contains no text:
it contains keys and conditions. The lines live in the content files, the texts in the localization
catalogues.

## Contract

| Item | Value |
|---|---|
| Depends on | the shared **precondition/effect interpreter** (ARC-7.3) |
| Does NOT depend on | `excalibur`, `QST`, `FAC`, `STAT`, `INV`, other services |
| Consumed by | orchestration, HUD |
| Dynamic state | nodes already visited per speaker, unlocked topics, conversation in progress |
| Static state | dialogue graphs |
| External data | `content/dialogs/*.json` + `I18N` catalogues |
| Events emitted | `dialog-started`, `dialog-node-entered`, `dialog-choice-made`, `dialog-ended`, `topic-unlocked` |

## Public API (indicative)

```ts
interface DialogNode {
  id: NodeId;
  speaker: SpeakerRef;
  textKey: TextKey;                      // a key, never text (I18N-1)
  choices: readonly DialogChoice[];
  onEnter?: readonly Effect[];
  once?: boolean;
}

interface DialogChoice {
  id: ChoiceId;
  textKey: TextKey;
  conditions: readonly Condition[];      // quests, reputation, attributes, items, visited nodes
  hiddenIfUnmet: boolean;                // false ⇒ shown but disabled, with a reason
  effects: readonly Effect[];
  goto: NodeId | 'end';
}

interface DialogService {
  /** `facts` is a read-only view supplied by the orchestration: the service queries nobody. */
  start(dialog: DialogId, speaker: EntityId, facts: WorldFacts): CommandResult<DialogView>;
  choose(choice: ChoiceId, facts: WorldFacts): CommandResult<DialogView>;
  end(): CommandResult<void>;

  hasVisited(speaker: EntityId, node: NodeId): boolean;
  availableTopics(speaker: EntityId, facts: WorldFacts): readonly TopicId[];
}
```

## Requirements

### Conditioning

**DLG-1** — Options **MUST** be able to depend on **previous dialogues** with that speaker (visited
nodes, choices made), stored per speaker-node pair (GP-36).

**DLG-2** — Options **MUST** be able to depend on the **state of the quests** (GP-37).

**DLG-3** — Options **MUST** be able to depend on **reputation**, both faction-wide and individual
towards that speaker (GP-38).

**DLG-4** — Options **MAY** depend on attributes, skills, perks and items held (GP-39), evaluated
through the same requirement primitive used elsewhere (STAT-11).

**DLG-5** — All conditions **MUST** be evaluated by the **shared interpreter** on a facts view
supplied by the caller: the service **MUST NOT** query `QST`, `FAC` or `STAT` (ARC-4.1). That is
what makes it possible to test a dialogue with made-up facts.

**DLG-6** — An unavailable option **MUST** be able to be either **hidden** or **shown as foreclosed
with the reason** ("requires Persuasion 40"), at the designer's choice for each option: they are two
different play experiences, both legitimate.

### Structure

**DLG-7** — Dialogues **MUST** be validated data, editable without recompiling (ARC-7.4).

**DLG-8** — Every reference (quest, item, text key, destination node) **MUST** be verified by the
integrity check: **no unreachable node**, no `goto` towards a non-existent node, no missing text key
(ARC-7.5).

**DLG-9** — The service **MUST NOT** contain text: only keys. Resolution happens in the presentation
through `I18N` (I18N-8).

**DLG-10** — The **effects** of choices **MUST** be declared as data and **returned**, not executed:
giving an item, starting a quest, changing reputation, opening trade are the orchestration's actions
(ARC-4.2).

**DLG-11** — Dialogues **MUST** support reusable **topics** shared among several speakers (asking for
directions, asking about a rumour), without duplicating the graphs.

**DLG-12** — The service **MUST** support **unique lines** (`once`) and fallback nodes for when all
content is exhausted.

**DLG-13** — The state **MUST** be serializable and compact: storing the visited nodes per speaker
**MUST NOT** grow without bound with the length of the game.

**DLG-14** — The service **MUST** handle a single active conversation at a time, with explicit
closure, and **MUST** be able to interrupt it cleanly (the NPC dies, the player flees) without
leaving pending state.

**DLG-15** — Evaluating the available options **MUST** be cheap enough to be done on every node
opening for every option.

**DLG-16** — The service **MUST** work with made-up graphs and condition types (ARC-3.4).

**DLG-17** — Dialogues **SHOULD** be generatable or extensible by external tools: the format **MUST**
be simple to produce by machine as well as readable by hand.

## Test criteria

- A synthetic graph offers the expected options as the supplied facts vary.
- A foreclosed but not hidden option reports the correct reason.
- `once` lines do not reappear; the fallback appears when expected.
- Validation detects unreachable nodes, broken `goto`s and missing keys.
- Interrupting a conversation halfway leaves no active state.
- Serialization round trip with many speakers and visited nodes.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-36, GP-37, GP-38, GP-39, GP-2
- [`quest.md`](./quest.md) · [`faction.md`](./faction.md) · [`localization.md`](./localization.md)

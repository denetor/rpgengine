# DLG — Dialogues

**Area:** Game rules · **Nature:** generic · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `DLG-*`

## Purpose

Conduct a conversation: given a dialogue and the state of the world, establish which options are
available, which are visible but foreclosed, and what the conversation produces.

The service does **not** implement a dialogue graph of its own. Dialogues are written in **ink**
(inkle's narrative language) with the **Inky** editor, and are executed by the **inkjs** runtime. The
service is the **adapter** around that runtime: it feeds ink the facts of the world, translates ink's
output into the project's vocabulary — text keys, typed effects, options with a reason — and keeps
inkjs from leaking anywhere else.

The division of labour is deliberate:

| Owned by ink | Owned by this service |
|---|---|
| Graph structure, diverts, weave | Facts → ink variables projection |
| Visit counts, `once`, sticky choices, fallbacks | Foreclosed-but-visible options and their reason |
| Reusable topics (knots, stitches, tunnels, threads) | Tag vocabulary: text ids, effects, requirements |
| Narrative variables and their memory | Serialization, story-version guard |
| Compile-time verification of every divert | Everything the project's architecture requires |

The service still contains **no text and no game rules**: it contains keys, conditions and effects,
all as data. The lines live in the `.ink` files, the texts in the localization catalogues.

## Contract

| Item | Value |
|---|---|
| Depends on | the **inkjs** runtime (internal detail, DLG-18) · `EXPR`, injected as an evaluator (ARC-7.3, EXPR-14) |
| Does NOT depend on | `excalibur`, `QST`, `FAC`, `STAT`, `INV`, other services |
| Consumed by | orchestration, HUD |
| Dynamic state | ink narrative variables, visit counts, active-conversation flag, compiled-story fingerprint |
| Static state | compiled ink stories |
| External data | `content/dialogs/*.ink` (source) → `content/dialogs/*.ink.json` (compiled) + `I18N` catalogues |
| Events emitted | `dialog-started`, `dialog-line-entered`, `dialog-choice-made`, `dialog-ended`, `topic-unlocked` |
| Order of magnitude | tens of stories, hundreds of knots each; one conversation at a time |

## Authoring pipeline

```
 Inky  ──writes──▶  content/dialogs/*.ink        (source of truth, versioned in git)
                          │
                          ├── build: inklecate / inkjs compiler ──▶  *.ink.json   (runtime artefact)
                          ├── build: line-id pass ──────────────────▶  # id: tags written back
                          ├── build: extraction ────────────────────▶  locales/<lang>/dialog.json
                          └── build: tag lint ──────────────────────▶  pass / fail
                          │
 dev  ──inkjs/full compiles the .ink on load──▶  no game rebuild needed
 prod ──loads the .ink.json only─────────────▶  no compiler in the bundle
```

Inky's third export format, `.js`, is not used: it is the compiled JSON wrapped in a global variable
for the standalone web export, and the global couples the content to the page.

## Tag vocabulary

Everything the engine needs from a line or a choice, beyond the prose, travels as an ink **tag**.
The vocabulary is closed and versioned (DLG-20):

| Tag | Attached to | Meaning |
|---|---|---|
| `# id: grd_greet_04` | line, choice | Stable localization id. Becomes the `TextKey` |
| `# speaker: guard_captain` | line | Who is speaking. Absent ⇒ the conversation's speaker |
| `# effect: give_item(sword_01)` | line, choice | A declared effect, **returned** to the orchestration |
| `# req: skill.persuasion >= 40` | choice | A requirement whose failure leaves the choice **visible and foreclosed** |
| `# topic: rumours` | knot | Marks a knot as a reusable topic |

A choice hidden when unavailable uses ink's own conditional syntax instead
(`* {knows_about_murder} [Ask about the murder]`), because that is what the writer expects to write
in Inky. `# req:` exists for the other case only, where a reason has to be shown.

## Public API (indicative)

```ts
type DialogId = string & { readonly __brand: 'DialogId' };
type ChoiceIndex = number & { readonly __brand: 'ChoiceIndex' };

interface DialogLine {
  textKey: TextKey;                      // an ink `# id:` tag, never text (I18N-1)
  speaker: SpeakerRef;
  effects: readonly Effect[];            // declared, not applied (DLG-10)
}

interface DialogOption {
  index: ChoiceIndex;                    // valid only for the view that produced it
  textKey: TextKey;
  available: boolean;
  reason?: RequirementReport;            // present only when available === false
}

interface DialogView {
  lines: readonly DialogLine[];          // what has been said since the previous view
  options: readonly DialogOption[];
  ended: boolean;
}

interface DialogService {
  /** `facts` is a read-only view supplied by the orchestration: the service queries nobody. */
  start(dialog: DialogId, speaker: EntityId, facts: WorldFacts): CommandResult<DialogView>;
  choose(option: ChoiceIndex, facts: WorldFacts): CommandResult<DialogView>;
  end(): CommandResult<void>;

  hasVisited(dialog: DialogId, knot: KnotName): boolean;
  availableTopics(speaker: EntityId, facts: WorldFacts): readonly TopicId[];

  serialize(): DialogSaveState;
  deserialize(state: DialogSaveState): Result<void, StateError>;
}
```

No ink or inkjs type appears in these signatures. That is the whole point of DLG-18.

## Requirements

### Runtime and pipeline

**DLG-18** — The ink runtime **MUST** be an internal detail of the service: no ink or inkjs type, and
no ink concept beyond those named here, **MUST** appear in the public API, in the domain events or in
the saved state. Replacing the runtime **MUST NOT** require touching the callers.

**DLG-19** — The `.ink` sources **MUST** be the versioned source of truth; the compiled `.ink.json`
**MUST** be the runtime artefact. The development build **MUST** compile the sources on load, so that
a narrative designer can edit a dialogue and reload without rebuilding the game (ARC-7.4); the
production build **MUST** load the compiled artefact only, without shipping the compiler.

**DLG-20** — The tag vocabulary **MUST** be a closed, typed and versioned set. An unknown tag, a
malformed tag or a tag on the wrong kind of element **MUST** fail at load time with file, knot and
line (ARC-7.2) — never be ignored at runtime.

**DLG-21** — The `.ink` sources **MUST NOT** use ink's own randomness — `RANDOM()`, `SEED_RANDOM()`,
shuffle sequences `{~ … }` — and the check **MUST** be automatic on the compiled artefact. Where a
dialogue needs a random outcome, the orchestration draws it from `RND` and passes it in among the
facts, so that determinism keeps a single owner (ARC-9.2).

**DLG-22** — Any `EXTERNAL` function bound to the story **MUST** be a **pure read** over the facts
view. Binding a function that mutates the world would move the effects inside the service and break
ARC-4.2; the check **MUST** be automatic.

### Conditioning

**DLG-1** — Options **MUST** be able to depend on **previous dialogues** with that speaker, using
ink's visit counts and narrative variables (GP-36).

**DLG-2** — Options **MUST** be able to depend on the **state of the quests** (GP-37).

**DLG-3** — Options **MUST** be able to depend on **reputation**, both faction-wide and individual
towards that speaker (GP-38).

**DLG-4** — Options **MAY** depend on attributes, skills, perks and items held (GP-39), evaluated
through the same requirement primitive used elsewhere (STAT-11).

**DLG-5** — The facts of the world **MUST** arrive as a read-only view supplied by the caller and be
projected into the story as read-only ink variables before every evaluation: the service **MUST NOT**
query `QST`, `FAC` or `STAT` (ARC-4.1). That is what makes it possible to play a dialogue through
with made-up facts.

**DLG-6** — An unavailable option **MUST** be able to be either **hidden** or **shown as foreclosed
with the reason** ("requires Persuasion 40"), at the writer's choice for each option: they are two
different play experiences, both legitimate. Hiding uses ink's conditional choices; the foreclosed
case uses `# req:`, evaluated by the shared interpreter, which also produces the reason.

**DLG-23** — Selecting a foreclosed option **MUST** be rejected as an error, leaving the story state
untouched: the guard belongs to the service, not to the interface that draws the option.

### Content and structure

**DLG-7** — Dialogues **MUST** be content editable without recompiling the game (ARC-7.4, DLG-19).

**DLG-8** — Integrity **MUST** be verifiable offline (ARC-7.5), in two complementary passes: the ink
compiler covers the structure — no divert to a non-existent knot, no unreachable content — and a lint
over the compiled artefact covers what the compiler cannot know: every `# effect:` and `# req:`
parses into the typed union, every id it names (quest, item, skill, faction) exists, every `# id:`
exists in the localization catalogues.

**DLG-9** — The service **MUST NOT** return text: only keys. The `.ink` file holds the prose of the
**source language**, and the build assigns every line a stable `# id:`, extracts it into the `I18N`
catalogues and hands the id to the service as the `TextKey`. Resolution happens in the presentation
through `I18N` (I18N-8). Falling back to the inline ink prose **MAY** be allowed in a development
build, and **MUST NOT** be in a production one.

**DLG-24** — Line ids **MUST** be stable across edits to the source: rewording a line, moving it
inside a knot or reordering the choices **MUST NOT** change its id, otherwise every translation is
lost at each revision. Ids are written back into the `.ink` file, so that Inky and the catalogues
never drift apart.

**DLG-10** — The **effects** of lines and choices **MUST** be declared as `# effect:` tags and
**returned**, not executed: giving an item, starting a quest, changing reputation, opening trade are
the orchestration's actions (ARC-4.2). Ink variables **MUST** be used for narrative memory only,
never as the game's state of record.

**DLG-11** — Dialogues **MUST** support reusable **topics** shared among several speakers (asking for
directions, asking about a rumour), without duplicating content: ink's knots, tunnels and threads,
marked with `# topic:`.

**DLG-12** — The service **MUST** support **unique lines** and fallback content for when everything
is exhausted, relying on ink's visit counts rather than on a mechanism of its own.

**DLG-14** — The service **MUST** handle a single active conversation at a time, with explicit
closure, and **MUST** be able to interrupt it cleanly (the NPC dies, the player flees) without
leaving pending state.

**DLG-15** — Evaluating the available options **MUST** be cheap enough to be done on every view, for
every option: the facts projection and the `# req:` evaluations are on the interaction's hot path.

**DLG-16** — The service **MUST** work with made-up stories, made-up facts and made-up effect types
(ARC-3.4): nothing of this game's model may be hard-coded in it.

**DLG-17** — Dialogues **MUST** stay machine-readable and machine-writable: `.ink` is a plain text
format, diffable and reviewable, and the compiled artefact is generatable by external tools.

### State

**DLG-13** — The saved state **MUST** be the service's own, not inkjs's internal blob: narrative
variables and visit counts, referenced by name (ARC-10.3). It **MUST NOT** grow without bound with
the length of the game.

**DLG-25** — Saving **MUST NOT** be possible with a conversation open: the state saved is the state
between conversations. This is what makes DLG-13 possible, since a suspended callstack can only be
expressed as compiled paths.

**DLG-26** — The saved state **MUST** carry a **fingerprint of the compiled story**. On loading a
save produced by a different version of the content, the service **MUST** restore the variables and
visit counts that still exist, discard the others, and report what it discarded — never fail
silently, and never restore into a story that no longer matches.

## Test criteria

- A synthetic story offers the expected options as the supplied facts vary.
- A foreclosed but not hidden option reports the correct reason, and choosing it is rejected without
  the story state moving.
- Unique lines do not reappear; the fallback appears when expected.
- The tag lint detects a malformed effect, an unknown quest id and a missing localization key.
- The compiled artefact is rejected if it contains ink randomness (DLG-21).
- No test needs to name inkjs: the suite talks to `DialogService` only (DLG-18).
- Interrupting a conversation halfway leaves no active state.
- Serialization round trip with many stories and visit counts; a save taken against an older story
  fingerprint restores the surviving variables and reports the rest.
- Reusability proof (ARC-3.4): a story with a made-up domain — invented effect types and requirement
  types — plays through with facts that have nothing to do with this game.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-36, GP-37, GP-38, GP-39, GP-2
- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-3.4, ARC-4.2, ARC-7, ARC-9.2, ARC-10
- [`adr/0003`](../adr/0003-dialogues-in-ink.md) — why ink, and why not the idiomatic way of using it
- [`quest.md`](./quest.md) · [`faction.md`](./faction.md) · [`localization.md`](./localization.md)
- ink: [the language](https://github.com/inkle/ink) (C# reference implementation) ·
  [Inky](https://github.com/inkle/inky) (editor) ·
  [inkjs](https://github.com/y-lohse/inkjs) (the JavaScript runtime actually used)
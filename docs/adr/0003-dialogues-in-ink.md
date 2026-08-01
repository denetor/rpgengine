---
status: accepted
---

# Dialogues written in ink, executed by inkjs

The first draft of `DLG` described a dialogue graph of our own: nodes and choices in JSON, validated
by a schema, walked by an interpreter of a few hundred lines. It is the obvious solution, and the
interpreter really is easy. We chose instead to write the dialogues in **ink** with **Inky**, compile
them to JSON, and run them with **inkjs** — accepting a third-party runtime inside `engine/`, which
nothing else in the project does.

The reason is that the interpreter was never the expensive part. **Writing the content is.** What our
format would have lacked is not execution: it is an editor with live preview, weave syntax, tunnels
and threads, visit counts, and a compiler that refuses a divert to a knot that does not exist. That
is a year of tooling we would not have built, and a narrative designer would have paid for it in
every dialogue. Ink is exactly that, mature, MIT-licensed, with a JavaScript runtime that has zero
dependencies and does not touch the DOM — so ARC-1.2 survives intact.

Note that `inkle/ink` itself is C#: only the compiler output is portable. The runtime we depend on is
**inkjs**, a separate project and a separate maintenance risk. DLG-18 exists so that risk stays
containable: no ink type crosses the service's public surface, so replacing the runtime is a rewrite
of one adapter, not of the game.

## What the choice costs

- **Two mechanisms for conditioning a choice** (DLG-6). Ink can only *hide* an unavailable option;
  it cannot produce "requires Persuasion 40" as data, because to ink that requirement is an
  expression, not a value. So hiding uses ink's native `* {cond} […]` and the visible-but-foreclosed
  case uses a `# req:` tag evaluated by our interpreter. Unifying on tags was rejected: it would take
  conditional choices away from the writer, which is fighting the tool we adopted the tool for.
  Unifying on ink is impossible — the reason string has nowhere to come from.
- **A linter in place of a type system** (DLG-20, DLG-21, DLG-22). Our own JSON with Zod would have
  given validated, typed content for free. Ink gives a text format with tags on it, so everything the
  schema used to guarantee — the effect vocabulary, the ids it names, the absence of ink randomness,
  the purity of the `EXTERNAL` bindings — now has to be checked by a lint pass over the compiled
  artefact. That lint is not a nicety: without it those requirements are decoration.
- **`state.toJson()` is not used** (DLG-13, DLG-25, DLG-26). Persisting inkjs's own state blob is the
  obvious move and it is wrong here: the blob is keyed on compiled paths, so editing a dialogue
  invalidates every save, and a suspended callstack cannot be migrated at all. We save our own state
  — variables and visit counts by name — which forces the rule that **a game cannot be saved with a
  conversation open**. That is a gameplay constraint produced by a technical decision, and it is the
  kind of thing that should not be discovered by reading the persistence code. In a top-down RPG
  where conversation is modal and short, the price is small; it would not be in a game where dialogue
  runs alongside play.
- **Ink's randomness is forbidden** (DLG-21). `RANDOM()`, `SEED_RANDOM()` and shuffle sequences work
  perfectly well, and each one is a second random number generator outside `RND`, invisible to
  ARC-9.2 and to the portability guarantee of [ADR 0001](./0001-bit-for-bit-reproducibility.md).
  Auditing that generator is more work than banning it: where a dialogue needs chance, the
  orchestration draws it and passes it in as a fact.

## The part that will look like an oversight

Ink's idiomatic way to make something happen is an external function: `EXTERNAL give_item(id)`, bound
by the host, called from the story. It is in every tutorial. **We forbid it** (DLG-22): effects
travel as `# effect:` tags and are *returned* to the orchestration, which applies them (ARC-4.2).

Whoever arrives from Unity will read the adapter, find tag parsing where a binding should be, and
conclude that we did not know about external functions. The detour buys two things. A dialogue stays
playable end to end **with no other service present** — the reusability proof of ARC-3.4 would be
impossible if choosing an option handed an item to an inventory that must exist. And the effects of a
conversation become inspectable data: they can be logged, replayed and tested without a world to
apply them to.

## Consequences on the requirements

No identifier is retired: DLG-1…DLG-17 all survive, several reworded because ink changes how they are
met, not what they demand. DLG-18…DLG-26 are new and are almost entirely the containment of this
decision. ARC-7.1 ("content lives in data files, JSON/YAML") is read as satisfied: `.ink` is a plain
text content format, diffable and reviewable, and its compiled form *is* JSON.

## Rejected alternatives

- **Our own graph format**, as in the first draft. Rejected because it leaves us owning an authoring
  problem forever, and the authoring problem outlives the interpreter.
- **Yarn Spinner.** Genuinely closer to our architecture: its native commands (`<<give_item sword>>`)
  map onto our declared effects far better than ink's tags, which would have removed the ugliest part
  of this ADR. Rejected on the runtime: the JavaScript port is less mature and less used than inkjs,
  and the editor story is weaker than Inky's. We preferred a worse fit on a solider foundation.
- **Ink with side-effecting external functions**, the idiomatic version. Rejected under ARC-4.2, for
  the reasons above.
- **Inky's `.js` export.** It is the compiled JSON wrapped in a global variable for the standalone web
  export; the global couples the content to the page and buys nothing over reading the `.json`.
- **Compiling `.ink` at runtime always.** One pipeline instead of two, but it ships the compiler in
  the production bundle and pays the compilation cost at every load. The compiler stays in the
  development build only, where it is what lets a designer reload without a rebuild (DLG-19).
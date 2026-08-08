# Grill log — ENT: the entity and component registry

**Date:** 2026-08-08
**Subject:** [`docs/services/entity-registry.md`](../../docs/services/entity-registry.md) — the sheet
of the service that owns identity, components and capability queries, step 4 of §7.2.
**Status:** decisions agreed **and applied**. The sheet, `spatial-index.md`, `game-context.md`,
`CONTEXT.md` and `REQUIREMENTS.md` were edited, and ADR-0005 was written. No code, no tickets.

The session began as a simplification pass on a sheet of fifteen requirements and ended somewhere
else. The first pass cut four requirements and reshaped four more; the grilling that followed found
that three of the survivors rested on things the sheet had never said, and added three requirements
back. **The sheet went 15 → 11 → 14.** That is the honest arc, and it is worth recording: the four
requirements that went were genuinely redundant, but the shortest version of the sheet was not the
truest one, because silence had been passing for simplicity.

What was not up for discussion, because the sheet had already fixed it: entities are compositions of
components and never class hierarchies (ENT-2), a component is usable as a marker (ENT-3), components
are added and removed at runtime (ENT-6), archetypes are validated data (ENT-7), the registry holds no
game logic, and spawn and despawn emit events the presentation reacts to (ENT-13).

---

## 0 — The four requirements cut before the grilling

Recorded for completeness; these were settled in the simplification pass, not in the interview.

- **ENT-9** (*the registry contains no game logic*) restates ARC-4.1 and was never separately
  testable. It is now a sentence in *Purpose*.
- **ENT-10** (*no component references an `Actor`*) was retired to ENT-11. The first rationale
  written down — *"the tooling enforces it"* — was **wrong and later corrected**:
  `dependency-cruiser`'s `engine-may-not-import-excalibur` catches the import, but not a component
  holding a closure or a plain reference to a presentation object. ENT-11's "plain serializable data"
  is what actually bites.
- **ENT-12** (*the player reachable by a stable reference*) has no business in a service declared
  *generic*: it names a concept of this game. It became CTX-12.
- **ENT-15** (*entities reference each other only by `EntityId`*) is ENT-11 seen from the
  serialization side. Merged.

Also cut in that pass, and not restored: **delta encoding of the save against the archetype's initial
values**, which "where it is worthwhile" made untestable; and the **variadic `each`** returning a
mapped tuple of components, in favour of `each(mask, visit(id))` plus `get`.

---

## 1 — Every component kind has a bit, not only the markers

**Decided:** the capability mask has one bit per `ComponentKind`. `Health` has a bit exactly as
`Targetable` does.

**Why:** `CONTEXT.md` defined *Capability* as declared by owning a **marker** component, which makes
capabilities a subset of components and implies two lists to keep aligned. The argument that closed it
is `each`: under the subset reading, `each(maskOf(Health, Poisoned))` — the shape of every rules pass
— is not expressible, and a second parameter type would be needed. The mask is not the catalogue of
interactions; it is **the index over the component store**. ARC-6.2 supports this reading: a component
must be *usable as* a marker, not *be* one.

**Consequence:** the glossary's *Capability* was rewritten — a capability is owning a kind, and the
marker component is the case where the component carries no data. And the mask must now be as wide as
the whole vocabulary, which is decision 2.

## 2 — A 64-bit budget, as two words

**Decided:** `CapabilityMask = { readonly lo: number; readonly hi: number }`, a ceiling of 64 kinds,
validated at load (ENT-17).

**Why:** the sheet claimed the mask "widens" past a machine word while declaring it a branded
`number` — a promise the type does not keep, because **JavaScript's bitwise operators coerce to
int32**. So `number` means a hard ceiling of 32, and 13 kinds are already named across the docs
(`Health`, `Combat`, `Inventory`, `Faction`, `Dialog`, `Loot`, `Interactable`, `Targetable`,
`Lockable`, `Flammable`, `Sittable`, `Lootable`, `Talkable`) with the obvious unwritten ones —
position, facing, stats, equipment, status effects, perception, routine, merchant, door, trap, corpse,
quest flags — roughly as many again. 32 saturates mid-project, and blowing the ceiling forces `ENT`,
`SPX` and every caller to change together.

**Rejected:** a `Uint32Array` of W words sized at load. It is the general answer, but no requirement
asks for generality here, and `capabilities(id)` returning a view onto the internal array would leak
mutable state — it would need `capabilitiesInto(id, out)` in the style of SPX-3.

**Consequence:** `capabilities(id)` returns the frozen object the registry already stores, so the call
does not allocate.

## 3 — The mask never crosses a serialization boundary

**Decided:** `entity-spawned` carries `{ id, archetype }`. The mask appears in no event, no save, no
persisted form. Whoever needs capabilities calls `capabilities(id)`.

**Why:** a bit position is a position in an array, and ARC-10.3 forbids dynamic state from depending
on one. The route into a save is real and indirect: **TIME-6 lets any member of the domain event union
be a timer payload, and TIME-13 writes pending timers — payload included — into the save file.** So a
mask in an event is a mask in a save, and a save read back after the content reordered a kind would
silently mean different capabilities, with nothing to fail on. The type system cannot see it: it is a
`number` and it looks fine.

`SPX` had already solved the same problem in the right direction — SPX-6 says the index is not
serialized, it is rebuilt. The mask is the same species of thing.

**Rejected:** keeping the mask in the event and forbidding reordering with an append-only kind
registry. It manages the hazard with a rule instead of removing it, and the violation makes no noise.
Also rejected: carrying the kind **names** in the event — reorder-proof, but an array allocated per
spawn against ENT-14's hundreds of spawns per frame, and duplicating what the archetype id says.

**Consequence:** the distinction now written into ENT-5 — the mask crosses a **service** boundary
in-process (the orchestration reads it and hands it to `SPX.insert`) but never a **serialization**
one.

## 4 — The id is the storage slot, and ENT-4's second clause is gone

**Decided:** `id − base` is a dense index; the id *is* the position. `each` walks in ascending id
order and tests the mask. The requirement that iteration cost track the rarest required kind was
**deleted, not weakened**.

**Why:** the sheet asked for three things that do not hold together — deterministic order, cost
proportional to the rarest kind, and hundreds of despawns per frame without expensive
reorganizations. Per-kind sorted lists make removal a shift, or buy it back with a position map per
kind plus a tombstone density plus a compaction policy per kind. Monotonic ids (ENT-1) dissolve the
conflict instead of balancing it: ascending slot order *is* ascending id order, so the ordering
cannot break because nothing ever moves, and ENT-14 becomes a property of the shape rather than a
requirement to defend.

The narrowing was given up on a distinction that is easy to lose: **`each` is called by rules passes,
a handful per tick, not by every agent.** The quadratic disaster `SPX` exists to prevent (ARC-13.1) is
10³ agents each scanning 10³ entities; this is ~10 passes over 10³ entities with two `AND`s apiece.
`AFF.query(seeker, near, now)` already receives a list `SPX` has filtered and never iterates the
registry.

**Consequence:** ADR-0005. And a claim made in this decision that turned out to be false — see 10.

## 5 — Two words: **archetype** and **component set**

**Decided:** the *archetype* is what a designer writes, composable and overridable; the **component
set** is the flat form it resolves to at load, and the only form the registry sees.

**Why:** after composition moved to load time, one word named two objects. `CONTEXT.md` defined
*Archetype* as composable while ENT-8 forbade the registry from knowing that archetypes derive from
one another — with a single word, that sentence forbids the registry from knowing what the word
means, which is how somebody ends up implementing inheritance resolution at runtime.

**Rejected:** one word with the lifecycle described in the definition, following the precedent of
*Configuration* in the same glossary. The deciding point was that `ComponentSet` was **already in the
sheet's API** without being in the glossary: the second word had been coined already, just never
declared.

## 6 — A save restores in full; the `ArchetypeId` is provenance

**Decided:** an entity comes back exactly as written. Content that changed does not reach entities
that already exist: a component added to `guard` appears only on guards spawned afterwards. The
archetype id is kept for reading a save and as the handle a `SAVE` migration needs.

**Why:** with delta encoding cut, nothing read the archetype id any more — it was either dead weight
or it existed for a reason nobody had stated. The reason is a hard-to-reverse decision about content
drift, and it had never been taken.

**Rejected:** re-deriving from the current component set and overlaying the saved values. To overlay,
one must distinguish "never touched" from "deliberately equal to the initial value" — which is delta
encoding back through the window — and a component removed from the content would silently delete
state.

## 7 — `overrides` replaces, and cannot add a kind

**Decided:** an override replaces the whole value of a kind the component set already declares. It
cannot introduce one. Gaining a capability has exactly one door: `add()`, which emits
`component-added`.

**Why:** if a spawn could add kinds, its mask would no longer be derivable from the archetype, the set
of shapes that exist in the game would stop being inspectable in the content, and the `ArchetypeId`
saved under decision 6 would no longer describe the entity it names. The use case that seems to
demand it — *"this guard is also a merchant"* — is what decision 5's composition makes cheap: it is an
archetype, `guard-merchant` = `guard` + `merchant`.

## 8 — A component set cannot be empty

**Decided:** an empty component set is a content error and fails at load (ENT-17).

**Why:** an entity owning nothing takes part in nothing. Forbidding it makes an all-zero mask mean
*"not alive"* and nothing else, so `isAlive` is exactly that test instead of a second state to keep
aligned with the mask — and the test criterion *"a dead id yields an all-zero mask"* stops being
ambiguous.

## 9 — The kind vocabulary is TypeScript in `game/`, not content

**Decided:** the game declares its own **ordered** list of kinds as a compile-time declaration and
hands it to `createEntityRegistry`. `ENT` knows no kind by name.

**Why:** `get<C extends ComponentKind>(id, kind: C): ComponentOf<C>` is a **typed** map, and
TypeScript types cannot be produced from JSON at runtime. Kinds in a content file would collapse
`ComponentOf<C>` to `unknown` and push a type assertion onto every caller — the opposite of what
branded `EntityId` and `CommandResult` do everywhere else. The ARC-7.1 objection does not land: its
list (*quests, dialogues, item and enemy definitions, loot tables, AI curves*) is **content**, things
that exist in the world. A kind is the **schema** content is written in. Archetypes stay data.

**Consequence:** CTX-13, decided in the same session — `createGameContext` **imports** the vocabulary
rather than taking it as an option, because it is not loaded, not configurable and not per-context,
and an option that can hold only one value is a hook for a need that does not exist. The order is:
`game/` declares the kinds → the content loader validates and flattens archetypes against them →
`LoadedContent` → `createGameContext` → `createEntityRegistry`. A content file naming a kind that does
not exist therefore fails at load, which is where CTX-10 says it must.

## 10 — Rebasing is impossible, so storage and iteration are split

**Decided:** the slot store never compacts, so ids stay valid forever; a **separate packed list of
live ids in ascending order** is what `each` walks, and that list compacts freely.

**Why:** this decision exists to correct one made an hour earlier. Decision 4 was presented with the
claim that slot-span growth could be handled by *"rebasing at an area load"*. **That is not merely
costly, it is impossible.** Rebasing renumbers ids, and ENT-11 has entities referencing each other by
`EntityId` **stored inside their own components** — which are opaque plain data to this service. The
registry does not know which fields are ids, so it cannot rewrite them, and a rebase would leave every
cross-reference pointing at the wrong entity, silently.

The split works because the two structures hold different things: the slot store holds
identity-by-position and must never move; the iteration list holds **ids**, so moving an entry there
changes nothing observable. One list, not one per kind, and its compaction is a `memmove` over ~10³
elements — the amortized reorganization ENT-14 permits.

**Consequence:** a generational index is now closed off for the same reason, which ADR-0005 records
so that nobody proposes it as the fix for the memory growth.

---

## What came out of it

**Three new requirements**, on things the sheet had been silent about: ENT-16 (the game declares the
vocabulary), ENT-17 (validation: ≤64 kinds, no duplicates, no empty component set), ENT-18 (the
semantics of `overrides`). Ids 9, 10, 12 and 15 stay retired and are not reused.

**One ADR:** [`0005`](../../docs/adr/0005-the-entity-id-is-the-storage-slot.md), covering decisions 4
and 10. Decisions 1 and 2 were considered for an ADR of their own and left in the sheet, which now
argues them.

**Four glossary entries** in `CONTEXT.md`: *Capability* rewritten, *Archetype* narrowed to the
authored form, *Component set* added, and *Component* replaced by *Component kind / component value*
— the old definition, *"a piece of domain data"*, was false for markers.

**Two sheets edited besides ENT's:** `spatial-index.md` (`TagMask` → `CapabilityMask`,
`updateTags` → `updateCapabilities`, SPX-2 and SPX-7 reworded — it was the second vocabulary ENT-5
claimed did not exist) and `game-context.md` (CTX-12, the well-known ids; CTX-13, the vocabulary).

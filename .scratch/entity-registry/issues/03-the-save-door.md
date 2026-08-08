# 03 — The save door: a world written, and read back as it was

**What to build:** a populated world that survives being written to a save and read back — the same
entities, under the same ids, owning the same components, with the ids of every cross-reference still
meaning what they meant.

`serialize()` returns this service's own portion of the dynamic state, with **a version of its own**,
and `restoreEntityRegistry` builds a registry from it. Restore is a **factory** and deliberately not
a method that reloads a live registry: one that could be reloaded would briefly hold one game's
entities and another's id counter, and every `EntityId` handed out before it would point at a
stranger (the reasoning of CTX-9, and the shape `restoreClock` already has).

**Each entity is written in full** — its component values, plus the `ArchetypeId` it was spawned
from. There is no delta encoding against the component set's initial values: an earlier draft asked
for it *"where it is worthwhile"*, which is not a testable condition, and at ~10³ live entities it
buys nothing while costing a second representation to keep correct.

**Loading restores what was written, and must not re-derive an entity from the current component
set.** This is the promise: a save reads back what it wrote. If the content changed between the save
and the load — a component added to `guard` — the guards already in the world come back **unchanged**,
and the new component appears only on guards spawned afterwards. The alternative was considered and
rejected in the [grill log](../grill-log.md) §6: overlaying saved values onto a fresh component set
requires distinguishing *"never touched"* from *"deliberately equal to the initial value"*, which is
the delta encoding back through the window, and a component removed from the content would silently
delete state.

The `ArchetypeId` is therefore kept as **provenance** — for reading a save with an editor, and as the
handle a `SAVE` migration needs to reach every entity of one kind without guessing. Content drift is a
migration's job, done deliberately, not a surprise sprung at load time.

**The id counter is part of the state.** After a restore, the next spawn must continue past the
highest id the save contained: an id must never be reused *across a save and reload* either, or a
timer that has not come due yet, a blackboard belief, or a quest's stored reference would come back
pointing at a stranger.

**What is deliberately absent:** no save file, no slots, no format, no migration machinery — those are
`SAVE`. No mask is written: a bit is a position in an array, and ARC-10.3 forbids dynamic state
depending on one. Nothing derived is written either — whatever can be rebuilt from the entities is
rebuilt (the iteration list of ADR-0005 among it), the way SPX-6 already says of the spatial index.

The sheet is [`docs/services/entity-registry.md`](../../../docs/services/entity-registry.md) and it is
normative — ENT-11, ENT-5, ARC-10.2…10.4. The spec is
[`docs/specs/ent-entity-registry.md`](../../../docs/specs/ent-entity-registry.md).

**Blocked by:** 02 — the registry (there is no world to write until entities exist).

**Status:** ready-for-agent

- [ ] A populated world serialized and restored yields the same live entities, under the same ids
- [ ] Every restored entity owns the same kinds with the same component values
- [ ] An entity referencing another by `EntityId` inside its own component still points at the same
      entity after the round trip
- [ ] The next id after a restore continues past the highest id in the save: no id is reused across a
      save and reload
- [ ] Despawned entities are absent from the state, and their ids are not reissued after the restore
- [ ] The originating `ArchetypeId` is written for every entity and survives the round trip
- [ ] A world restored against a component set that gained a kind comes back **unchanged**: the new
      kind is absent from the restored entities
- [ ] A world restored against a component set that lost a kind still carries that kind's values on
      the entities that had it
- [ ] Entities spawned **after** the restore do get the current component set
- [ ] The state carries its own version, exposed for `SAVE` to read
- [ ] No capability mask, and no bit position, appears anywhere in the state
- [ ] The state contains no functions, no class instances, no `Map`, no `Set` and no runtime
      reference: it satisfies the project's plain-data shape by construction
- [ ] A type-level spec compiles: `@ts-expect-error` on a component value carrying a function, a
      `Date`, a `Map` and a `Set`
- [ ] `serialize` does not mutate the registry, and a registry can be serialized twice with the same
      result
- [ ] Restoring does not replay events: no `entity-spawned` is produced by loading a world
- [ ] `restoreEntityRegistry` is a factory; there is no method that reloads a live registry
- [ ] Restoring a state whose version is unknown is refused, with a message naming the version found
- [ ] Every test enters through the service's public door; none names an internal module
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

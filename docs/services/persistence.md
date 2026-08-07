# SAVE — Persistence

**Area:** Core · **Nature:** generic · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `SAVE-*`

## Purpose

Turn the dynamic state of a game into a savable document and rebuild an identical game from it. It
manages multiple slots, autosave, versioning and migration.

It has to be designed **up front**, not at the end: deciding that a game must be savable determines
how state is modelled in every service (no runtime references, stable IDs, no closures in the
state). Adding saving afterwards means rewriting the models.

## Contract

| Item | Value |
|---|---|
| Depends on | an abstract **storage port** (`localStorage`, files, memory for tests) |
| Does NOT depend on | `excalibur`, other services |
| Consumed by | `game/bootstrap`, orchestration, HUD |
| Dynamic state | slot index, metadata (date, time played, area, screenshot) |
| Static state | migration catalogue |
| External data | none |
| Events emitted | `game-saved`, `game-loaded`, `save-failed` |

## Public API (indicative)

```ts
interface SaveDocument {
  formatVersion: number;                       // version of the envelope
  createdAt: string;
  meta: SaveMeta;                              // for the load screen
  services: Record<ServiceId, ServiceSnapshot>;
}

interface ServiceSnapshot { version: number; data: unknown; }

/** Every service with dynamic state implements this interface. */
interface Persistable<S> {
  readonly serviceId: ServiceId;
  readonly stateVersion: number;
  serialize(): S;
  deserialize(snapshot: unknown, version: number): Result<void, MigrationError>;
}

interface SaveService {
  save(slot: SlotId, ctx: GameContext): Promise<Result<SaveMeta, SaveError>>;
  load(slot: SlotId): Promise<Result<SaveDocument, SaveError>>;
  list(): Promise<readonly SaveMeta[]>;
  delete(slot: SlotId): Promise<void>;
}
```

## Requirements

**SAVE-1** — **Only the dynamic state MUST** be saved. Static definitions (items, quests, dialogues,
enemies, hand-drawn maps) **MUST NOT** end up in the save file: they are referenced by **stable ID**
(ARC-10.3). The **player's preferences MUST NOT** either: they hold for every slot, they have a store
of their own, and a save that carried them would restore somebody else's volume (SET-1).

**SAVE-2** — The serializable state **MUST NOT** contain references to `Actor`s, functions, `Map`,
`Set` or derived values that can diverge from a recomputation (ARC-10.4).

**SAVE-3** — Every service **MUST** serialize **only its own portion**, with a **version number of
its own**: the inventory's version evolves without touching the quests' one.

**SAVE-4** — The document **MUST** have an envelope format version, distinct from the versions of
the individual services.

**SAVE-5** — There **MUST** be **migrations** from version to version, per service, applied in a
chain. A missing migration **MUST** produce a diagnostic rejection, never a partial load (GP-61).

**SAVE-6** — Loading **MUST** be **atomic**: either the game is rebuilt in full, or the previous
state stays intact. No hybrid state.

**SAVE-7** — Saving **MUST** be atomic with respect to storage too: write to a temporary key and
swap, so as not to corrupt a slot if the operation is interrupted.

**SAVE-8** — There **MUST** be **multiple slots** plus a separate **autosave** slot, not
overwritable by a manual save (GP-60).

**SAVE-9** — Metadata **MUST** be readable **without deserializing the entire game**, so that the
load screen can be shown instantly.

**SAVE-10** — Storage **MUST** sit behind an abstract port, with at least three implementations:
`localStorage`, file system, and in-memory for tests.

**SAVE-11** — The save **MUST** include the RNG state (RND-3) and the pending timers (TIME-13):
without them the reloaded game is not the same game.

**SAVE-12** — The round trip **MUST** be verified: `serialize → deserialize → serialize` produces an
**identical** document. It is the test that guards against forgotten fields.

**SAVE-13** — Saving **MUST NOT** block the game perceptibly: if the document exceeds a threshold,
serialization **SHOULD** be spread over several frames or delegated.

**SAVE-14** — The service **MUST NOT** know the content of the data it serializes: it asks each
service for its own snapshot and stores it away. The shape of the state belongs to the service.

**SAVE-15** — The save **SHOULD** record the game version and a hash of the content: if the content
has changed incompatibly (a referenced quest no longer exists), loading **MUST** warn instead of
breaking halfway through a game.

## Test criteria

- Identical round trip on a rich game (full inventory, half-done quests, altered world).
- A game saved, reloaded and continued for 1000 ticks produces the same state as a game continued
  without saving (joint check with `RND` and `TIME`).
- Loading a document from a previous version applies the expected migrations.
- Loading a corrupted document leaves the current game intact.
- A field added to a service without updating `serialize()` makes the round-trip test fail.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-10 (serializability)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-58, GP-59, GP-60, GP-61
- [`game-context.md`](./game-context.md) · [`random.md`](./random.md) · [`time.md`](./time.md) ·
  [`settings.md`](./settings.md)

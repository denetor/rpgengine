# CTX — GameContext and composition

**Area:** Core · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `CTX-*`

## Purpose

Gather the service instances of a game into a single object, build them exactly once during
bootstrap and pass them around by injection. It is the structural replacement for global singletons:
it makes multiple games, tests with fake dependencies and a clean shutdown possible.

The GameContext is a **passive container**: it holds no game logic, mediates no calls, and is not a
service locator from which services fish out what they need at runtime.

## Contract

| Item | Value |
|---|---|
| Depends on | all services, **only in order to build them** during bootstrap |
| Does NOT depend on | `excalibur` |
| Consumed by | `game/bootstrap`, `game/orchestration`, `presentation` |
| Dynamic state | none of its own: it aggregates that of the services |
| Static state | the loaded content, passed to the services at construction |
| External data | none |
| Events emitted | none |

## Public API (indicative)

```ts
interface GameContext {
  readonly bus: EventBus<GameEvent>;
  readonly clock: Clock;
  readonly rng: RandomService;
  readonly entities: EntityRegistry;
  readonly map: MapService;
  readonly quests: QuestService;
  readonly settings: SettingsService;
  // …one field per service — but no `config`: see CTX-10 and CFG-15

  /** The well-known entities: reached by reference, never by scanning (CTX-12). */
  readonly playerId: EntityId;

  dispose(): void;
}

/** The single construction point for the whole graph. */
function createGameContext(options: {
  /** Archetypes arrive already resolved into flat component sets (ENT-8, CTX-13). */
  content: LoadedContent;
  /** The slices already composed and validated by `CFG`, consumed here and not kept. */
  config: Config;
  seed: number;
  save?: SaveGame;
}): GameContext;
```

## Requirements

**CTX-1** — The entire dependency graph **MUST** be built in **a single place**
(`createGameContext`), explicitly, with no automatic resolution and no decorators.

**CTX-2** — Every service **MUST** receive its own dependencies via the **constructor**. No service
**MUST** receive the whole `GameContext`: it would gain access to everything, cancelling the
boundaries (ARC-4.1).

**CTX-3** — There **MUST NOT** be any service instance exported at module level. An
`export const rng = new Rng()` is a violation.

**CTX-4** — It **MUST** be possible to create **two or more independent GameContexts** in the same
process, without either observing the other's effects. This is the test that proves the absence of
global state (ARC-8.3).

**CTX-5** — The construction order **MUST** be statically derivable: if the graph requires a
circular construction, the design is wrong and **MUST** be fixed, not worked around with deferred
initialization.

**CTX-6** — `dispose()` **MUST** release all resources and cancel all subscriptions: after
`dispose()`, a context **MUST NOT** react to any event nor retain memory.

**CTX-7** — The context **MUST** be constructible in **headless** mode, with no renderer, no canvas
and no assets: this is the mode used by the system tests (ARC-1.4).

**CTX-8** — Every dependency **MUST** be replaceable with a fake at construction time, without
modifying the code of the service that receives it.

**CTX-9** — The context **MUST** expose a `serialize()` that delegates its own portion of state to
each service, and a construction from a save file that retraces it (see `SAVE`).

**CTX-10** — Configuration and content **MUST** be loaded and **validated before** the context is
constructed: a context **MUST** never exist in a partially valid state.

The parameters are consumed here and **MUST NOT** be kept: each service receives its own slice
(CFG-8) and the composed result **MUST NOT** become a field of the context (CFG-15), or it would be
the service locator CTX-2 exists to prevent.

**CTX-11** — The context **MUST NOT** hold interface state (selection, active screen, focus): that
belongs to the presentation (ARC-8.4).

**CTX-12** — The entities the game must reach without looking for them — in this game, the player —
**MUST** be held here as explicit `EntityId` fields, established when the context is built or when a
save is loaded, and **MUST NOT** be found by scanning the registry for a marker component (ARC-5.2).

This is the one place where such an id can live. `ENT` is generic (ARC-3): it stores ids and
components and has no notion of a player, which is why the requirement that used to be ENT-12 was
retired in its favour. The services below **MUST NOT** receive the id implicitly either — a service
that needs to know whether an entity is the player receives it as an argument, like any other
`EntityId` (CTX-2).

A well-known id **MUST** refer to a live entity for the whole life of the context. A dead player is
an entity that has gained the components of death (ARC-6.4), not an entity that has been despawned:
despawning one is a bug to be caught in construction, not a state the readers have to guard against.

**CTX-13** — The **kind vocabulary** — the ordered list of `ComponentKind` from which ENT-5 derives
its bits and against which ENT-17 validates — is a **compile-time declaration in `game/`**, and
`createGameContext` **MUST** import it rather than take it as an option. It is not loaded, not
configurable and not per-context: a game has one vocabulary, and an option that can only ever hold
one value is a hook for a need that does not exist. Importing it inside the single construction point
is as explicit as CTX-1 asks for.

It is nonetheless what CTX-10 validates against, and the order matters: the content loader resolves
archetypes into **component sets** (ENT-8) and checks them against this vocabulary *before* the
context is built, so `LoadedContent` arrives already flat and already legal. A content file naming a
kind that does not exist fails there, not at the first spawn.

A frozen list of kinds is not the module-level service instance CTX-3 forbids: that prohibition is
about mutable state reached by importing it, and this is a constant the type system reads too. Nor
does it cost `ENT` its *generic* nature — the registry receives the vocabulary as an argument and
knows no kind by name (ENT-16), which is what lets the reusability proof call
`createEntityRegistry` directly with a vocabulary invented for the test (ARC-3.4).

## Test criteria

- Two contexts created with different seeds diverge; with the same seed and the same inputs they
  agree.
- After `dispose()`, no handler is registered on the bus.
- A context built entirely from fakes allows the orchestration to be exercised without real
  services.
- Creation with invalid content fails before any service is instantiated.
- `playerId` refers to a live entity right after construction and right after loading a save, and no
  code path reaches the player by iterating the registry (CTX-12).
- Content naming a component kind absent from the vocabulary fails while loading, before
  `createGameContext` is reached (CTX-13).

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-8 (no global state), ARC-4 (mute services)
- [`config.md`](./config.md) · [`settings.md`](./settings.md) · [`persistence.md`](./persistence.md) ·
  [`event-bus.md`](./event-bus.md)

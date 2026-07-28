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
  // …one field per service
  dispose(): void;
}

/** The single construction point for the whole graph. */
function createGameContext(options: {
  content: LoadedContent;
  config: GameConfig;
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

**CTX-11** — The context **MUST NOT** hold interface state (selection, active screen, focus): that
belongs to the presentation (ARC-8.4).

## Test criteria

- Two contexts created with different seeds diverge; with the same seed and the same inputs they
  agree.
- After `dispose()`, no handler is registered on the bus.
- A context built entirely from fakes allows the orchestration to be exercised without real
  services.
- Creation with invalid content fails before any service is instantiated.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-8 (no global state), ARC-4 (mute services)
- [`config.md`](./config.md) · [`persistence.md`](./persistence.md) · [`event-bus.md`](./event-bus.md)

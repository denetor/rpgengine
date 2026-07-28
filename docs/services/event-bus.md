# BUS — EventBus

**Area:** Core · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `BUS-*`

## Purpose

Carry the **domain events** — immutable notifications of facts that have already happened — from
whoever produces them to whoever reacts to them, without the two knowing each other. It is the
system's only channel of *indirect* communication: direct calls exist, but only from the
orchestration towards the services.

The bus is **not** a command channel and is **not** a query channel: it does not carry requests, does
not return values, does not wait for answers.

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, DOM, any other service |
| Consumed by | `game/orchestration`, `presentation` |
| Dynamic state | none (the bus keeps no state between ticks, apart from the queue in flight) |
| Static state | none |
| External data | none |
| Events emitted | none (it is the infrastructure) |
| Order of magnitude | ~10³ events/second with no perceptible degradation |

## Public API (indicative)

```ts
type DomainEvent = { readonly type: string; readonly [k: string]: unknown };

interface EventBus<E extends DomainEvent> {
  /** Subscribes to an event type. Returns the unsubscribe function. */
  on<T extends E['type']>(type: T, handler: (e: Extract<E, { type: T }>) => void): () => void;
  /** Subscribes to every event: for logging, replay and debugging tools. */
  onAny(handler: (e: E) => void): () => void;
  /** Queues an event for delivery. Does not run the handlers immediately. */
  publish(event: E): void;
  publishAll(events: readonly E[]): void;
  /** Delivers all queued events, including those generated during delivery. */
  flush(): void;
}
```

## Requirements

**BUS-1** — Events **MUST** form a **discriminated union** on `type`, closed and known at compile
time. Subscribing to a non-existent type **MUST** be a compile error.

**BUS-2** — Every event **MUST** be JSON-serializable: no functions, runtime references, `Map`,
`Set`, `Date` or classes in the payload. Entities are referenced by `EntityId` (ARC-5.2).

**BUS-3** — Events **MUST** be **immutable** and describe a fact that has **already happened**, in
the past tense (`entity-died`, not `kill-entity`). An event **MUST** never be used to request an
action.

**BUS-4** — Delivery **MUST** be **deferred and ordered**: `publish()` queues, `flush()` delivers in
FIFO order. Synchronous delivery inside `publish()` is not allowed, since it would make the order
depend on recursion depth.

**BUS-5** — Events published **during** a `flush()` **MUST** be queued and delivered within the same
`flush()`, after those already queued, until the queue is empty.

**BUS-6** — For a given event, handlers **MUST** be invoked in subscription order. This, together
with BUS-4 and BUS-5, makes delivery **deterministic** (ARC-9).

**BUS-7** — There **MUST** be a configurable limit on `flush()` iterations (default: 32); when it is
exceeded the bus **MUST** fail diagnostically, reporting the event types involved in the cycle,
instead of freezing the game.

**BUS-8** — An exception thrown by a handler **MUST NOT** prevent the other handlers from running:
it **MUST** be caught, reported and, in development, rethrown at the end of `flush()`.

**BUS-9** — The bus **MUST NOT** know or import any domain type: it is parametric on the event union
type, supplied by whoever instantiates it.

**BUS-10** — `onAny` **MUST** make it possible to record the entire event stream into a journal, for
diagnostics and for replaying a session (see `SAVE`, `RND`).

**BUS-11** — In development mode the bus **SHOULD** be able to record, for each event, who published
it, so as to make the causal chain readable.

**BUS-12** — No service **MUST** subscribe to the bus (ARC-4.3). The rule **MUST** be enforced by
lint: `EventBus` does not appear among the services' constructor parameters.

## Test criteria

- FIFO respected with nested publications at several levels.
- Stable invocation order for a given set of subscriptions.
- An event cycle produces a diagnostic error within the limit, not a freeze.
- A handler that throws does not interrupt the others.
- A `publish` → `flush` sequence recorded with `onAny` replays identically.
- The bus works with a made-up event union, foreign to this game (ARC-3.4).

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-4 (mute services), ARC-5 (events and references)
- [`game-context.md`](./game-context.md) — who owns the bus instance
- [`persistence.md`](./persistence.md) — event journal and reproducibility

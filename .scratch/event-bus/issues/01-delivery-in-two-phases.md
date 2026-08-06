# 01 — The delivery contract: two phases, FIFO, cascade

**What to build:** the `BUS` service, whole, for the path a game actually walks. An event is
published and runs nothing; a `flush()` delivers it. The rules of the game are served first — the
whole chain of consequences, to its end, including everything the handlers publish while it is
running — and only when the queue is empty is that chain handed, once and in the same order, to the
interface.

That two-phase shape is the point of the ticket and not an optimisation. A handler in the
orchestration phase runs inside a half-finished transaction, which is its job; a panel doing the same
would query `STAT` about a world where half the tick has landed and get a true answer about a state
that never officially existed (BUS-6). Delivering to both families in one pass would ship the half
that lies, so there is no ticket in which the presentation phase arrives later.

Within a phase, `onAny` handlers run **before** the typed handlers for the same event, and typed
handlers run in subscription order (BUS-7). An `onAny` subscription belongs to a phase like any
other, so a trace registered in the presentation phase sees each event exactly once — not twice,
once per pass.

Two type-level details are load-bearing, and they land here rather than in a later ticket for the
same reason `CFG`'s did: they are the parts most likely to be "simplified" by somebody who has not
tried them.

```ts
type JsonValue =
  | string | number | boolean | null
  | readonly JsonValue[]
  | { readonly [k: string]: JsonValue };

//                  ↓ an `interface` does NOT satisfy this constraint, however impeccable its
//                    fields: only a `type` alias with an object literal gets the implicit index
//                    signature. The error does not explain itself, so event types are declared
//                    as type aliases and a comment says why.
type DomainEvent = { readonly type: string; readonly [k: string]: JsonValue };
```

`JsonValue` is what makes BUS-2 a property of the compiler rather than prose: an `Actor`, a `Map`, a
`Set`, a `Date` and a function all carry methods, and a method is not a `JsonValue`. `EntityId`
passes, being a branded `number`. That guarantee is checked by `@ts-expect-error` assertions and by
nothing else — `tsc` fails on an unused directive, so an assertion that stopped catching anything
fails the build instead of passing quietly.

The constructor takes `onHandlerError` and is free not to call it yet: until ticket 03 every
exception simply propagates. The argument is required from the first line so that no call site
changes shape later, and because a generic service that reaches for `console` has a dependency it
never declared (ARC-3.2).

The sheet is [`docs/services/event-bus.md`](../../../docs/services/event-bus.md) and it is normative;
the spec is [`docs/specs/bus-event-bus.md`](../../../docs/specs/bus-event-bus.md).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `publish` and `publishAll` run no handler: nothing happens until `flush()`
- [ ] A subscriber receives the events of its own type, narrowed, with no cast at the call site
- [ ] Events are delivered in the order they were published
- [ ] An event published by a handler is delivered **in the same flush**, after those already queued
- [ ] That holds to arbitrary depth: everything at depth 2 is delivered before anything at depth 3
- [ ] **The phase boundary**: A publishes, an orchestration handler publishes B, and the presentation
      phase receives `[A, B]` only after **both** orchestration handlers have run
- [ ] The presentation phase receives every event of the tick, once, in the order they were delivered
- [ ] Within a phase, `onAny` handlers run before the typed handlers for the same event
- [ ] Typed handlers for one event run in subscription order
- [ ] An `onAny` registered in one phase sees each event exactly once, and sees nothing of the other
      phase
- [ ] `on` and `onAny` return an unsubscribe function, and a handler that has unsubscribed stops
      receiving events
- [ ] The queue is empty when `flush()` returns
- [ ] A flush with nothing queued, and a flush with no subscribers, are both no-ops
- [ ] The bus never reads a clock, never produces randomness, and imports nothing from `game/` or
      `presentation/`
- [ ] A type-level spec compiles: `@ts-expect-error` on subscribing to a type outside the union, and
      on payloads carrying a `Date`, a `Map`, a `Set` and a function
- [ ] Every test enters through the service's public door; no test names an internal module
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

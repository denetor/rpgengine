# 01 — The clock and the queue: advance, schedule, cancel

**What to build:** the `TIME` service, headless, for the path everything else walks. Game time exists
and moves only when somebody moves it; a caller registers a deadline and gets back, at the right
moment, exactly the domain event it registered.

`advance(deltaMs)` moves game time by **exactly** that much and returns everything whose deadline
falls in the interval — one ordered batch, computed before any consumer runs. It publishes nothing:
what comes back is the caller's to publish (ARC-4.2), and in this ticket the caller is a test.

The three properties that are cheap now and unrecoverable later, and that are therefore the whole
point of the ticket:

- **The batch is ordered by `(deadline, id)`**, and the id is a monotonic counter, so *registration
  order* is the tie-break at an equal deadline without a second sequence existing anywhere. That one
  choice also makes the heap's internal layout irrelevant, which ticket 03 depends on.
- **Repetition is anchored to the deadline.** After coming due at `D` the next deadline is
  `D + everyMs`. A 100 ms repeater over a 6000 ms advance comes due sixty times, at 100…6000, and not
  sixty times bunched at the end. An implementation anchored to `now` passes every small-step test and
  fails only when a combat turn arrives, months later.
- **The payload *is* a domain event.** `schedule(afterMs, event)` takes a member of the union and
  hands it back unchanged. There is no wrapper type and no second dispatcher beside the bus, and
  serializability stops being prose: a member of the union satisfies `JsonValue` by construction.

The service is parametric on `E extends DomainEvent`, exactly as the bus is; it cannot name an event
of this game, and the boundary check would refuse it if it tried.

**What is deliberately absent**, so that nobody adds it back on the way past: there is no `tick()`, no
`setScale`, no `isPaused`, no `nextDeadline()`. Pause is *not advancing*, and it belongs to the
orchestration (ticket 04). `advance()` takes **integer** milliseconds and refuses anything else,
including a negative delta: the fraction of a fractional frame is carried by the driver, and an
integer clock keeps "due at exactly 6000" meaning what it says.

`cancel(id)` reports whether the timer was pending and must be unobservable in every other way —
which is what leaves a lazy strategy (leave it in the heap, discard it when it surfaces) as a free
implementation choice rather than a leak.

**Consumers must tolerate a world that has moved on.** If sixty poison ticks come due and the entity
died on the third, all sixty are still returned. That is the batch contract and it must not be
softened here; the rules that receive them decide what to ignore.

The sheet is [`docs/services/time.md`](../../../docs/services/time.md) and it is normative; the spec
is [`docs/specs/time-game-clock.md`](../../../docs/specs/time-game-clock.md).

**Blocked by:** None — can start immediately.

**Status:** done

- [x] `advance(0)` and an advance with nothing pending return nothing and move nothing
- [x] A timer scheduled `afterMs` comes due on the advance that crosses its deadline, not before
- [x] `advance()` returns the scheduled event **unchanged**, and never publishes it
- [x] Ten advances of 16 ms and one of 160 ms return the same events, in the same order, with the
      same deadlines
- [x] Several deadlines inside one advance come back ordered by deadline
- [x] Two timers due at the same instant come back in **registration order**
- [x] A 100 ms repeater over 350 ms comes due at 100, 200, 300; over a further 350 ms at 400, 500,
      600, 700 — the anchoring rule, which a `now`-based implementation fails
- [x] A repeater keeps its phase across advances of wildly different sizes
- [x] `cancel` returns `true` for a pending timer and `false` for one already fired or already
      cancelled; a cancelled timer never comes due; a cancelled repeater stops for good
- [x] Cancelling one timer changes nothing about the order or the deadlines of the others
- [x] A non-integer delta, a negative delta and `everyMs <= 0` are refused with a message that says
      which
- [x] `TimerId` is opaque at the type level: a plain `number` is not assignable to it
- [x] Ids are never reused inside one clock's life
- [x] Two clocks in one process do not observe each other (the clock's half of ARC-8.3)
- [x] The service reads no clock of its own — no `Date.now`, no `performance.now`, no `setTimeout` —
      and imports nothing from `game/` or `presentation/`
- [x] A type-level spec compiles: `@ts-expect-error` on scheduling a payload carrying a function, a
      `Date`, a `Map` and a `Set`
- [x] Every test enters through the service's public door; none names an internal module
- [x] The unit lane is green: lint, typecheck, boundaries and the headless suite

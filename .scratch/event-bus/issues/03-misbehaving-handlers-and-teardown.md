# 03 — Misbehaving handlers and teardown

**What to build:** everything the bus owes a caller who does something awkward while it is
delivering — throws, subscribes, unsubscribes, calls `flush()` again, or tears the world down.

**Exceptions are answered by phase** (BUS-9), and the split is the whole point. In the
**orchestration** phase an exception **propagates**: a handler that threw is a rule that did not
run, which means the quest did not advance or the loot was not granted, and letting the player carry
on in a world quietly missing a consequence is the failure mode ticket 02 chose to throw over. In the
**presentation** phase it is caught, handed to `onHandlerError` with the event that caused it, and
the remaining handlers still run — the domain is already quiescent and intact, so a panel that failed
to draw costs a panel.

There is **no development-mode branch**. The build under test behaves exactly like the build that
ships, because control flow that differs between the two is not a diagnostic nicety under ARC-9.1,
it is two different games.

**The subscriber set is frozen per event** (BUS-10). The handler list is snapshotted when delivery of
that event begins, so a handler unsubscribed by an earlier handler still receives the current event
and stops from the next; a handler subscribed mid-delivery misses the current event and receives the
next, including later events of the same flush. Reading the live list and adjusting indices instead
would make *who received this event* depend on what earlier handlers happened to do — order-dependent
behaviour nobody can reason about at a subscription site. This is reachable in ordinary play: a panel
subscribes when it opens and unsubscribes when it closes, and it opens and closes in reaction to
events.

The snapshot is an allocation on the hottest path in the game, and ARC-13.3 is a **MUST**. It stays,
with its reason written beside it: it is the price of that guarantee, it is *unavoidable* in
ARC-13.3's sense at ~10³ events/second, and it is the one allocation that may become copy-on-write if
profiling ever asks — **without changing a single observable rule**. Written down because otherwise
someone profiling on day 200 removes a copy from a dispatch loop and silently deletes the guarantee.

**Teardown**: `dispose()` drops every subscription and discards the queue, and is called outside a
flush by the same owner that calls `flush()`. It is the bus's half of CTX-6, which nothing in the
original API could have delivered — the subscription registries had no owner.

**Blocked by:** 01 — the delivery contract.

**Status:** ready-for-agent

- [ ] A handler that throws in the orchestration phase aborts the flush; the exception reaches the
      caller
- [ ] A handler that throws in the presentation phase does not stop the others: the remaining
      handlers still run
- [ ] `onHandlerError` receives both the error and the event that caused it, proved with a recording
      function
- [ ] Several presentation handlers throwing on one event report several times, once each
- [ ] `onHandlerError` is never called for an orchestration-phase failure
- [ ] There is no branch anywhere that depends on a build mode or an environment variable
- [ ] A handler unsubscribed by an earlier handler **still receives the current event**, and none
      after it
- [ ] A handler subscribed during delivery **misses the current event** and receives the next,
      including later events of the same flush
- [ ] An `onAny` subscribed or unsubscribed mid-delivery follows the same rule
- [ ] A handler that calls `flush()` throws
- [ ] Unsubscribing twice is a no-op, and so is unsubscribing after `dispose()`
- [ ] After `dispose()` nothing is registered: a subsequent `publish` + `flush` reaches no handler
- [ ] `dispose()` on a bus with a queued, unflushed event discards it without throwing
- [ ] The snapshot carries its reason in a comment, naming the guarantee it buys and the
      copy-on-write escape (ARC-13.3, BUS-17)
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

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

**What a handler's exception leaves behind, decided here:** the same thing the depth refusal leaves
behind — **nothing**. Ticket 02 discarded the queue before throwing and left this half open; it is
the same question asked of a different failure, and it gets the same answer for the same two reasons.
A tick that ended in an exception is over, so keeping its queue would have the next `flush()`
redeliver from generation 0 every event that already ran once, and would leave the bus sitting
outside a flush with something in it (BUS-12). The two failures now share one `catch` in the drain
rather than each carrying its own line, which is also what stops the second one from being forgotten.

An orchestration failure therefore costs the whole tick, presentation included: the panels are never
handed a world the rules stopped halfway through building (BUS-6).

**The reentrant `flush()` throws a plain `Error`, not a named class.** `CausalDepthError` is a class
because something catches it: a cycle is a wiring bug that survives to a running game, and the testbed
overlay renders the refusal rather than freezing. A reentrant `flush()` is found the first time the
line executes, by whoever just wrote it, and no `catch` will ever want to match it by type — a class
here would be public surface bought for nobody. The message is the whole of the diagnostic, so it says
what the caller already has rather than only what they may not do: the flush they are standing inside
of will deliver what they published, before it ends.

**The no-build-mode rule is checked against the source, not against behaviour**, and joins the clock
and randomness scans in `purity.spec.ts`. It is the one prohibition no behavioural test can reach: a
suite runs in one build, and a branch taken only in the other build is invisible to it — every test
goes green on a bus nobody has ever run.

**`dispose()` inside a flush throws**, which the ticket did not ask for and the review argued for.
BUS-11's "outside a flush" was going to be left as a precondition nothing checked — the caller is the
game loop, and the loop's own shape keeps the sentence. Two things changed the answer. The flag that
refuses a reentrant `flush()` already knows whether a flush is running, so the check costs one `if`
and no new state; and the failure it prevents is the silent kind, which is what BUS-11 being a
**MUST** is about. `dispose()` swaps the queue the drain is reading, so a context that tore itself
down in reaction to an event would stop the cascade mid-sentence, drop every consequence still queued
behind it, and leave a tick that looks exactly like a tick that finished. A precondition whose breach
is invisible is worth a guard even when the caller is a single trusted call site.

**Blocked by:** 01 — the delivery contract.

**Status:** done

- [x] A handler that throws in the orchestration phase aborts the flush; the exception reaches the
      caller
- [x] A handler that throws in the presentation phase does not stop the others: the remaining
      handlers still run
- [x] `onHandlerError` receives both the error and the event that caused it, proved with a recording
      function
- [x] Several presentation handlers throwing on one event report several times, once each
- [x] `onHandlerError` is never called for an orchestration-phase failure
- [x] There is no branch anywhere that depends on a build mode or an environment variable
- [x] A handler unsubscribed by an earlier handler **still receives the current event**, and none
      after it
- [x] A handler subscribed during delivery **misses the current event** and receives the next,
      including later events of the same flush
- [x] An `onAny` subscribed or unsubscribed mid-delivery follows the same rule
- [x] A handler that calls `flush()` throws
- [x] Unsubscribing twice is a no-op, and so is unsubscribing after `dispose()`
- [x] After `dispose()` nothing is registered: a subsequent `publish` + `flush` reaches no handler
- [x] `dispose()` on a bus with a queued, unflushed event discards it without throwing
- [x] The snapshot carries its reason in a comment, naming the guarantee it buys and the
      copy-on-write escape (ARC-13.3, BUS-17)
- [x] The unit lane is green: lint, typecheck, boundaries and the headless suite

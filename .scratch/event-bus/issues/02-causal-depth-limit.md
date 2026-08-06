# 02 — The safety rail: causal generations, depth 32, a diagnostic throw

**What to build:** the guard that turns an event cycle into a bug report instead of a hung tab. Two
rules that publish each other are legal code, compile perfectly, and make `flush()` drain forever;
without this ticket the first one written locks the browser and the test runner alike, with nothing
on screen to say which events were involved.

The countable thing is **causal depth**, not iterations: a single FIFO queue drained until empty has
no iterations in it. Events queued before the flush are generation 0; events published while
delivering generation *n* form generation *n+1*. The limit bounds that depth at **32, a fixed
constant** (BUS-8).

Fixed, not configurable, and that is the decision most likely to be undone by someone who has not
read why. A legitimate deep cascade — `item-picked → objective-completed → quest-completed →
reward-granted → item-added → container-full` — runs six or seven deep; 32 is headroom, not a
budget. The only realistic use of a knob here is somebody hitting the error, raising the limit to 500
and shipping the cycle, which is why the number is a constant with its reason written beside it.

On exceeding it the bus **throws**. Dropping the queue and carrying on would leave a world where some
consequences of the tick landed and others never will — the silent corruption the two-phase design
exists to avoid — and a crash with a readable cause beats a world quietly missing half a transaction.

The message lists the event types present in **each of the last three generations, in order**, which
is enough for a person to read a ping-pong off the error as `[a] [b] [a]`. No cycle-detection
algorithm and no bookkeeping outside the failure path: the generation boundaries already exist in the
drain, and nothing is recorded until the limit trips.

**Blocked by:** 01 — the delivery contract.

**Status:** ready-for-agent

- [ ] A cycle of two events throws instead of running forever
- [ ] A cycle of three events throws, and so does a self-publishing handler
- [ ] The error names the event types of each of the last three generations, in order, so the loop is
      readable from the message alone
- [ ] A legitimate cascade of ten generations completes without throwing
- [ ] A cascade of exactly 32 generations completes; 33 throws
- [ ] The limit counts **depth**, not events: a generation fanning out to hundreds of events at the
      same depth does not approach the limit
- [ ] The error is a named type a caller can recognise, not a bare `Error`
- [ ] Nothing is allocated or recorded to support the message while the flush is healthy
- [ ] The queue is left in a state that does not strand the bus: a subsequent `flush()` behaves
      predictably, and the ticket states which behaviour was chosen and why
- [ ] The limit is a constant with its reason beside it, not a construction parameter and not a
      `CFG` section (BUS-15)
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

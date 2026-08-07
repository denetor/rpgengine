# Grill log — TIME: the game clock and the scheduler

**Date:** 2026-08-08
**Subject:** [`docs/services/time.md`](../../docs/services/time.md) — the sheet of the service that
owns game time, the timer queue and the world clock, step 3 of §7.2.
**Status:** decisions agreed, nothing built and nothing edited. No plan, no tickets.

What the sheet already fixed, and was therefore not up for discussion: the domain never reads
`Date.now()` (TIME-1), time enters only through an explicit advance, the payload of a timer is data
and never a callback, the service does not know what a timer means (TIME-9), and pending timers
survive a save with the exact remainder (TIME-7).

This log records the fourteen decisions the sheet left open — and the four requirements that came out
of them with no reason left to exist. Two of the four were not cut for tidiness: after the earlier
decisions the service was no longer *able* to satisfy them, which is a different and more interesting
result.

---

## 1 — `advance()` belongs to the orchestration; the presentation pumps a tick

**Decided:** the Excalibur loop calls **one function in `game/orchestration/`** — `tick(realDeltaMs)`
— which drains the intents, advances the clock, publishes what came due and flushes the bus. The
presentation never calls the clock's `advance()`. It may still *read* the clock (`now()`,
`worldTime()`) from the `GameContext`, which is what a HUD clock does.

**Why:** the sheet's contract row named two different callers — *"consumed by: orchestration; the
`tick` is pumped by the presentation loop"* — and the difference is load-bearing. `advance()` returns
events and does not publish them (ARC-4.2: publishing is the caller's job), while the BUS grilling
settled that **only the orchestration publishes**
([`../event-bus/grill-log.md`](../event-bus/grill-log.md) §1), precisely so that nothing enters the
bus at an instant the browser chose. A scene calling `advance()` would be left holding a batch of
domain events with nowhere lawful to put them. ADR-0004 makes the *import* legal; it does not make
the publish legal.

**Consequence for step 3:** the `clock` testbed scene demonstrates a scene driving the **game loop**,
not a scene driving the service — which is what §7.2 says step 3 is for: *"the first seam where the
presentation drives the domain instead of being it."*

## 2 — Excalibur is reused as the driver, never as the scheduler

**Decided:** the split is

| Excalibur keeps | `TIME` keeps |
|---|---|
| producing the real delta, and pacing frames (`maxFps`) | game time |
| **the fixed step** (`fixedUpdateTimestep`) and `currentFrameLagMs` for REN-12 | the timer queue: deadlines, order, cancellation, serialization |
| the cap on an anomalous delta | the world clock: day, hour, minute, phase |
| interface-only timing (`Clock.schedule`) | |

and **`Engine.timescale` stays at 1**.

**Why not `ex.Timer` / `Clock.schedule`,** checked against the installed `excalibur@0.32.0` rather
than the docs pages:

- Both are **callback-based**. TIME-7 requires a pending timer to survive a save, and ARC-10.4
  forbids functions in serializable state outright. An `ex.Timer` holding `action: () => void`
  (`Timer.d.ts:39`) cannot be written to a save file at all — a poisoning with 8 s left comes back
  with nothing left.
- `ex.Timer.random` defaults to *"a new random seeded from the current time"* (`Timer.d.ts:51`),
  which is ARC-9.2 gone.
- **`engine/` cannot import `excalibur`** — rule 1 of ARC-14.2, enforced in CI — and CTX-7 builds a
  context with no canvas and no engine. A scheduler living in Excalibur cannot run headless, and
  headless is where every determinism test runs.
- `Engine.stop()` stops **drawing** too (`excalibur.js:31656`), so it is not our pause: GP-53 wants a
  pause menu that is visible and animated while the world is frozen.

**Why the driver half is worth reusing:** `_mainloop` already is the accumulator we would otherwise
write — `_lagMs += elapsedMs; while (_lagMs >= step) _update(step)` (`excalibur.js:31632`) — and it
exposes the lag REN-12 needs for interpolation. Writing our own would be a worse copy of a tested
one.

**Why `timescale` stays at 1:** Excalibur scales `elapsed` *before* handing it to update
(`excalibur.js:31622`). If the domain also scaled, a slow-motion would be applied twice. Exactly one
of the two may own the conversion, and after decision 8 neither of them does it implicitly: the
orchestration decides how much game time a frame is worth. A *visual* slow-motion is applied by the
presentation, deliberately.

**Cut by this decision:** **TIME-5** (the service offering an optional fixed step — the driver has
one, and a headless caller passing a constant delta is fixed by construction) and **TIME-11** (the
service distinguishing interface time — that is `ex.Clock`, which never stopped running, because our
pause is not `engine.stop()`).

## 3 — Turn-based advance is not a mode

**Decided:** a combat turn calls `advance(6000)` directly. The clock has no `'realtime' | 'turn'`
flag and does not know that a turn exists. The turn's length is **combat's** configuration, not
`time`'s.

**Why:** `advance()` already takes a delta; a turn is just a delta that came from a rule instead of
from a frame. Entering combat, the orchestration stops advancing on frames and advances on turn
resolution instead. A `turnDurationMs` in `time`'s config section would be this game leaking into
`engine/` (ARC-3.2), and TIME-9's principle applies one level up: the service does not know what an
advance *means* either.

**Checked:** nothing in `GAMEPLAY.md` or `combat.md` commits to real-time or turn-based combat. The
axis is unspecified, and the clock must not be the thing that decides it.

**Originally decided as two verbs** — `tick(realDeltaMs)` scaled and `advanceBy(gameDeltaMs)`
unscaled — because scale applied to one and not the other. Decision 8 removed scale, and with it the
distinction; see there.

## 4 — A large delta comes due as one batch

**Decided:** `advance(6000)` with a 100 ms repeating timer returns **60 events**, ordered, all before
any rule runs. That is the wanted behaviour, including when the entity dies on the third: the other
57 are delivered and the combat rules drop damage against a corpse, because that is a combat rule.

**The rule that comes with it, written down rather than discovered:** *a handler must tolerate a
world that has already moved past the event it is holding.* It is the same discipline the bus already
imposes — an event is a fact, not a request — so it costs nothing new. It needs saying because the
alternative is someone "fixing" it inside the scheduler.

**Rejected, after being proposed:** a `nextDeadline(): GameTimeMs | null` peek, letting a caller walk
the deadlines one at a time so that each event is published at exactly its own instant. It would make
step-size independence literally true at the system level. It was cut because it has no caller today
(combat is step 11), because adding it later is purely additive with nothing to migrate, and because
the batch behaviour is the wanted one.

**Also rejected:** a discrete-event walk as the *default*. `flush()` is atomic — the orchestration
cascade to quiescence, then the presentation once (`bus.ts:262`) — so flushing per deadline would run
the presentation phase 60 times in one frame, destroying the "one redraw point per tick" guarantee
the BUS grilling was built to establish. It would mean reopening the public surface of a service that
is already built and committed, for a caller that does not exist.

**Also rejected:** an implicit maximum step inside `TIME`. It would hide the cost and make
`advance(6000)` mean something other than what it says.

**TIME-3 reworded to what is provable:** for the same total elapsed time, any subdivision returns the
same events, in the same order, with the same deadlines. What differs is the `now()` at which the
caller publishes them. The test criterion (10 × 16 ms = 1 × 160 ms) is unchanged: it is a test of the
scheduler, and of the scheduler it is true.

## 5 — The payload *is* the domain event

**Decided:** `schedule(afterMs, event)` takes a member of the game's event union; when the deadline
passes, `advance()` returns it unchanged. The service is parametric on `E extends DomainEvent`,
exactly as `BUS` is. **`timer-elapsed` does not exist.**

**Why not a wrapper** (`{ type: 'timer-elapsed', payload }`): it builds a **second dispatcher beside
the bus**. Every consumer of every timer subscribes to one type and then switches by hand on a string
the compiler never checks; a typo is a timer that silently never does anything. The bus exists so
that this dispatch happens once and is typed.

**What it collapses into the compiler:** a payload that is a member of the union is a `JsonValue` by
construction — `DomainEvent = { readonly type: string; readonly [key: string]: JsonValue }` — so a
callback, an `Actor` or a `Map` cannot be scheduled, and the error lands at the `schedule()` call
site rather than in a save file six months later. **TIME-7 stops being prose.** TIME-9 stays literally
true: `Clock<E>` cannot name an event of this game, because rule 4 of the boundary check fails the
build on `engine/ → game/`.

**Consequence:** the `Events emitted` row loses `timer-elapsed`, and `TimerPayload` leaves the API
sketch, replaced by `E`.

## 6 — The world clock detects its own transitions, statelessly

**Decided:** `TIME` computes hour, day and phase transitions itself, as a **pure function of the two
instants** (`before`, `before + delta`) and the calendar configuration. Nothing is remembered,
nothing is serialized, nothing can drift. `worldTime()` is the same pure function applied to a single
instant.

**Rejected:** implementing the cycle with the scheduler we already have — the orchestration schedules
`scheduleRepeating(hourMs, { type: 'time/hour-changed' })` at bootstrap, which would let TIME-8 be
deleted outright. It fails on three counts: phase boundaries are not periodic (dawn at 06:00, dusk at
19:00 — a repeating timer cannot express them, so each phase must reschedule itself daily), the
calendar's parameters would have to move into the game's bootstrap instead of `time`'s own config
section, and every save would carry six synthetic timers that are pure derivation — six pieces of
state that can disagree with the configuration they came from.

**One event per boundary crossed**, exactly as decision 4 settled for timers: an advance spanning
five hours returns five `hour-changed`. Coalescing into one `{from, to}` would make the world clock
the one thing in the system that behaves differently inside a batch, and a quest counting elapsed
days would have to know it. The existing test criterion — *"phase transitions happen exactly once per
crossing"* — already reads this way.

**Merged in time order** with the timers, so a timer due at 06:00:00 and dawn's `day-phase-changed`
arrive in one ordered sequence. Tie-break at the same instant, stated in the sheet: **world-time
events first, then timers in registration order.**

**`TIME` exports its own event types** on its public surface and `game/` folds them into the union —
which is what BUS-14 already says. They are generic events: an engine that knows about days is not an
engine that knows about Aramis. Under decision 4 of the BUS log they carry the producing service in
the discriminant: **`time/hour-changed`, `time/day-changed`, `time/day-phase-changed`**.

**Rename:** `phase-changed` → **`day-phase-changed`**. `phase` already means the delivery phase —
`Phase = 'orchestration' | 'presentation'` in `event-bus/types.ts:57`, and the **Delivery phase**
entry of `CONTEXT.md`. Two unrelated things called "phase", one of them already in the code.
`DayPhase` keeps the name it has.

## 7 — The configuration section

**Decided:**

```ts
interface TimeConfig {
  readonly dayLengthMs: number;
  readonly startsAt: { readonly day: number; readonly hour: number; readonly minute: number };
  readonly phases: readonly { readonly name: string; readonly hour: number; readonly minute: number }[];
}
```

declared as `TIME`'s own `SectionShape` under the key `'time'`, validated before the context exists
(CTX-10, CFG-13), exactly as `RND` declares `FILTER_SECTION`.

- **24 hours × 60 minutes, fixed.** World time is a human-readable projection of `dayLengthMs`, not a
  physics. A configurable `hoursPerDay` buys an alien calendar nobody asked for and a divisor in
  every formula.
- **Phases are data; `DayPhase` is a `string`.** A generic engine cannot know this game has dawn,
  day, dusk and night (ARC-3.2). The service takes the last phase whose start is ≤ the current time;
  adding a fifth becomes a data edit.
- **The fallback is a single phase named `day`.** RND-21 establishes that a section may legitimately
  be absent, and the honest default for an unconfigured service is *a clock with no cycle*:
  `day-phase-changed` simply never fires. Not four hardcoded phases, which would be this game's
  content sitting in `engine/` as a default value.
- **Validation reports every problem, not the first** (RND-24): `dayLengthMs` a positive integer;
  `phases` non-empty, sorted, starting at 00:00, names distinct; `startsAt` inside the day.

**Deliberately absent: a `minute-changed` event.** The HUD clock calls `worldTime()` while drawing —
a read, lawful for the presentation under ADR-0004. Emitting an event 1 440 times a day so a label
can update is a cost every subscriber pays, in the tick, forever.

## 8 — `scale` is cut entirely, and the two verbs become one

**Decided:** `setScale`, `scale()` and `isPaused()` all leave the surface. The service has no scale.
What remains is **`advance(deltaMs)`**, and the caller declares how much game time passed — 16 ms for
a frame, 6000 ms for a combat turn.

**Why:** pause does not need a factor. The presentation pumps a tick; a paused game **does not
advance the clock**. No advance, no timer due — which is what TIME-2 asks for, obtained by not doing
anything rather than by multiplying by zero. Slow-motion is the caller passing a smaller delta; the
clock does not need to know why.

**What it takes with it:** the two verbs of decision 3 (they existed only because scale applied to
one and not the other), the whole question of whether `scale` belongs in the save, and the
reconstruction of pause state on load.

**Rejected on the way:** a stack of pause *reasons* inside the service, to prevent the bug where a
menu closing over an open dialogue calls `setScale(1)` and restarts a world that should stay frozen.
The bug is real; the fix belongs in `game/orchestration/`, which owns the pause menu's named API and
knows *which situations freeze the world* — knowledge TIME-9 keeps out of the service.

**TIME-2 rewritten:** game time is distinct from real time because **the caller decides the
conversion**. There is no scale to document.

**Cost, stated:** the guarantee "nothing comes due while paused" is no longer written inside a
service — it is a consequence of nobody calling `advance`. There is exactly one caller, so the risk
is small, but it moved from the compiler to discipline.

## 9 — The cap on an anomalous delta belongs to the driver

**Decided:** **TIME-10 is cut.** No `maxDeltaMs` parameter, no clamp in the service.

**Why the service can no longer do it:** after decision 3, `advance()` has two legitimate callers
passing numbers orders of magnitude apart — the frame (16 ms) and the combat turn (6000 ms) — and
**the clock cannot tell them apart**. A 250 ms cap would not trim the backgrounded window; it would
trim every combat turn, silently, and the bug would read as "poison does less damage than it should"
and be hunted everywhere except in the clock.

**Where it belongs, and where it already is:** the seam that receives *real* time. Excalibur does
`if (elapsed > 200) elapsed = 1` (`excalibur.js:30014`), which is also what keeps its own
`fixedUpdateTimestep` loop out of a spiral. A backgrounded window is the same case as pause: `rAF`
stops, nobody advances, and there is nothing to catch up on because no game time passed.

**Recorded honestly:** if the driver ever stops being Excalibur, the cap leaves with it. That is why
the sheet must name where it lives instead of leaving it implicit.

**A distinction that came out of the same question, and is worth more than the cap.** "Do not call
`advance()` while paused" must mean *do not advance the clock*, not *do not pump the frame*:

```ts
function tick(realDeltaMs: number): void {
    drainIntents();                                            // always
    if (!paused) bus.publishAll(clock.advance(realDeltaMs));   // only if the world runs
    bus.flush();                                               // always
}
```

Skipping the whole fixed point during a pause would leave the menu's intents undrained and the bus
unflushed: you equip armour from a paused inventory and the panel updates when you resume. The world
stops, the interface does not — the same property obtained by leaving `Engine.timescale` at 1 and not
calling `engine.stop()`.

## 10 — Timer identity, cancellation, repetition

**Decided:**

- **`TimerId` is a branded `number`**, from a monotonic counter — `number & { readonly __brand:
  'TimerId' }`, the convention `entity-registry.md:37` sets and `event-bus/types.spec.ts:31` already
  uses. A `string` invites caller-chosen keys (`'respawn-e42'`), and from there two subscribers
  sharing one key by accident, which the service cannot detect.
- **`cancel(id)` stays, and the sheet says who keeps the id:** whoever may want to cancel — curing a
  poisoning early — keeps the `entity → TimerId` pair **in its own state, and therefore in its own
  save**. That is orchestration state. A `cancelWhere(payload => …)` would force `TIME` to look
  inside a payload it promised not to understand, and would be a linear scan besides.
- **Most cancellations are unnecessary**, given decision 4: the poison tick that arrives on a healed
  character finds no component and does nothing. `cancel` earns its place for repeating timers, which
  would otherwise sit in the queue for ever.
- **`scheduleRepeating` is kept, and is not sugar.** The apparent equivalent — the handler
  rescheduling itself — reschedules *during the flush*, i.e. after the batch was computed, so a
  6000 ms turn would produce **one** poison tick instead of 60. It is the only way to get correct
  catch-up inside a single advance, and it is the real content of TIME-4.
- **Repetition is anchored to the deadline, not to the current instant:** after firing at `D`, the
  next deadline is `D + everyMs`. With `now + everyMs`, the 60 deadlines of a batch would all slide
  to its end and the cycle would lose its phase after every turn.
- **`afterMs < 0` and `everyMs <= 0` throw.** The second would be an infinite loop inside the batch —
  the one way this service can hang the game.

## 11 — What is in the save, and the structure behind it

**Decided:**

```ts
interface TimeState {
  readonly version: 1;
  readonly elapsedMs: number;   // game time, integer
  readonly nextId: number;
  readonly timers: readonly { id: TimerId; at: GameTimeMs; every?: number; event: E }[];
}
```

- **Deadlines are absolute, not "how much is left".** With `elapsedMs` beside them the remainder is
  exact by subtraction, and nothing is rounded on write. TIME-7 obtained without writing code to
  obtain it.
- **World time is not saved.** It is a pure function of `elapsedMs` and the configuration, and the
  configuration is not in the save (CFG-15). Consequence, to be stated in the sheet rather than
  discovered: changing `dayLengthMs` reinterprets old saves — the same game finds itself at a
  different hour of the day. That is the price of not duplicating derivable state.
- **A binary heap keyed by `(at, id)`.** The ids are a monotonic counter, so **the id *is* the
  registration order**: TIME-3's tie-break needs no second counter and no stable structure, it is
  already in the comparison key. And because the pop order is fully determined by `(at, id)`, the
  internal array layout is irrelevant: the list is serialized **sorted by `(at, id)`** and rebuilt on
  load, so a resumed game pops in exactly the sequence the saved one would have. That is what makes
  ARC-9.1 checkable with a save-and-reload.
- **Cancellation is lazy**: `cancel` removes the id from the live set and reports whether it was
  there; the entry stays in the heap and is discarded when it surfaces. Removing an arbitrary element
  would need an `id → position` map maintained through every sift — three times the code for a rare
  case. The one unpleasant effect (a cancelled timer due in ten game-hours sitting in the heap) is
  handled by **filtering the cancelled out in `serialize()`**: the save carries no tombstones.
- **ARC-13.4 declared: hundreds of pending timers, thousands in the worst case.** TIME-6 says
  thousands, but the two bulkiest candidates will not use timers at all — merchant restocking is
  **lazy, computed on first interaction** (ECO-6, `economy.md:69`), and NPC routines hang off
  `hour-changed`, not one timer per NPC. What is left is status effects and respawns.

  (`economy.md` contradicts itself here and it is worth flagging: ECO-5 has stock regenerate *"after
  a timeout via `TIME`"*, ECO-6 forbids exactly that in favour of the lazy computation. ECO-6 is the
  one that scales, and `TIME` is not the service that resolves the disagreement.)

**`remainderMs` was proposed and cut.** It existed to carry the fraction of a fractional delta
(`1000/60 = 16.666…`), without which ten small steps ≠ one large step and TIME-3 is false. But
**Excalibur already carries that fraction**: `_lagMs` accumulates real time and calls
`_update(fixedTimestepMs)` a whole number of times (`excalibur.js:31632`). Configure
`fixedUpdateTimestep: 16` instead of `fixedUpdateFps: 60` and the domain only ever receives `16`,
with the correspondence to real time kept on the real-time side, where real time is. So **`advance()`
accepts integer milliseconds and refuses the rest**, and the clock is integer arithmetic end to end.
If a slow-motion is ever wanted *in the domain* rather than only visually, whoever wants it decides
how to round, visibly.

**`nextId` was challenged and kept.** Not hygiene: the ids are the tie-break at equal deadlines. If
the counter restarted at zero after a load, a timer created after the load would carry a *lower* id
than one pending from before and would come due first — the same game, saved and reloaded, producing
a different sequence, at exactly the point where ARC-9.1's test is "save, reload, compare". Deriving
`max(saved id) + 1` does not do: ids consumed by timers that already fired are not in the list, so
they would be handed out again, and whoever kept one to cancel would cancel a stranger's timer.

## 12 — `now` travels as an argument; nobody is injected with the clock

**Decided:** no service receives the clock. Whoever needs the current time receives it as a
`GameTimeMs` **parameter**, passed by the orchestration. The clock lives in the `GameContext`, so
orchestration and presentation have it; nobody else does.

**Why it is already the corpus's model:** `blackboard.md:43` writes `get(scope, key, now:
GameTimeMs)`, `input.md:79` says explicitly that *"`consume()` is given the current time rather than
reading a clock"*, and EXPR-8 forbids the alternative outright. No sheet lists `TIME` among its
dependencies — checked across all thirty.

**Why it is worth stating as a rule rather than leaving as a habit:** a service holding a clock can
read it at any moment, so its result stops depending only on its arguments. It becomes impossible to
test by handing it an instant, and a temporal coupling appears that no signature declares.

**The technical detail that would otherwise be found at the first compile:** `BB` writes `now:
GameTimeMs`, but that type belongs to `TIME`, and rule 3 of the boundary check forbids a service
importing another service — **with no exception for types**
(`dependency-cruiser.boundaries.mjs:98`), and with `tsPreCompilationDeps: true` (line 170), so even
an `import type` fails the build. The answer is the one `CFG` already uses for `SectionShape`: **each
service redeclares `type GameTimeMs = number` locally**, and structural typing makes them the same
type. This has to be written in the sheet, or the first reader who notices the duplication will
"fix" it with an import and break the build — or worse, fix it with a shared module, which would be
the project's first piece of global state.

It stays a plain `number`, not branded: the sheet writes it that way, `BB` uses it that way, and
branding an instant would force re-branding at every addition.

## 13 — The words

**A contradiction already in `CONTEXT.md`, found rather than created:** the **Game time** entry lists
*tick* among the words to avoid (line 391); the **Delivery phase** entry says *"tick (that is the
unit of time, not of delivery)"* (line 73), reserving it for time. One forbids it, the other assigns
it — and `time.md` meanwhile calls the method `tick()`.

**Decided: "tick" is promoted, and each verb takes the name of what it does.**

| | Who | What |
|---|---|---|
| `tick(realDeltaMs)` | the orchestration | **the beat of the loop**: drain the intents, advance the world if not paused, `flush()` |
| `advance(gameDeltaMs)` | the clock | **only time moving**: returns what came due, knows nothing else |

The **Game time** entry loses that prohibition — what it meant was *do not call game time "the
tick"*, which stays true — and the two methods stop sharing a name, which they would have done had
both been called `advance()`.

**Glossary entries that now say something false, and how they are rewritten:**

- **Game time** — says *"scalable, pausable at `scale = 0`, distinct from real time and from
  interface time"*. There is no scale. Becomes: *distinct from real time because the caller decides
  the conversion; integer milliseconds; advances only when somebody advances it.*
- **Timer** — says *"an opaque and serializable `payload`"*. The payload **is a domain event**:
  opaque to the service, typed for whoever schedules it, serializable because the compiler admits
  nothing else.
- **Pause** — absent, and now needed, because it stopped being a mechanism and became a policy: *the
  orchestration's decision not to advance the clock. The world stops, the interface does not: the
  beat goes on, intents drain, the bus delivers.*
- **Interface time** — exists today only inside **Game time**, as something to be distinct from. It
  gets its own line saying where it lives: *Excalibur's real delta, and it lives only in the
  presentation. The domain neither provides it nor knows it.*
- **World time** — kept, with the addition that the phases are **data**, not an enum.

**New terms**, used throughout this session without being defined: **Deadline** (the instant of game
time at which a timer comes due — absolute, never "how long is left") and **Driver** (what turns real
time into beats: here Excalibur, which owns the fixed step, the frame pacing and the cap on an
anomalous delta, and which the domain never names).

## 14 — The save door

**Decided:** `RND` set the shape and it is followed: `serialize(): TimeState` as an instance method,
**restore as a factory** taking the state *and the configuration* — `Random.deserialize(state,
filter)` (`random.ts:152`) is the precedent, and the calendar is needed because it is not in the save
(decision 11).

**A factory, not a reload of a live clock:** a `clock.deserialize(state)` would leave a clock
existing, for the duration of the call, with one game's elapsed time and another's queue — and anyone
holding a `TimerId` from before would find it pointing at a stranger's timer. CTX-9 says the context
is *rebuilt* from a save: the clock is born restored or it is not born.

**`assertTimeState` refuses at the first broken invariant**, and `RND` has already written the reason
(`state.ts:104`): a save is not a configuration. A configuration is written by a person and deserves
every error at once (RND-24); a save is written by the game, there is no file for anyone to fix, and
the first broken invariant means it is corrupt. The invariants: `version` exactly the expected one,
with the message naming both; `elapsedMs` and `nextId` non-negative integers; every `at >= elapsedMs`
(a timer due in the past should have fired before the save); `every`, if present, a positive integer;
ids distinct and all `< nextId`; the list ordered by `(at, id)`, which is the order `serialize`
writes and costs a scan already being made; every event an object with a `string` `type` — all
`TIME` can check without looking inside a payload it promised not to understand, and enough to tell a
corrupt save from a good one.

**`TIME_STATE_VERSION` is exported** on the public surface, as `RANDOM_STATE_VERSION` is
(`index.ts:42`), because `SAVE` has to read it to decide whether it can migrate.

**Open, and trivial:** whether the door is spelled `Clock.deserialize` (a class with a static, as
`RND` has) or `restoreClock(state, config)` (a factory function, as `createEventBus` has). The two
precedents disagree; the semantics above do not depend on which wins.

---

## What the sheet loses

| | |
|---|---|
| **TIME-5** — optional fixed simulation step | The driver owns it (`fixedUpdateTimestep`); a headless caller passing a constant delta is fixed by construction. Decision 2. |
| **TIME-10** — configurable cap on an anomalous delta | The service cannot distinguish a frame from a combat turn, so the cap would trim the wrong one. It lives at the seam that receives real time, and Excalibur already applies it. Decision 9. |
| **TIME-11** — simulated time distinct from interface time | Interface time is `ex.Clock`, which never stops, because our pause is not `engine.stop()`. The domain does not provide it. Decision 2. |
| **`timer-elapsed`** among the events emitted | The payload is the event. Decision 5. |
| **TIME-2** — rewritten | No scale: game time is distinct from real time because the caller decides the conversion. Decision 8. |
| **TIME-3** — rewritten | Step independence is a property of what the scheduler *returns*, not of when the caller publishes it. Decision 4. |
| **TIME-7** — mostly retired into the compiler | A payload that is a member of the event union cannot be a callback. One sentence survives, explaining why the type is shaped that way. Decision 5. |

## The resulting surface

```ts
type GameTimeMs = number;                                  // redeclared locally by each service
type TimerId = number & { readonly __brand: 'TimerId' };

interface Clock<E extends DomainEvent> {
  now(): GameTimeMs;
  worldTime(): { day: number; hour: number; minute: number; phase: DayPhase };

  /** Advances by exactly this much game time. Returns what came due, ordered; publishes nothing. */
  advance(gameDeltaMs: number): readonly E[];

  schedule(afterMs: number, event: E): TimerId;
  scheduleRepeating(everyMs: number, event: E): TimerId;
  cancel(id: TimerId): boolean;

  serialize(): TimeState;
}
```

Constructed with its configuration slice; restored from a `TimeState` plus that same slice. No
`tick`, no `setScale`, no `isPaused`, no `TimerPayload`, no `nextDeadline`.

## Consequences for other sheets

- **`audio.md`** — AUD-11 cites TIME-11, which is gone. Pause is a game fact published by the
  orchestration, not a distinction the clock draws.
- **`rendering.md`** — REN-12 cites TIME-5 for the fixed step. It points at `fixedUpdateTimestep` and
  `currentFrameLagMs` instead.
- **`hud.md:42`** — *"pause game time (TIME-2)"*: pause is no longer an operation on the clock. The
  menu asks the orchestration.
- **`event-bus.md` / the union** — three new discriminants: `time/hour-changed`, `time/day-changed`,
  `time/day-phase-changed`.
- **`persistence.md`** — SAVE-11 (the save includes pending timers) stands, and now has a state shape
  and a version constant to name.
- **`game-context.md`** — `readonly clock: Clock` stands, and decision 12 says who may use it:
  orchestration and presentation, nobody else.

## What this session did not decide

- The **first `CTX`** — the other half of step 3, and what makes ARC-8.3 testable.
- The **`clock` testbed scene**: what it shows and what makes it a proof.
- The made-up domain for the **reusability proof** (ARC-3.4).
- Whether combat is **real-time or turn-based**. Decision 3 leaves the clock able to serve either,
  which is the whole point of not deciding it here.

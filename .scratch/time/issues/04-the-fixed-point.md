# 04 — The fixed point: one beat, and the first `GameContext`

**What to build:** the place where the clock and the bus meet, and the single point at which the
whole graph is constructed. This is the seam §7.2 calls *"where the architecture stops being a
document"*, and it is built once here — every later step pumps the same function.

```ts
function tick(realDeltaMs: number): void {
    drainIntents();                                            // always — empty until INP exists
    if (!paused) bus.publishAll(clock.advance(realDeltaMs));    // only if the world runs
    bus.flush();                                                // always
}
```

**The conditional is on the advance, never on the beat**, and that is the ticket's whole point.
Skipping the fixed point while paused would leave intents undrained and the bus unflushed: you equip
an item from a paused inventory and the panel updates when you resume. The world stops; the interface
does not.

`paused` is **orchestration state** — a boolean is enough while nothing else exists — and the clock
never learns of it. There is no pause in the service and no scale to set to zero: pause is *not
advancing*, and *which situations freeze the world* is a rule of this game.

`tick` is the **only** caller of `advance()`. The presentation may read `now()` and `worldTime()`;
it may not advance the clock, because only the orchestration publishes — the rule the bus grilling
settled so that nothing enters the bus at an instant the browser chose.

**The first `GameContext`** comes with it: one explicit construction point holding the bus and the
clock, each receiving its dependencies through its constructor, with a `dispose()` that tears both
down. Only what this step can honour is honoured — CTX-1, CTX-2, CTX-4, CTX-6, CTX-7. The aggregate
`serialize()` of CTX-9 belongs to `SAVE` at step 13, and no service receives the context itself.

`GameTimeMs` is **redeclared locally** by whoever needs it rather than imported: rule 3 of the
boundary check has no exception for types and `tsPreCompilationDeps` is on, so even an `import type`
would fail the build. The convention starts here, and the sheet says why, so that the first reader who
notices the duplication does not "fix" it.

This ticket is what makes **ARC-8.3** — two independent games in one process — a thing a test asserts
rather than a claim, and it is the practical check that no global state has crept in while there are
only two services to check.

**Blocked by:** 01 — the clock and the queue. It needs something to advance; the calendar (02) and
the save door (03) are not involved.

**Status:** done

- [x] One beat publishes everything the advance returned, in order, and flushes it
- [x] A subscriber registered in the orchestration phase sees the tick's events; a presentation
      subscriber sees them once, after the cascade
- [x] **Paused**: the clock does not move, no timer comes due, `now()` is unchanged
- [x] **Paused, and the bus still delivers**: an event published while paused reaches its handlers in
      the same beat
- [x] Pausing and resuming loses no time and creates none: what was due during the pause comes due
      after it, at its own deadline
- [x] A beat with a paused world and nothing queued is a no-op
- [x] The context builds the bus and the clock in one place, with no automatic resolution and no
      module-level instance anywhere
- [x] Two contexts in one process do not observe each other: pumping one advances nothing in the
      other, and an event published in one reaches no handler of the other (ARC-8.3)
- [x] After `dispose()` nothing is registered on the bus and pumping is inert
- [x] The context is constructible headless: no canvas, no renderer, no assets (CTX-7)
- [x] No service receives the context, and nothing under `game/` imports `presentation/`
- [x] The three `time/*` event types are part of the game's union, assembled in `game/`
- [x] Every test drives the fixed point through its public function, with the **real** bus and the
      **real** clock
- [x] The unit lane is green: lint, typecheck, boundaries and the headless suite

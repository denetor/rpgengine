# 03 — The save door: write it, restore it, refuse it

**What to build:** a clock that can be put down and picked up again without the game noticing. A
poisoning with eight seconds left has eight seconds left after a reload, and — the part that is
harder and matters more — a resumed game **continues with the identical sequence** an uninterrupted
one would have produced.

```ts
interface TimeState<E> {
  readonly version: number;
  readonly elapsedMs: GameTimeMs;
  readonly nextId: number;
  readonly timers: readonly { id: TimerId; at: GameTimeMs; every?: number; event: E }[];
}
```

Four decisions are encoded in those four fields, and each is here rather than in a later ticket
because retrofitting any of them means rewriting saves:

- **Deadlines are absolute.** With `elapsedMs` beside them the remainder is a subtraction, exact, and
  nothing is rounded on write.
- **`nextId` is saved.** The ids break ties at equal deadlines (ticket 01). A counter restarting from
  zero would give a timer created *after* a load a lower id than one pending from *before*, and the
  reloaded game would diverge at exactly the point where ARC-9.1's test is *save, reload, compare*.
  Deriving `max(saved id) + 1` does not work either: ids consumed by timers that already fired are
  not in the list, so they would be handed out twice, and whoever kept one in order to cancel it
  would cancel a stranger's timer.
- **The list is written ordered by `(at, id)`** and rebuilt on load. Because the order in which the
  queue comes due is fully determined by that key, the internal layout never has to be reproduced —
  which is what keeps the heap an implementation detail.
- **Cancelled timers are filtered out on write.** A save carries no tombstones, which is also what
  makes ticket 01's lazy cancellation invisible rather than a leak.

**World time is not saved**: it is derivable, and the calendar is configuration, not state (CFG-15).
The consequence is stated rather than discovered — changing `dayLengthMs` reinterprets existing
saves, and the same game finds itself at a different hour of the day.

**Restore is a factory** taking the state **and** the configuration, as `Random.deserialize` is —
never a method that reloads a live clock, which would briefly hold one game's elapsed time and
another's queue while every `TimerId` handed out before it pointed at a stranger.

**A corrupt state is refused at the first broken invariant**, before anything is built from it.
`RND` has already written the reason and it is copied deliberately: a save is not a configuration.
Nobody edited it, there is no file for anyone to fix, and there is no reason to collect every problem
before giving up — which is the opposite of ticket 02's validation, on purpose.

`TIME_STATE_VERSION` is exported on the public surface, because `SAVE` reads it at step 13 to decide
whether it can migrate. No migration path is written here beyond refusing a version this build cannot
read.

**Blocked by:** 01 — the clock and the queue. It serializes what that ticket built. It does **not**
depend on 02: world time is derived and never saved.

**Status:** ready-for-agent

- [ ] `serialize()` returns the declared shape, with absolute deadlines and the list ordered by
      `(at, id)`
- [ ] A save taken with a cancelled timer pending contains no trace of it
- [ ] Round trip: `serialize → restore → serialize` produces an identical state
- [ ] A timer halfway through resumes with the **exact** remainder
- [ ] A repeating timer resumes with its period and its next deadline intact
- [ ] **The determinism test**: a clock advanced past a save point produces the same sequence as one
      saved, restored and advanced the same way — including the tie-break between a timer scheduled
      before the save and one scheduled after the restore, which is what `nextId` exists for
- [ ] Restore is a factory taking state and configuration; there is no way to reload a live clock
- [ ] A wrong `version` is refused, with a message naming the one read and the one this build
      understands
- [ ] Each invariant is refused before anything is built: negative or non-integer `elapsedMs` or
      `nextId`; an `at` in the past; a non-positive `every`; duplicate ids; an id `>= nextId`; a list
      out of order; an event that is not an object with a `string` `type`
- [ ] The refusal names the broken invariant, and stops at the first one
- [ ] `TIME_STATE_VERSION` is exported on the public surface
- [ ] The state contains no world time, no configuration and no function
- [ ] Every test enters through the service's public door
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

# 07 — Channel cap and explicit removal

**What to build:** channel granularity is unconstrained, so the game code may use one channel per
instance — a door, an enemy. Nothing, however, ever removes those memories: the door picked once and
the enemy killed in the second hour would stay in the save file until the end of the game. After
fifty hours of play, thousands of memories of entities that no longer exist pile up. It is not a
disaster — a few dozen bytes each — but it is growth with **no upper bound**, the kind of problem
you find out about from the player who plays more than anyone else.

When this ticket is done, channel memory is bounded: the service keeps at most a configurable
number of channels, evicting the least recently used one, and callers can explicitly declare that a
channel is no longer needed.

Eviction resets that channel's memory — the very thing the serialization requirement warns against —
but it is deterministic and does not depend on saving and reloading, so it is not a lever in the
player's hands. The difference must be documented where the code is read, otherwise it looks like a
contradiction.

**Blocked by:** 06 — Per-channel filtered randomness.

**Status:** done

- [x] The maximum number of channels is a data parameter, not a constant
- [x] Once the cap is exceeded, the **least recently** used channel is evicted
- [x] Recency is measured with the service's draw counter, **never** with the system clock
- [x] Ties are broken by channel name, so that the ordering is total
- [x] Eviction is independent of the iteration order over internal structures: two services that
      have seen the same sequence evict the same channel
- [x] There is an explicit way to forget a channel
- [x] A channel that was evicted and then reused restarts from an empty memory, without errors
- [x] The number of live channels stays within the cap even after restoring from a save

## Closing notes

- `channelCap` on `FilterConfig`, `forget(channel)` on `Random`, and one new pure function —
  `leastRecentlyUsed(memories, count)` in `filter.ts`. `Channels` gains a draw counter, a `lastUsed`
  per memory, and `evictDownToCap`. New spec: `eviction.spec.ts`.
- **`channelCap` is mandatory whenever there is a configuration**, not optional with a default. A
  default would be a balancing number invented by a generic service (ARC-3.2), and an optional cap
  would let a game filter without one — which is exactly the unbounded growth this ticket exists to
  stop, arriving through a missing line in `random.json` instead of through the code.
- **Without a configuration there is no cap**, and that is written down as a decision rather than
  discovered as a leak. Those channels hold nothing but their own name — the list is a diagnostic
  (RND-21) — there is no data to take a number from, and `forget` still works there. The test that
  pins it asserts the growth, so it cannot quietly become something else.
- **Recency is a counter of filtered draws, and nothing else moves it.** Listing the channels,
  saving, rolling a die on another stream: none of them touch it, and `forget` does not either — an
  entity dying must not shift anybody's sequence (RND-18). A clock would have two identical games
  evict different channels because one of them ran on a slower machine or was left paused over
  lunch.
- **The total order is the whole of the order-independence.** `(lastUsed, name)` has no equal pairs,
  so the least `count` are the least `count` however the map hands its entries over. The tests are
  written in **mirrored pairs** — `a, b, a, c` and `b, a, b, c` — so that an implementation reaching
  for "the first one I find" fails one half whichever half it gets right. Of a tie, the
  alphabetically first goes; a tie needs a hand-built save to arrange, because within one run the
  counter never repeats itself, and both orders of writing it are checked.
- **`RANDOM_STATE_VERSION` is now 3: `lastUsed` joins each saved channel.** Without it, a reload
  would have to invent a recency, every channel would come back equally recent, and which memory
  survived the next eviction would depend on having reloaded — the lever RND-20 says eviction is
  not. The counter itself is **not** saved: a restore takes it back from the largest `lastUsed`, and
  only the ordering was ever of interest. Migration stays `SAVE`'s job, as with version 2.
- **The cap in force at load time is applied to what the save carries.** A save written under a
  larger cap, or under a `random.json` since rebalanced, must not be a way of holding more channels
  than the service allows; otherwise the bound would hold only for as long as nobody reloaded.
- **Eviction resetting a memory is not the reload-reset RND-13 forbids**, and the difference is
  written at `evictDownToCap` where the code is read. RND-13's concern is that saving and reloading
  would become a lever in the player's hands — reload, and the anti-repetition working against you
  is gone. An eviction depends only on which channels the game drew from and in what order, happens
  identically in two games that did the same things, and no action available to the player brings it
  forward or holds it off.
- **A new channel is born at the current count**, which the draw in progress has already advanced,
  so it is the most recent one and is never the victim of the eviction its own arrival causes. That
  is the one ordering subtlety in `memoryFor`, and it is commented there.
- **The tests were checked for teeth, not just for green.** Dropping the name tie-break fails 1 of
  the 17; evicting in insertion order fails 5; skipping the cap on restore fails 3; not refreshing
  `lastUsed` on an existing channel fails 3; writing a constant `lastUsed` into the save fails 1;
  making `forget` a no-op fails 4.
- **The golden vector did not move**, which is the point of it: adding `channelCap: 64` to the
  configuration it carries changes no draw, and `filter-golden.json` keeps its version 1.
- **New normative text in the sheet**, listed here so it is reviewable rather than smuggled in
  alongside the code that satisfies it: RND-10's "`channelCap` is not read yet" becomes mandatory
  with a configuration and absent without one; RND-20 gains the tie direction, what does and does
  not move the counter, and the requirement to serialize recency and to apply the cap at load time;
  RND-22's table gains the `lastUsed` row, the reason the counter is not saved, and version 3.
- **RND-17's "two operations" had to be restated**, and this is the ticket that forced it. Its second
  operation was "updating a channel's weights", which no longer describes what happens: the draw
  counter moves, and channels come into existence, are evicted and are forgotten. The requirement now
  names the operation as *keeping the channel memories* — one operation because it is one piece of
  state with one owner — and holds the line where it was always meant to be: what decides *what* the
  memories become stays pure. Nothing about the code changed to satisfy this; the sheet was
  describing less than it meant.
- **`byName` in a new `order.ts`, shared by three comparators.** `byId`, `byChannel` and the new
  `byRecency` all ended in the same four lines, and the third copy was the one this ticket wrote. The
  reason they compare the way they do — never `localeCompare`, or the same game would sort
  differently on two machines — is now stated once instead of three times.
- Not in this ticket, by design: cross-engine golden vectors (08), the lint rule (09), fuller
  parameter validation (10) — `channelCap` is checked here because the constructor is where a
  configuration the service cannot enforce must fail, not halfway through a game.
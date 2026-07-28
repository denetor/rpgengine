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

**Status:** ready-for-agent

- [ ] The maximum number of channels is a data parameter, not a constant
- [ ] Once the cap is exceeded, the **least recently** used channel is evicted
- [ ] Recency is measured with the service's draw counter, **never** with the system clock
- [ ] Ties are broken by channel name, so that the ordering is total
- [ ] Eviction is independent of the iteration order over internal structures: two services that
      have seen the same sequence evict the same channel
- [ ] There is an explicit way to forget a channel
- [ ] A channel that was evicted and then reused restarts from an empty memory, without errors
- [ ] The number of live channels stays within the cap even after restoring from a save

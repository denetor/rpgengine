---
status: accepted
---

# The entity id is the storage slot, and the base is never rebased

ENT-1 promises ids that are opaque, strictly increasing and never reused. Read as a promise about
*identity* alone, it leaves the storage free — and the obvious storage for a component registry is
one dense array per kind, so that iterating by capability visits only the entities that own the
rarest required kind.

We decided the opposite. **The id is the position: `id − base` indexes directly into the store, and
the store is never renumbered.** Iteration by capability walks a list of live ids and tests a
64-bit mask; it does not narrow to a kind.

## Why the id doubles as the slot

Three requirements pulled against each other. ENT-4 wants a deterministic iteration order. ENT-14
wants hundreds of spawns and despawns in one frame without expensive reorganizations. And the
obvious storage wants per-kind lists kept sorted, which makes removal a shift — or buys it back with
a position map per kind, a tombstone density to watch, and a compaction policy per kind.

Monotonic ids dissolve the conflict rather than balancing it. If ids only grow and are never reused,
then ascending slot order *is* ascending id order: the ordering of ENT-4 cannot break, because
nothing ever moves. Spawn is an append, despawn clears a mask, and "without expensive
reorganizations" stops being a requirement anyone has to defend and becomes a property of the shape.

What it costs is the narrowing. `each(maskOf(Talkable))` touches every live entity rather than the
talkable ones. We accepted that on a distinction that is easy to lose: `each` is called by **rules
passes**, a handful per tick, not by every agent. The quadratic disaster `SPX` exists to prevent
(ARC-13.1) is 10³ agents each scanning 10³ entities; this is ~10 passes over 10³ entities with two
`AND`s apiece. `AFF.query(seeker, near, now)` already receives a list `SPX` has filtered, and does
not iterate the registry at all. If a profile ever contradicts this, a dedicated list for one hot
kind is an addition, not a rewrite.

## Why the base is never rebased

Slots are allocated against a growing counter, so the span grows with **churn** rather than with the
live population. The natural repair is to rebase at a quiet moment — an area load — and renumber.

That repair is not available, and the reason is worth recording because it is invisible from the
registry's own code. Rebasing changes ids, and ENT-11 has entities referencing each other **by
`EntityId` stored inside their own components** — where, to this service, components are opaque
plain data. The registry does not know which fields are ids, so it cannot rewrite them. A rebase
would leave every cross-reference pointing at the wrong entity, silently, with nothing to fail.

So the span is not reclaimed, and the growth is absorbed by splitting the two jobs the array was
doing at once:

- **Storage** is indexed by slot. It never compacts, so ids stay valid forever.
- **Iteration** walks a separate packed list of live ids in ascending order. It compacts freely,
  because it holds ids rather than identities-by-position, and moving an entry there changes nothing
  anyone can observe.

One list, not one per kind, and its compaction is a `memmove` over ~10³ elements — which is the
amortized reorganization ENT-14 permits.

## Consequences

- **Memory tracks ids allocated, not entities alive.** At 8 bytes of mask per slot, a session that
  spawns 10⁵ entities holds an 800 KB mask store whatever it has despawned. This is the price of not
  rebasing, and it is a price we can pay.
- **A generational index is now closed off.** Reusing a slot with a version tag is the standard
  answer to exactly this growth, and it is unavailable for the same reason a rebase is: the version
  would have to be readable inside opaque component data.
- **ENT-4 lost its second clause.** An earlier draft required iteration cost to track the rarest
  required kind. It is not merely unmet here — it is incompatible, and it was removed rather than
  weakened into a `SHOULD` nobody could test.

# 06 — Per-channel filtered randomness

**What to build:** mathematically correct randomness reads as a bug. Seven heads in a row is a
legitimate result for a fair coin, but the player who sees the same item drop seven times from the
same enemy concludes that the game is broken. Callers declare a **channel** at draw time, and the
service keeps its **channel memory** — the current weight of each outcome — reducing the weight of
what has just come up and letting it recover over the following draws.

The mechanism is **weight readjustment**, never re-rolling: rejecting what repeats shifts the
distribution in an uncontrollable way and, above all, creates a new rule that the player learns and
exploits — after a critical hit they *would know* that the next one is not. See ADR 0002.

Channel granularity is the caller's choice, never inferred by the service: a more specific channel
gives a memory dedicated to that entity, a more generic one makes it shared.

Channel names come into existence at runtime and cannot be listed in a file, so the parameters live
in **profiles** assigned by prefix. Data shape decided at design time:

```json
{
  "channelCap": 512,
  "default": "neutral",
  "profiles": {
    "neutral":  { "reduction": 0.60, "recovery": 2 },
    "lockpick": { "reduction": 0.25, "recovery": 5 }
  },
  "rules": [ { "channel": "lockpick:*", "profile": "lockpick" } ]
}
```

The values are plausible placeholders, not tuned: tuning is done by observing the sequences
produced.

**Blocked by:** 02 — Core: deterministic uniform streams · 03 — Serialization and restore.

**Status:** done

- [x] The filtered draw accepts a channel and a list of weighted outcomes, and returns an outcome
- [x] The weight of an outcome that has just come up is reduced and recovers according to its
      profile's parameters
- [x] There is no re-roll loop
- [x] A channel's profile is resolved **by prefix**, exactly once when the channel is created, and
      stays stored with its state: no resolution cost per draw
- [x] A default profile is mandatory when the configuration is present
- [x] **Without configuration the filter is inactive**: the filtered draw behaves exactly like the
      weighted one
- [x] The live channels can be listed, each with its resolved profile
- [x] Channel memory is part of serialization (extends 03): reloading does not reset the
      anti-repetition
- [x] Over 10⁴ draws, consecutive repetitions collapse compared with the unfiltered weighted draw
- [x] Monotonicity holds: if one outcome has a greater weight than another, its frequency is not
      lower
- [x] The measured distribution for a fixed configuration is compared against a versioned golden
      vector
- [x] It is **not** asserted that the distribution stays within tolerance of the nominal weights:
      the filter shifts it by construction
- [x] Every filtered draw consumes a documented number of draws from the stream

## Closing notes

- `filtered(channel, entries)` on `RandomStream`; `channels()` on `Random`. Two new files:
  `filter.ts` (pure — profile resolution, weight adjustment, the multiplier update, config
  validation) and `channels.ts` (the memories, and the one impurity RND-17 allows on this path).
- **`reduction` and `recovery` are read together.** A draw multiplies the outcome's weight by
  `reduction`; every other outcome *adds* the fixed step `(1 - reduction) / recovery` back. With the
  ticket's `0.6` and `2`: a draw from full weight costs 0.4, the step returns 0.2, and two draws
  landing elsewhere restore it exactly. Multiplicative down and additive up is the point — repeats
  get geometrically rarer while recovery stays linear and predictable.
  - **`recovery` is a number of draws exactly from *full* weight, and the docs first claimed more
    than that.** A second reduction costs only `0.4 × m` while the step stays the same size, so an
    outcome that has come up several times climbs back in fewer draws than the count of reductions
    suggests. That is the shape worth having — lean hard on a repeat, then let go — but the sentence
    that made `recovery` sound proportional was wrong, and is now corrected in `filter.ts`,
    `types.ts` and the sheet.
- **A floor of 1e-12 on the multipliers.** Not statistics: a channel offering a *single* outcome,
  drawn a few thousand times, would otherwise decay to a total weight of zero and the draw would
  throw. It also keeps ADR 0002 literally true — repeats get rarer, never impossible.
- **Channel memories live on the service, not on the stream.** `forget` and `channels()` are service
  methods, the save carries one list of channels, and the channel key is the caller's choice of
  granularity (RND-15): two streams naming the same channel mean the same memory, which is what
  naming it the same asks for. `Stream` therefore holds a reference to the shared `Channels`.
- **Resolution: the most specific rule wins.** The longest prefix, with a starless rule — a whole-name
  match — beating every prefix, and declaration order settling ties. The tie-break is not decoration:
  without a total order, which profile a channel gets would depend on how the config was read.
- **`UNFILTERED_PROFILE` (`'none'`) is a reserved name**, and a configuration that defines a profile
  called `none` is refused. RND-21 wants `channels()` to reveal a channel that *looks* filtered
  without being so; a real profile of the same name would put the ambiguity straight back.
- **The save carries weights only — never the resolved profile.** Profiles are static data, so a
  restore resolves them again from the configuration in force at load time and a rebalanced
  `random.json` takes effect on the next load. A test pins that the profile name is absent from the
  serialized bytes.
- **`RANDOM_STATE_VERSION` is now 2, and `channels` is a required field.** This departs from ticket
  03's note, which foresaw an *optional* field and no bump. An optional one would read a
  pre-filter save as "no channels" and silently reset the anti-repetition memory — precisely what
  RND-13 forbids. Nothing consumes the format yet, so the bump costs nothing today and states the
  change honestly. Migration stays `SAVE`'s job.
- **`toWeighted` was refactored, not just added to**: `assertWeightedTable`, `weightsOf` and
  `toWeightedIndex` are now shared by `weighted` and `filtered`, so "land on a weight" has one
  implementation. `filtered` validates the caller's **nominal** weights before drawing — so the
  message names the caller's number, not the number after the channel scaled it.
  - **This turned up a pre-existing RND-18 breach in `weighted`**, which was calling
    `toWeighted(this.next(), entries)`: the argument is evaluated first, so a refused table shifted
    the sequence — the very thing RND-23 spells out for `diceRoll` and ticket 04 pinned for
    `gaussian`. Fixed here, since the extraction put the check one line away, and pinned by a test
    that fails if the order goes back.
- **A save reloaded without a configuration loses its channel weights.** There is nothing to apply
  them with and nothing to move them by, so keeping them would mean carrying numbers no code can
  read. It is the same event as a game whose `random.json` stopped shipping. Deliberate, written
  down at `restore`, and pinned by a test so it stays a decision.
- **A table with a different number of outcomes resets the channel.** Multipliers are held by
  position, and they cannot follow outcomes that have moved. It is the only mismatch the service can
  see: a table reordered without changing length is invisible from here, and stays the caller's
  responsibility. Written down at `memoryFor` and in the API docs.
- **The golden vector lives in `filter-golden.json`**, versioned, and carries everything needed to
  reproduce it — seed, config, table, draw count — so a diff on the numbers reads next to the
  parameters that produced them. Its companion test asserts the *opposite* of a tolerance against
  the nominal weights: that the distribution is shifted, so a vector that quietly became the
  unfiltered one would not pass as unchanged. Measured on `loot:goblin`: repeats 2678 against the
  weighted draw's 4638, longest run 6 against 17.
- **New normative text was added to the sheet**, and is listed here so that it is reviewable rather
  than smuggled in alongside the code that satisfies it: RND-10 gains the specificity tie-break, the
  corrected reading of reduction/recovery, the weight floor and the reservation of `'none'`; RND-13
  gains "weights only, profile resolved again at load time"; RND-22's table gains the version number
  and the profile row. Each was a decision the ticket forced without settling — "resolved by prefix"
  does not say what happens when two prefixes match — and the sheet is where those belong.
- **The tests were checked for teeth, not just for green.** Neutralising `nextMultipliers` fails 6 of
  them; neutralising prefix resolution fails a different 6; restoring `weighted`'s old
  validate-after-draw order fails 2.
- **A foreign-domain test lives here too** (`'tides:harbour:north'`, outcomes with nothing to do with
  this game), which is the local corner of ARC-3.4. The full reusability proof stays ticket 11's.
- Not in this ticket, by design: `forget`, the channel cap and eviction (07) — `channelCap` is
  deliberately **absent** from `FilterConfig` rather than parsed and ignored, and joins it in 07 with
  the eviction that gives it meaning. Also out: cross-engine golden vectors (08), the lint rule (09),
  fuller parameter validation (10).

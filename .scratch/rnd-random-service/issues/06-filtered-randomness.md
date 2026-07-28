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

**Status:** ready-for-agent

- [ ] The filtered draw accepts a channel and a list of weighted outcomes, and returns an outcome
- [ ] The weight of an outcome that has just come up is reduced and recovers according to its
      profile's parameters
- [ ] There is no re-roll loop
- [ ] A channel's profile is resolved **by prefix**, exactly once when the channel is created, and
      stays stored with its state: no resolution cost per draw
- [ ] A default profile is mandatory when the configuration is present
- [ ] **Without configuration the filter is inactive**: the filtered draw behaves exactly like the
      weighted one
- [ ] The live channels can be listed, each with its resolved profile
- [ ] Channel memory is part of serialization (extends 03): reloading does not reset the
      anti-repetition
- [ ] Over 10⁴ draws, consecutive repetitions collapse compared with the unfiltered weighted draw
- [ ] Monotonicity holds: if one outcome has a greater weight than another, its frequency is not
      lower
- [ ] The measured distribution for a fixed configuration is compared against a versioned golden
      vector
- [ ] It is **not** asserted that the distribution stays within tolerance of the nominal weights:
      the filter shifts it by construction
- [ ] Every filtered draw consumes a documented number of draws from the stream

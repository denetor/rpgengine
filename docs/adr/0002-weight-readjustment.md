---
status: accepted
---

# Filtered randomness by weight readjustment, not by re-rolling

Filtered randomness (RND-9) exists to avoid the sequences that a player reads as a bug even though
they are legitimate. The solution everyone expects is **re-rolling**: keep a queue of recent results
and reject whatever repeats. We chose **weight readjustment**: the outcome that has just come up has
its weight reduced, and recovers it over the following draws.

## Why not re-rolling

- **It creates a new pattern.** "Never twice in a row" is a rule the player learns and exploits:
  after a critical hit they *know* the next one will not be. A sequence that feels unfair is
  replaced with one that is predictable — which is a different way of failing the same goal. With
  weights, seven heads in a row remain possible, but their probability drops by orders of magnitude.
- **It shifts the distribution in an uncontrollable way.** Rejection systematically penalises
  frequent outcomes, because they are the ones that repeat. With weights the shift is computable and
  tunable from the profile's parameters.
- **It costs a loop.** Re-rolling requires a cap on attempts and a termination guarantee, including
  the edge case where only one outcome is possible. Readjustment is O(1).

## Consequences

- **RND-11 does not exist.** It was the requirement that imposed termination of the filter. Without
  re-roll loops there is no termination to guarantee: the most delicate requirement of the section
  dissolves instead of being satisfied. The identifier stays retired and is not reused.
- **RND-12 does not exist.** It offered readjustment as an optional alternative; it became the
  mechanism, and was merged into RND-9.
- **The test criterion has changed.** One cannot assert that "the long-term distribution stays
  within tolerance of the nominal weights": the filter shifts it by construction, and a tolerance
  wide enough to let that pass would make the test meaningless. In its place: **monotonicity** (if
  `w(a) > w(b)` then `freq(a) ≥ freq(b)`) and a **golden vector** of the measured distribution,
  which does not prove that it is right but does catch every unintended change.

## Rejected alternative

**Offering both**, chosen per channel in the data, as the original draft envisaged. Rejected because
that means two statistical systems to implement, tune, test and serialize in a priority-1 service —
and nobody would ever have known on what basis to choose one over the other.

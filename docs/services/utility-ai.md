# AI — Utility AI

**Area:** Agents · **Nature:** generic · **Priority:** 3 · **Status:** proposed
**Requirement prefix:** `AI-*`

## Purpose

Decide **what an agent wants to do**, given a snapshot of its own state and of the world. Every
possible action receives a utility score; one is chosen among those with the highest scores.

The service is **pure logic**: it moves nobody, attacks nobody, knows nothing about Excalibur. It
receives data and returns an **intent**. Executing it is up to the orchestration. This separation is
what makes the whole AI testable in a Node runner: you build a context by hand, ask for the
decision, and check it.

## Conceptual model

Four building blocks, kept separate in the code too:

| Block | What it is | Where it is tuned |
|---|---|---|
| **Inputs / needs** | agent and world state as values normalized to `0..1` (health, hunger, distance to target, living allies) | extractors |
| **Consideration** | response curve that turns an input into a utility contribution `0..1` | **data**: it is the tuning surface |
| **Action** | an intent with its list of considerations; the score is their combination | data: weights, buckets |
| **Selector** | compares the scores and chooses | data: threshold, inertia, randomness |

## Contract

| Item | Value |
|---|---|
| Depends on | an `RND` stream (for the weighted choice) |
| Does NOT depend on | `excalibur`, `ENT`, `BB`, `MAP`, `PATH`, other services |
| Consumed by | orchestration, which builds the context and executes the intent |
| Dynamic state | last decision and its expiry per agent (for inertia) |
| Static state | definitions of actions, considerations, curves, personality profiles |
| External data | `content/ai/actions.json`, `curves.json`, `personalities.json` |
| Events emitted | none: it returns an intent |
| Order of magnitude | ~100 active agents, re-evaluated at discrete intervals, within ~2 ms/frame |

## Public API (indicative)

```ts
/** Read-only snapshot: data, never runtime references (ARC-1.3). */
interface DecisionContext {
  readonly self: AgentSnapshot;              // normalized values and state
  readonly beliefs: BlackboardView;          // from BB, read-only
  readonly candidates: readonly TargetSnapshot[];   // targets and affordances already filtered
  readonly now: GameTimeMs;
}

interface Intent {
  readonly action: ActionId;
  readonly target?: EntityId | Cell;
  readonly score: number;
  readonly expiresAt: GameTimeMs;
}

interface Reasoner {
  readonly id: ReasonerId;
  decide(ctx: DecisionContext, profile: PersonalityId): Intent | undefined;
  /** Like `decide`, but returns all the scores and contributions: for debugging. */
  explain(ctx: DecisionContext, profile: PersonalityId): DecisionTrace;
}
```

## Requirements

### Purity and structure

**AI-1** — The reasoner **MUST** be **pure**: no `import` from Excalibur, no access to the world, no
side effects. Same context and same seed → same decision.

**AI-2** — The reasoner **MUST** return an **intent**, not execute the action. Execution (moving,
attacking, talking, sitting down) belongs to the orchestration, which knows the services involved
(ARC-4.1).

**AI-3** — The context **MUST** be a **read-only snapshot** of data: no `Actor`, no reference to
mutable components, no function that queries the world during evaluation.

**AI-4** — The four building blocks (inputs, considerations, actions, selector) **MUST** be distinct
modules, separately testable.

### Scoring

**AI-5** — All inputs **MUST** be normalized to `0..1`, with the normalization declared in data
(reference range, saturation).

**AI-6** — **Response curves MUST** be data-driven and parametric: linear, polynomial, logistic,
step, exponential, with parameters tunable without recompiling (ARC-7.1).

**AI-7** — An action's score **MUST** be the combination of its considerations, with a **veto**
property: a consideration at 0 zeroes the action. This makes it possible to express "I cannot attack
if I have no target" without conditional code.

**AI-8** — The product of many considerations penalizes complex actions; the service **MUST** apply a
**compensation** (e.g. geometric mean or a correction for the number of factors), so that actions
are not compared unfairly.

**AI-9** — Every action **MUST** be able to have a **weight** and an upper utility bound, in order to
establish hierarchies between categories (surviving beats sightseeing).

### Selection

**AI-10** — The selector **MUST** support a **weighted random choice among the best**: not always the
action with the top score, but a draw among those within a threshold of the maximum. A perfectly
optimal NPC is a predictable NPC.

**AI-11** — There **MUST** be an **inertia**: the action in progress receives a bonus until it is
finished or decays, to prevent the agent oscillating between two nearly equal goals. The magnitude
of the inertia is configurable per action.

**AI-12** — The service **MUST** support action **bucketing**: actions are gathered into groups
(survival, combat, needs, idling) evaluated by priority, and lower-priority groups **MUST NOT** be
evaluated if a higher one has already produced a score above threshold. It is a matter of behaviour
and of performance at once.

**AI-13** — Randomness **MUST** come from an injected `RND` stream, never from `Math.random()`
(ARC-9.2).

### Personality and composition

**AI-14** — There **MUST** be **personality profiles**: sets of curves, thresholds and weights that,
for the same available actions, produce different behaviours — a coward, a fanatic, a mercenary, a
timid animal. Personality is **data** applied to the reasoner, not a different reasoner (GP-30).

**AI-15** — The service **MUST** support **several independent reasoners**, each with its own set of
actions (e.g. *combat*, *needs*, *social*). When the options multiply, several small reasoners are
easier to tune than one big one.

**AI-16** — The service **MUST** be usable **as a node inside a higher-level structure** (behaviour
tree or state machine): a tree decides the general context, and at some level delegates the
fine-grained assessment of the situation to a utility reasoner. The API **MUST** allow a reasoner to
be invoked on a subset of actions.

**AI-17** — Actions **MUST** be able to declare **hard preconditions**, evaluated before scoring, in
order to immediately rule out what is impossible.

### Performance and diagnostics

**AI-18** — Evaluation **MUST** be **throttled**: only agents within an activation radius, at
discrete intervals, with the load spread across frames so that they do not all re-evaluate on the
same tick (ARC-13.2).

**AI-19** — The set of candidates **MUST** be supplied already filtered by the spatial index: the
reasoner **MUST NOT** scan the world (ARC-13.1).

**AI-20** — Evaluation **MUST NOT** allocate nor produce logs on the hot paths (ARC-13.3).

**AI-21** — `explain()` **MUST** return the scores of all the actions and the contributions of every
consideration. Without this tool a utility AI is impossible to tune, and adjusting it becomes
guesswork in the dark.

**AI-22** — The order in which actions are evaluated **MUST NOT** influence the outcome for equal
scores: ties are broken by a declared deterministic rule.

## Test criteria

- Given a hand-built context, the decision is the expected one; changing a single input changes it
  as predicted.
- The veto property zeroes the action with a consideration at 0.
- Two different personality profiles, on the same context, produce different decisions consistently
  with their parameters.
- Inertia prevents oscillation between two actions with scores within 1%.
- With the same seed, the weighted choice among the best is reproducible.
- Bucketing avoids evaluating the lower groups when expected (verifiable by counting the
  evaluations).
- `explain()` produces a readable trace that justifies the decision.
- The reasoner works with made-up actions and inputs, foreign to this game (ARC-3.4).

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-1 (purity), ARC-13 (throttling)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-29, GP-30, GP-31, GP-32
- [`blackboard.md`](./blackboard.md) · [`affordance.md`](./affordance.md) ·
  [`pathfinding.md`](./pathfinding.md) · [`spatial-index.md`](./spatial-index.md)

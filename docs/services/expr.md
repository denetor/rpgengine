# EXPR — Precondition and effect interpreter

**Area:** Core · **Nature:** generic · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `EXPR-*`

## Purpose

Evaluate the **conditions** and resolve the **effects** that ARC-7.3 requires content to be written
in, so that the services that own that content do not each grow an interpreter of their own.

Without it, the same `switch` over condition kinds appears in `QST`, in `DLG`, in `LOOT` and in
`STAT`, four times, drifting apart at the fourth. `"the player has the key and is in the crypt"` is
one sentence: it must mean exactly the same thing in a quest precondition, in a locked dialogue
option and in a loot table filter.

It is **not a scripting language**. Narrative branching is written in ink and run by `DLG`
(ADR-0003); the rules that connect services live in `game/orchestration/` (ARC-4.4). This service
evaluates finite expression trees over facts that the caller supplies, and nothing else.

## Contract

| Item | Value |
|---|---|
| Depends on | — · the facts arrive from the caller through a read-only view (EXPR-6) |
| Does NOT depend on | `excalibur`, `QST`, `DLG`, `LOOT`, `STAT`, `RND`, the clock, the bus |
| Consumed by | `QST`, `DLG`, `LOOT`, `STAT` as an **injected evaluator** (EXPR-10); orchestration; the content integrity check |
| Dynamic state | none: it is a pure function of (expression, facts) |
| Static state | the registry of condition, effect and operator kinds |
| External data | none of its own: it interprets the expressions embedded in the other services' content files |
| Events emitted | none — it *describes* effects, it does not apply them (EXPR-3) |
| Order of magnitude | ~10³ evaluations per second (dialogue options, quest facts, loot filters), trees of a few dozen nodes |

## Public API (indicative)

```ts
/** Open discriminated unions: the kinds are registered, not hardcoded (EXPR-4). */
type Condition =
  | { type: 'all' | 'any'; of: readonly Condition[] }
  | { type: 'not'; of: Condition }
  | { type: string; [param: string]: unknown };        // registered kinds

type Effect = { type: string; [param: string]: unknown };

type NumericExpr =
  | number
  | { type: 'fact'; key: FactKey }
  | { type: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max'; of: readonly NumericExpr[] }
  | { type: 'clamp'; of: NumericExpr; lo: NumericExpr; hi: NumericExpr };

/** The only way the interpreter reaches the world: read-only, supplied by the caller. */
interface Facts {
  get(key: FactKey): FactValue | undefined;
}

interface EvalResult {
  readonly value: boolean;
  /** Why it is false: the failing leaves, as keys the HUD can localize (EXPR-7). */
  readonly unmet: readonly UnmetReason[];
}

interface Evaluator {
  test(condition: Condition, facts: Facts): boolean;
  explain(condition: Condition, facts: Facts): EvalResult;
  compute(expression: NumericExpr, facts: Facts): number;
  /** Effects with their parameters resolved against the facts. Applying them is the caller's job. */
  resolve(effects: readonly Effect[], facts: Facts): readonly ResolvedEffect[];
}

interface KindRegistry {
  condition(type: string, spec: ConditionKind): void;
  effect(type: string, spec: EffectKind): void;
  /** The schema of every registered kind, for content validation (EXPR-9). */
  schema(): ContentSchema;
}

function createEvaluator(registry: KindRegistry): Evaluator;
```

## Requirements

### Shape

**EXPR-1** — Conditions, effects and numeric expressions **MUST** be typed **discriminated unions**
serializable to JSON (ARC-7.3, ARC-5.1). No condition **MUST** be expressible as a function.

**EXPR-2** — Evaluation **MUST** be a **pure function**: no side effects, no mutation of the facts,
no I/O, and the same (expression, facts) pair **MUST** always give the same result (ARC-9.1).

**EXPR-3** — The interpreter **MUST NOT** apply effects. `resolve` returns them with their parameters
computed; who applies them, and to which service, is the caller's decision (ARC-4.1, ARC-4.2).

**EXPR-4** — Condition and effect kinds **MUST** be an **open registry**, populated from outside the
engine. Adding `player-in-area` to this game **MUST NOT** require touching the interpreter
(ARC-3.2).

**EXPR-5** — Expressions **MUST** be finite trees, with a declared maximum depth, no loops, no
recursion and no user-defined functions. The service **MUST NOT** become Turing-complete: narrative
control flow belongs to ink (ADR-0003), rules to the orchestration.

**EXPR-6** — The interpreter **MUST** read the world only through the read-only `Facts` view it is
given at each call. It **MUST NOT** hold a reference to any service, nor to the registry of entities
(ARC-4.1).

### Behaviour

**EXPR-7** — `explain` **MUST** return, for a false condition, the **leaves that failed**, as
localizable keys with their parameters: `DLG` needs them to show *why* an option is locked
(`# req:`, DLG dialogue tags), and the journal needs them for unmet objectives.

**EXPR-8** — The interpreter **MUST NOT** read the clock nor produce randomness (ARC-9.2, ARC-9.3).
A condition on time or chance receives the value **already in the facts**, decided by the caller.

**EXPR-9** — The registry **MUST** expose the **schema** of every registered kind, so that content
validation (ARC-7.2) and the integrity check (ARC-7.5) run against the same definition the
interpreter uses. A kind and its validation **MUST NOT** be declared twice.

**EXPR-10** — An unknown kind, a missing parameter or a type mismatch **MUST** fail at **content
load time** with file, path and value (ARC-7.2), never silently at evaluation time. At evaluation
time, a fact that is *absent* is a defined case (the condition is false, or the declared default),
not an error.

**EXPR-11** — `all` and `any` **MUST** short-circuit for `test`, and **MUST NOT** short-circuit for
`explain`: the player is owed the complete list of what is missing, not the first item.

**EXPR-12** — `compute` **MUST** cover the derived-value formulas of STAT-6 with deterministic
arithmetic: no transcendental functions, no dependence on floating-point rounding differences between
JavaScript engines (ADR-0001 holds here too).

**EXPR-13** — Evaluation order over the sub-conditions **MUST** be the declaration order (ARC-9.4):
`explain` produces a stable list of reasons across runs.

### Integration

**EXPR-14** — The evaluator **MUST** be usable as an **infrastructure dependency**: it is built once
in `createGameContext` and injected into the constructor of the services that need it, exactly as an
`RND` stream is (CTX-2). It is the case explicitly allowed by ARC-4.1, and every consuming service
**MUST** list it in its own sheet.

**EXPR-15** — The service has **no dynamic state** and therefore **MUST NOT** expose
`serialize()`/`deserialize()` (ARC-10.2 does not apply). Nothing about it ends up in the save file.

**EXPR-16** — The interpreter **MUST** work with a made-up set of kinds, foreign to this game, with
no change to the engine code: it is the reusability proof of ARC-3.4.

## Test criteria

- A three-level nested tree with `all`/`any`/`not` gives the expected truth value on synthetic facts.
- `test` short-circuits, `explain` does not: on a condition with three failing leaves, `explain`
  lists three reasons, in declaration order.
- An unknown kind is rejected at validation, with file, path and value in the message; the same
  content passes once the kind is registered.
- An absent fact behaves as declared, and does not throw.
- `resolve` returns effects without touching anything: a spy on the facts view records no write.
- The same expression evaluated twice on the same facts gives an identical result, including the
  order of the reasons.
- `compute` reproduces the derived-value formulas of `STAT` with the expected values at the
  boundaries (clamp, division by zero, negative modifiers).
- A registry of made-up kinds (`is-tuesday`, `has-badge`) works with no change to the service
  (ARC-3.4).

## Links

- [`../REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-7.2, ARC-7.3, ARC-7.5, ARC-4.1, ARC-9.1, §7.1
- [`quest.md`](./quest.md) · [`dialog.md`](./dialog.md) · [`loot.md`](./loot.md) ·
  [`stats.md`](./stats.md) — the four consumers
- [`adr/0003-dialogues-in-ink.md`](../adr/0003-dialogues-in-ink.md) — why narrative branching is
  *not* this service's job

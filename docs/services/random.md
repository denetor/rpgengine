# RND — Random numbers

**Area:** Core · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `RND-*`

## Purpose

To be the game's **single source of randomness**, seedable and reproducible, and to offer not just
uniform numbers but the **statistical shapes** the various systems require: a normal distribution
for variations that must cluster around a value, coherent noise for procedural generation,
*filtered* randomness to avoid sequences that feel insufficiently random to the player.

The central point: **mathematically correct randomness and randomness perceived as such are
different things**. Seven heads in a row is a legitimate result for a fair coin, but in a game it is
read as a bug. This service provides both and leaves the choice to each system.

## Contract

| Item | Value |
|---|---|
| Depends on | — · the parameters arrive **already validated in the constructor**: the service reads no files (ARC-4.1, CTX-10) |
| Does NOT depend on | `excalibur`, `Math.random()`, `Math.log`/`Math.cos`/`Math.pow`, other services |
| Consumed by | `CBT`, `LOOT`, `GEN`, `AI`, orchestration |
| Dynamic state | root seed · state of the **touched** streams only, with the explicit seed if one was passed · current weights per channel |
| Static state | filter profiles and channel→profile resolution rules |
| External data | **optional**; the game keeps them in `game/balance/random.json`: profiles, rules, channel cap |
| Events emitted | none |
| Order of magnitude | ~10⁴ draws/second while generating a map; ~10⁶ `noise2` samples per generated map |

## Public API (indicative)

```ts
type StreamId = string;  // 'combat' | 'loot' | 'worldgen' | 'ai' | …

interface RandomService {
  /**
   * Every stream has its own state: consuming from one does not alter the others.
   * The seed is `hash(root seed, id)`, or the one passed in. The same `id`
   * always returns the **same instance** (RND-19).
   */
  stream(id: StreamId, seed?: number): RandomStream;

  /** Forget a channel's memory: the entity that used it no longer exists (RND-20). */
  forget(channel: string): void;

  /** Diagnostics: live channels and the filter profile resolved for each (RND-21). */
  channels(): readonly ChannelReport[];

  serialize(): RandomState;
}

/**
 * Restore is by construction, never through an instance method (RND-22).
 *
 * The filter configuration is **not** in the save: it is static data, and a
 * rebalanced `random.json` is meant to take effect on the next load. It is
 * passed to both the constructor and the factory, and both accept its absence,
 * which is the absence of the filter (RND-21).
 */
declare class Random implements RandomService {
  constructor(rootSeed: number, filter?: FilterConfig);
  static deserialize(state: RandomState, filter?: FilterConfig): RandomService;
}

/** One live channel, and the profile resolved for it (RND-21). */
interface ChannelReport {
  channel: string;
  /** `UNFILTERED_PROFILE` when the service was built without a configuration. */
  profile: string;
}

/** The filter's data (RND-10), handed over already parsed: the service reads no files. */
interface FilterConfig {
  /** The profile for a channel no rule claims. Mandatory, and must exist. */
  default: string;
  profiles: Record<string, FilterProfile>;
  /** Matched most-specific-first; ties go to the one declared earlier. */
  rules?: FilterRule[];
}

interface FilterProfile {
  /** What an outcome's weight is multiplied by when it comes up. In (0, 1]. */
  reduction: number;
  /** Over how many draws a reduced outcome returns to its nominal weight. At least 1. */
  recovery: number;
}

/** `'lockpick:*'` matches a prefix; `'lockpick'` matches the whole name and nothing else. */
interface FilterRule {
  channel: string;
  profile: string;
}

/** The profile reported for a channel on a service built without a configuration. */
declare const UNFILTERED_PROFILE: 'none';

/** `RND`'s own portion of the save: plain data, with a version of its own. */
interface RandomState {
  version: number;
  rootSeed: number;
  /** The **touched** streams only, ordered by name. */
  streams: {
    id: StreamId;
    /** The generator state: four unsigned 32-bit words. */
    words: number[];
    /** Present only if the stream was created with an explicit seed (RND-19). */
    seed?: number;
  }[];
  /** The live channels that have weights to remember, ordered by name (RND-13). */
  channels: {
    channel: string;
    /**
     * The current weight of each outcome as a fraction of its nominal weight,
     * by position in the caller's table. Each in (0, 1]. The resolved profile
     * is **not** here: it is static data, resolved again at load time.
     */
    multipliers: number[];
  }[];
}

interface RandomStream {
  next(): number;                                   // [0, 1)
  int(minIncl: number, maxExcl: number): number;
  bool(probability: number): boolean;
  pick<T>(items: readonly T[]): T;

  /** The sum of `count` dice of `faces` faces, each in [1, faces] (RND-23). */
  diceRoll(faces: number, count?: number): number;

  weighted<T>(entries: readonly { value: T; weight: number }[]): T;
  shuffle<T>(items: readonly T[]): T[];

  /**
   * Normal by sum of uniforms, optionally truncated. Not Box–Muller: see RND-6.
   * The truncation **clamps**; it does not redraw, which would consume a
   * variable number of values and move the rest of the sequence (RND-18).
   */
  gaussian(mean: number, stdDev: number, clamp?: Truncation): number;   // [low, high]

  /** Filtered draw on a channel: the weights of recent outcomes are reduced (RND-9). */
  filtered<T>(channel: string, entries: readonly { value: T; weight: number }[]): T;

  /** Coherent noise. A pure function of (stream seed, coordinates): it does not consume (RND-18). */
  noise2(x: number, y: number, options?: NoiseOptions): number;   // [-1, 1]
  fbm2(x: number, y: number, octaves: number, options?: FbmOptions): number;   // [-1, 1]
}

/** Where a sample is taken. */
interface NoiseOptions {
  /** Coordinate scale: the size of the features. Default 1, finite and positive. */
  frequency?: number;
}

/**
 * How a sum of octaves is built, on top of where it is sampled. The two extra
 * knobs are a type of their own because `noise2` has no octaves to spread a
 * `persistence` over: a bag that silently ignores half of what it is given is a
 * trap, and splitting them makes the compiler say so.
 */
interface FbmOptions extends NoiseOptions {
  /** How much faster each octave is than the one before. Default 2. */
  lacunarity?: number;
  /** How much quieter each octave is than the one before. Default 0.5. */
  persistence?: number;
}

/**
 * The declared continuity bound of RND-7: at frequency `f` and step `d`,
 * neighbouring samples differ by at most `NOISE_MAX_SLOPE × f × d`. It is what
 * a caller needs in order to choose a sampling step.
 */
declare const NOISE_MAX_SLOPE: number;
```

## Requirements

### Reproducibility

**RND-1** — The service **MUST** be seedable and produce, for the same seed and the same sequence of
calls, exactly the same sequence of values. No use of `Math.random()` **MUST** exist anywhere else in
the project (ARC-9.2), as verified by lint.

**RND-2** — The service **MUST** offer **independent streams per usage domain** (combat, loot, world
generation, AI, ambience). Consuming numbers from one **MUST NOT** alter the sequence of the others:
adding a random visual effect must not change the outcome of a fight.

**RND-3** — The state of every stream **MUST** be serializable and restorable: loading a save resumes
the sequences from the exact point (ARC-10).

**RND-4** — The base algorithm **MUST** be **`xoshiro128**`**, explicit, documented and frozen: not
the JavaScript engine's implementation, and not PCG32, which requires 64-bit multiplications and
therefore `BigInt`, which allocates on every operation (ARC-13.3). The following are part of the same
stability contract, and changing them invalidates every save and every map from a seed:

1. the PRNG;
2. the **string hash function** that derives the stream seeds (RND-19);
3. the prohibition on **transcendental functions** on the entire deterministic path.

Point 3 is not a stylistic preference. ECMAScript specifies `+ - * /`, `Math.floor`, `Math.sqrt` and
`Math.imul` exactly, but leaves `Math.log`, `Math.cos`, `Math.sin`, `Math.exp` and `Math.pow`
*implementation-approximated*: different engines return different last bits. A browser update **MUST
NOT** change games, so those functions **MUST NOT** appear on any path that produces values.

**RND-5** — The service **SHOULD** be able to derive a deterministic child stream from a key
(`derive('chunk:12,7')`), so that generating a portion of the world is reproducible independently of
the order in which the portions are generated. **It is not implemented**: the only requester is
GEN-9, in a priority-3 service whose API generates a whole map per call, and chunked generation is
not currently planned. The hash-based seeding of RND-19 makes the addition **additive**: a derived
stream does not alter the seed of any existing stream, so implementing it later will break neither
saves nor maps.

### Statistical shapes

**RND-6** — The service **MUST** expose a parametric **Gaussian** source (mean, standard deviation)
with optional truncation, for the quantities that must cluster around a central value: damage
variation, shot spread, wait jitter, NPC inaccuracy.

The implementation **MUST** be a **sum of uniforms** (Irwin–Hall: twelve draws minus six, mean 0 and
σ 1 exactly), **not Box–Muller**, which uses `Math.log` and `Math.cos` and would violate RND-4. The
price is twofold and accepted: twelve draws per sample, and tails truncated at ±6σ. None of the uses
listed above is meaningful beyond 6σ, and RND-6 offers explicit truncation anyway.

**RND-7** — The service **MUST** expose **coherent, continuous noise** (Perlin or simplex) in 2D,
with support for multiple octaves (fBm), for procedural generation: elevation, biomes, resource
density, environmental variation. The noise **MUST** depend deterministically on the seed and the
coordinates, not on the sampling order. It **MAY** offer simplex as an alternative to Perlin.

The fBm octaves **MUST NOT** use `Math.pow` for lacunarity (RND-4): the frequency is obtained by
repeated multiplication. It is an implementation detail, but it is the one on which whether GEN-2
("bit-for-bit identical after a browser update") is true or false depends.

"Continuous" **MUST** be a number, not an adjective: the service **MUST** declare the bound within
which two nearby samples may differ (`NOISE_MAX_SLOPE`), because that bound is what tells a caller
how fine a sampling step has to be before the noise reads as terrain rather than as steps. It is a
**ceiling with room to spare**, not the largest value anyone has measured: a bound that the next
seed can step over is worse than no bound at all.

The noise construction — the permutation table, the gradient set, the fade and the output scale — is
part of the stability contract of RND-4, and is enumerated in ADR 0001.

**RND-8** — The service **MUST** expose the weighted draw (`weighted`) as a primitive: loot tables
and AI choices **MUST NOT** reimplement it.

**RND-23** — The service **MUST** expose the **dice roll** (`diceRoll(faces, count)`) as a primitive:
the sum of `count` dice of `faces` faces each, every die uniform over the **closed** interval
[1, faces]. One die when the count is left out; a count of zero rolls nothing, sums to zero and
consumes nothing.

It is not a duplicate of `int` (`int(1, faces + 1)`) for two reasons. It is the shape the rules of
the game are written in — GP-19 says `2d6`, not "twice an integer in [1, 7)" — and above all the sum
of N dice is **not** a uniform distribution over its own range: 2d6 peaks at 7, and a system that
reached for `int(2, 13)` would get a flat distribution with the same bounds and a different feel.
Having the primitive means no system has to rediscover the difference.

The bounds **MUST** be validated, and validated **before** the first die is rolled: a die has a whole
number of faces, at least one, and a roll a whole number of dice, at least zero. A refused roll
**MUST** leave the stream exactly where it was — a call that throws must not shift the sequence, or
the same seed would produce different games depending on whether a caller's bug was hit.

### Filtered randomness (perceived randomness)

**RND-9** — The service **MUST** offer a **filtered draw** mode which, for each **channel** (loot
from that enemy, hit outcomes for that weapon, spawns in that area), maintains the **current
weights** of its outcomes: whatever has just come up has its weight reduced, and recovers it over the
following draws.

The mechanism **MUST** be weight readjustment, **not re-rolling**, for two reasons. Re-rolling
systematically penalises frequent outcomes — which are the ones that repeat — and shifts the
distribution in an uncontrollable way; and, above all, it creates a **new pattern**: "never twice in
a row" is a rule the player learns and exploits, and it replaces a sequence that feels unfair with
one that is predictable. Weight readjustment does neither: seven heads in a row remain possible, but
their probability drops by orders of magnitude.

**RND-10** — The weight **reduction factor** and the **recovery rate** **MUST** be data-driven
(ARC-7.1) and organized into **profiles**. Since channel names are invented by the caller at runtime
(RND-15) and cannot be listed in a file, resolution from channel to profile **MUST** happen **by
prefix**, with a mandatory default profile:

```json
{
  "channelCap": 512,
  "default": "neutral",
  "profiles": {
    "neutral":  { "reduction": 0.60, "recovery": 2 },
    "lockpick": { "reduction": 0.25, "recovery": 5 }
  },
  "rules": [
    { "channel": "lockpick:*", "profile": "lockpick" }
  ]
}
```

Resolution **MUST** happen exactly once, when the channel is created, and stay stored with its state:
no per-draw cost.

When several rules match, the **most specific wins** — the longest prefix, and a rule without a `*`,
which matches the whole name, beats every prefix. Rules of equal specificity are settled by
declaration order, the earlier one winning. The tie-break is not decoration: without a total order
the profile a channel gets would depend on how the configuration happened to be read.

The **reduction and recovery are read together**: the reduction **multiplies** an outcome's weight
when it comes up, and the recovery sets the fixed step `(1 - reduction) / recovery` **added** on
every draw that lands elsewhere. `recovery` is therefore a number of draws exactly for an outcome
reduced **once from full weight**; one that has come up several times climbs back in fewer draws
than the count of reductions suggests, which is the intended shape — lean hard on a repeat, then let
go.

A reduction of zero **MUST** be refused: it would rule an outcome out for ever, which is the re-roll
rule ADR 0002 rejects arriving in the data instead of in the code. For the same reason the weights
**MUST** have a positive floor, so that a run of repeats stays possible rather than becoming
arithmetically impossible.

`'none'` **MUST** be reserved: it is the profile name `channels()` reports for a channel that is not
filtered at all, and a real profile sharing it would restore the ambiguity RND-21 exists to remove. A
configuration that defines it is refused.

`channelCap` belongs to RND-20 and is not read yet; it joins `FilterConfig` with the eviction that
gives it meaning.

**RND-11** — *Retired.* It imposed termination of the filter within a maximum number of re-rolls.
With weight readjustment (RND-9) there is no re-roll loop, so there is no termination to guarantee,
nor the "only one possible outcome" edge case. The identifier is not reused (see `README.md`).

**RND-12** — *Retired.* It offered weight readjustment as a **SHOULD** alternative to re-rolling. It
was absorbed into RND-9, which now *is* weight readjustment. The identifier is not reused.

**RND-13** — Channel state **MUST** be serialized: reloading a save **MUST NOT** reset the
anti-repetition memory, otherwise saving becomes a way of manipulating outcomes.

What is serialized is the **weights only**. The resolved profile is static data and **MUST** be
resolved again at load time, so that a rebalanced `random.json` takes effect on the next load rather
than being shadowed by a name written months earlier.

**RND-14** — The documentation of every channel **MUST** state which technique it uses and why:
techniques must be applied **where they are needed**, not everywhere. A boss's critical damage and a
flower's colour do not have the same requirements.

**RND-15** — Channel granularity **MUST** be **the game programmer's choice**, not imposed by the
service: it is whoever calls `filtered(channel, …)` who decides when a given entity deserves a
filtered sequence of its own and when it can share one. Passing a more specific `channel`
(`'lockpick:door:42'`, `'hits:enemyA'`) yields an anti-repetition memory dedicated to that entity;
passing a more generic `channel` (`'lockpick'`) makes the entities share the same memory. The service
**MUST NOT** infer granularity from the entity type nor impose a per-instance channel by default: it
merely keeps a distinct state for every distinct `channel` (RND-9) and serializes it (RND-13). The
choice of key — and therefore of the boundary between sequences — remains the caller's
responsibility.

**RND-20** — Since RND-15 allows per-instance channels and no requirement provided for their
removal, channel state would grow with no upper bound: the door picked once and the enemy killed in
the second hour would stay in the save until the end of the game. The service **MUST** therefore:

1. keep at most **N channels**, with N data-driven (RND-10), evicting the **least recently** used
   channel when the cap is exceeded;
2. expose **`forget(channel)`** for the caller who *knows* the entity no longer exists.

The eviction order **MUST** be deterministic: the service's **draw counter** is used, never the
system clock (ARC-9.3), and ties are broken by channel name, to obtain a total order. An eviction
resets that channel's memory — the very thing RND-13 warns about — but the difference is that here it
is deterministic and does not depend on saving and reloading: it is not a lever in the player's
hands.

**RND-21** — The configuration **MUST** be **optional**, and in its absence the filter **MUST** be
inactive: `filtered()` behaves exactly like `weighted()`. This is not a balancing default in disguise
— ARC-3.2 forbids a generic service from containing one — it is the absence of the feature, and it is
needed by the reusability proof (ARC-3.4), which will have no `random.json`.

Since an unconfigured channel *looks* filtered without being so, the service **MUST** expose
`channels()`, which lists the live channels and the profile resolved for each.

### Structure

**RND-16** — The Gaussian, the coherent noise and the filter **MUST** derive from the **root seed**,
not from independent sources: this guarantees that RND-1 holds for all of them. *Deriving* from the
seed does not mean *consuming* the stream — see RND-18, which distinguishes the two cases.

**RND-17** — Impurity **MUST** be confined to two operations only: advancing a stream's state, and
updating a channel's weights. Every **transformation** (uniform→integer, uniform→Gaussian,
weights→choice, coordinates→noise) **MUST** be a pure function of its own inputs, testable without a
generator. `noise2` and `fbm2` **MUST** be pure throughout: they neither read nor write state.

**RND-18** — Which primitives advance a stream's state **MUST** be part of the contract, not an
implementation detail:

| Primitive | Consumes the stream | Why |
|---|---|---|
| `next` `int` `bool` `pick` `weighted` `shuffle` | **yes** | they *are* the sequence |
| `diceRoll` | **yes** (one per die) | every die is a draw of its own (RND-23) |
| `gaussian` | **yes** (12 draws) | it is a transformation of uniforms |
| `filtered` | **yes** (one) | it draws from the current weights |
| `noise2` `fbm2` | **no** | pure functions of (stream seed, x, y) |

The noise obtains its permutation table **once**, from the stream, when the stream is created. From
then on it advances nothing. This is what makes RND-7 ("not on the sampling order") true without
contradicting RND-16.

**RND-19** — A stream's seed **MUST** be `hash(root seed, id)`, or the explicit seed passed to
`stream(id, seed)`. It **MUST NOT** depend on creation order: with seeds assigned by position, adding
a `stream('ambient')` for a visual effect would renumber all the following streams and break every
existing save and every map from a seed.

`stream(id)` **MUST** always return the **same instance**: two distinct objects created from the same
id would start from the same position and produce the same numbers, giving identical rolls to two
callers who believe themselves independent.

An explicit seed **MUST** be serialized together with the stream's state (RND-22): restore **MUST
NOT** depend on the game passing the same number again.

**RND-22** — The service **MUST** expose `serialize()` and a **static factory**
`deserialize(state): RandomService`. Restore **MUST NOT** be an instance method: there would be an
instant in which the service is constructed but holds the randomness of the wrong game, and whoever
rolled a die in that instant would roll from the new game (CTX-9, CTX-10).

Only what cannot be rebuilt from the seed is serialized:

| | In the save | Why |
|---|---|---|
| state version | **yes** (currently **2**) | ARC-10.2 |
| root seed | **yes** | everything else follows from it |
| PRNG state of every **touched** stream | **yes** | it is the position in the sequence |
| a stream's explicit seed, if passed | **yes** | RND-19 |
| current weights, per live channel | **yes** | RND-13 |
| the profile resolved for a channel | no | static data; resolved again at load time (RND-13) |
| streams never requested | no | the seed is `hash(root seed, id)` |
| the noise's permutation table | no | rebuilt from the stream's seed |

`RND`'s save therefore grows with the streams used and the live channels (bounded by RND-20), not
with playing time.

## Test criteria

- **Reproducibility**: two instances with the same seed produce identical sequences over 10⁶ draws.
- **Cross-engine reproducibility** (RND-4): **golden vectors** — a list of expected values stored in
  the repo for `next`, `int`, `gaussian`, `noise2` and `fbm2`, verified on **chromium, firefox and
  webkit** with Playwright. Without this, nothing tests RND-4: "two instances with the same seed"
  runs on a single engine and always passes.
- **Stream independence**: consuming 1000 values from `ai` does not alter the sequence of `combat`.
- **Independence from creation** (RND-19): creating a new stream does not alter the sequence of any
  other; `stream(id)` called twice returns the same instance.
- **Uniformity**: χ² bucket test for `next()` and `int()`.
- **Dice** (RND-23): a single die is flat over [1, faces], the **highest face included** — the test
  that catches the off-by-one of a half-open range; the sum of N dice stays in [N, faces × N],
  reaches both ends, and peaks in the middle (2d6 at 7, about 6/36); one draw is consumed per die,
  none at all for a count of zero; every invalid bound is refused, with the value in the message and
  **without advancing the sequence**.
- **Gaussian**: sample mean and standard deviation within tolerance over 10⁵ samples; truncation does
  not shift the mean beyond the declared limit; no sample beyond ±6σ (RND-6).
- **Noise**: continuity (bounded difference between nearby samples, **swept over many tables and
  over cell interiors** — a bound measured along one walk of one seed confirms itself), determinism
  per coordinate, independence from sampling order; sampling the noise does not alter the stream's
  sequence (RND-18); a sum of octaves whose frequency would run past the largest representable
  number is refused rather than returning `NaN` from inside the declared interval.
- **Filter**: over 10⁴ draws consecutive repetitions collapse compared with the unfiltered weighted
  draw; **monotonicity** — if `w(a) > w(b)` then `freq(a) ≥ freq(b)`; and a **golden vector of the
  distribution**, compared against an expected distribution stored in the repo for a fixed
  configuration. It is *not* asserted that the distribution stays within tolerance of the **nominal
  weights**: the filter shifts it by construction, and that is its job.
- **Eviction** (RND-20): once the cap is exceeded, the least recently used channel is evicted,
  deterministically and independently of iteration order.
- **Serialization**: save, draw 100 values, reload, draw again → the same 100 values.
- **Reusability** (ARC-3.4): the service works with made-up channels and distributions, foreign to
  this game, and **with no configuration file at all** (RND-21).

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-9 (determinism)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-19 (damage formula), GP-25 (loot tables)
- [`adr/0001-bit-for-bit-reproducibility.md`](../adr/0001-bit-for-bit-reproducibility.md) ·
  [`adr/0002-weight-readjustment.md`](../adr/0002-weight-readjustment.md)
- [`loot.md`](./loot.md) · [`map-generation.md`](./map-generation.md) · [`combat.md`](./combat.md)

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
  channels(): readonly { channel: string; profile: string }[];

  serialize(): RandomState;
}

/** Restore is by construction, never through an instance method (RND-22). */
declare class Random implements RandomService {
  static deserialize(state: RandomState): RandomService;
}

interface RandomStream {
  next(): number;                                   // [0, 1)
  int(minIncl: number, maxExcl: number): number;
  bool(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: readonly { value: T; weight: number }[]): T;
  shuffle<T>(items: readonly T[]): T[];

  /** Normal by sum of uniforms, optionally truncated. Not Box–Muller: see RND-6. */
  gaussian(mean: number, stdDev: number, clamp?: [number, number]): number;

  /** Filtered draw on a channel: the weights of recent outcomes are reduced (RND-9). */
  filtered<T>(channel: string, entries: readonly { value: T; weight: number }[]): T;

  /** Coherent noise. A pure function of (stream seed, coordinates): it does not consume (RND-18). */
  noise2(x: number, y: number, options?: NoiseOptions): number;   // [-1, 1]
  fbm2(x: number, y: number, octaves: number, options?: NoiseOptions): number;
}
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

**RND-8** — The service **MUST** expose the weighted draw (`weighted`) as a primitive: loot tables
and AI choices **MUST NOT** reimplement it.

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

**RND-11** — *Retired.* It imposed termination of the filter within a maximum number of re-rolls.
With weight readjustment (RND-9) there is no re-roll loop, so there is no termination to guarantee,
nor the "only one possible outcome" edge case. The identifier is not reused (see `README.md`).

**RND-12** — *Retired.* It offered weight readjustment as a **SHOULD** alternative to re-rolling. It
was absorbed into RND-9, which now *is* weight readjustment. The identifier is not reused.

**RND-13** — Channel state **MUST** be serialized: reloading a save **MUST NOT** reset the
anti-repetition memory, otherwise saving becomes a way of manipulating outcomes.

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
| state version | **yes** | ARC-10.2 |
| root seed | **yes** | everything else follows from it |
| PRNG state of every **touched** stream | **yes** | it is the position in the sequence |
| a stream's explicit seed, if passed | **yes** | RND-19 |
| current weights, per live channel | **yes** | RND-13 |
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
- **Gaussian**: sample mean and standard deviation within tolerance over 10⁵ samples; truncation does
  not shift the mean beyond the declared limit; no sample beyond ±6σ (RND-6).
- **Noise**: continuity (bounded difference between nearby samples), determinism per coordinate,
  independence from sampling order; sampling the noise does not alter the stream's sequence
  (RND-18).
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

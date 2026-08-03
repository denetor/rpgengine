# Spec — `RND`, the randomness service

**Service:** `RND` · **Priority:** 1 · **Sheet:** [`services/random.md`](../services/random.md)
**ADR:** [`0001`](../adr/0001-bit-for-bit-reproducibility.md) ·
[`0002`](../adr/0002-weight-readjustment.md)

## Problem Statement

The game has no source of randomness yet, and every system that comes after — combat, loot, map
generation, AI — depends on one. If each of them called `Math.random()` on its own, four problems
would arise that are discovered late and paid for with a rewrite:

1. **Games cannot be reproduced.** A bug reported by a player is not reproducible, a save does not
   resume exactly where it left off, and a map generated from a seed is not the same map after a
   browser update.
2. **Systems contaminate each other.** Adding a random visual effect shifts the sequence consumed by
   combat, and the outcome of a fight changes for a reason that has nothing to do with combat.
3. **The right statistical shape is missing.** Damage variation wants to cluster around a central
   value, not be flat; a map's elevation wants to be continuous, not grainy. With only a uniform
   distribution, every system improvises its own approximation.
4. **Correct randomness is perceived as broken.** Seven heads in a row is a legitimate result for a
   fair coin, but the player who sees the same item drop seven times writes that the game is buggy.
   The problem is not the generator: it is that mathematically correct randomness and randomness
   *perceived as such* are different things, and a game needs both.

None of these can be fixed later. Determinism and stream independence are structural properties:
adding them to already-written systems means rewriting them.

## Solution

A service `RND` — **generic**, with no knowledge of this game — that is the project's single source
of randomness, and that offers four things behind a single API:

- **Independent streams per usage domain.** Combat, loot, generation and AI consume separate
  sequences. Each is seeded from the **root seed** through the hash of its own name, so adding a new
  stream does not touch the others and does not invalidate saves.
- **Bit-for-bit reproducibility, across different JavaScript engines too.** The generator is frozen
  (`xoshiro128**`), and no transcendental `Math` function appears on the path that produces values,
  because ECMAScript does not specify their exact result. See ADR 0001.
- **The statistical shapes the systems ask for**: a truncatable Gaussian for quantities that cluster
  around a value, coherent 2D noise and fBm for procedural generation, the weighted draw as a
  primitive.
- **Per-channel filtered randomness.** The caller declares a **channel**; the service keeps its
  **channel memory** — the current weight of each outcome — and reduces the weight of what has just
  come up, then lets it recover. Sequences that look broken become improbable without introducing a
  rule the player can learn and exploit. See ADR 0002.

All dynamic state is serializable and restorable by construction, so that reloading a game resumes
the sequences from the exact point and does not reset the anti-repetition memory.

Being the project's first service, this spec also includes the test scaffolding that ARC-11.1
requires and that does not exist today.

## User Stories

### Reproducibility

1. As a **game programmer**, I want two games started with the same root seed and the same sequence
   of inputs to produce the same result, so that I can reproduce a bug from a report rather than from
   a description.
2. As a **game programmer**, I want no point in the project to be able to call `Math.random()`, so
   that determinism does not depend on the discipline of whoever writes the code.
3. As an **engine maintainer**, I want the generator's algorithm to be chosen, documented and
   frozen, so that a browser update does not change players' games.
4. As an **engine maintainer**, I want the transcendental `Math` functions to be forbidden on the
   deterministic path, so that the reproducibility promise also holds across different engines and
   not only on my machine.
5. As an **engine maintainer**, I want the prohibition to be enforced by an automated check, so that
   it does not creep back in through a careless change months later.
6. As a **player**, I want a map generated from a seed to be the same map tomorrow, so that I can
   share a seed with another player and talk about the same world.

### Streams

7. As a **game programmer**, I want to obtain one stream per usage domain, so that combat and loot do
   not consume the same sequence.
8. As a **game programmer**, I want consuming numbers in one stream not to alter the sequence of the
   others, so that I can add a random visual effect without changing the outcome of a fight.
9. As a **game programmer**, I want a stream's seed to depend on its **name** and not on the order in
   which the streams are created, so that introducing a new stream does not renumber all the others
   and does not break existing saves.
10. As a **game programmer**, I want asking for the same stream twice to return the same instance, so
    that two parts of the code that believe themselves independent do not receive identical rolls.
11. As a **game programmer**, I want to be able to fix a stream's seed by hand when I have a reason
    to, so that I do not have to accept the automatic derivation in every case.
12. As a **game programmer**, I want a hand-fixed seed to survive saving, so that restore does not
    depend on the code passing the same number again.

### Statistical shapes

13. As a **combat programmer**, I want a Gaussian source parametric in mean and standard deviation,
    so that damage variation clusters around the nominal value instead of being flat.
14. As a **game programmer**, I want to be able to truncate the Gaussian to an interval, so that a
    variation can never produce negative or absurd damage.
15. As a **game programmer**, I want the Gaussian for wait jitter and NPC inaccuracy, so that
    behaviours look human rather than drawn from a lottery.
16. As a **generation programmer**, I want coherent, continuous 2D noise, so that I can produce
    elevations and biomes that vary gradually rather than randomly from cell to cell.
17. As a **generation programmer**, I want to be able to sum several octaves of noise, so as to get
    terrain with detail at multiple scales.
18. As a **generation programmer**, I want the noise to depend only on the seed and the coordinates
    and **not** on the sampling order, so that I can sample the cells in any order and regenerate a
    portion without the result changing.
19. As a **game programmer**, I want the weighted draw as a service primitive, so that loot tables
    and AI choices do not each reimplement it in their own way.
20. As a **game programmer**, I want convenience primitives (integer in a range, boolean with a
    probability, choice from a list, shuffling), so that I do not rewrite the same conversions from
    the uniform distribution every time.
21. As a **game programmer**, I want the dice roll (`NdF`) as a primitive, so that the rules of the
    game can be written in the notation they are designed in, and so that the sum of several dice
    keeps the bell shape it is chosen for instead of being flattened into a range of integers.

### Filtered randomness

22. As a **player**, I want not to see the same item drop seven times in a row from the same enemy,
    so that I do not conclude that the game is buggy.
23. As a **player**, I want the anti-repetition not to become a predictable rule, so that I cannot
    know in advance that the next hit will not be a critical.
24. As a **game programmer**, I want to declare a **channel** at draw time, so that I decide which
    sequences are separate and which are shared.
25. As a **game programmer**, I want the service not to infer granularity from the entity type, so
    that it is my code that establishes whether each door has its own sequence or all the doors
    share one.
26. As a **game designer**, I want to be able to adjust how much the weight of an outcome that has
    just come up is reduced and over how many draws it recovers, so that I can tune the feel without
    recompiling.
27. As a **game designer**, I want to group those parameters into **filter profiles** and assign them
    by channel-name prefix, so that I can apply them to channels that come into existence at runtime
    and cannot be listed in a file.
28. As a **game designer**, I want a mandatory default profile, so that a channel matching no rule
    still has a defined behaviour.
29. As a **player**, I want saving and reloading not to reset the anti-repetition memory, so that
    saving is not a way of manipulating outcomes.
30. As a **game programmer**, I want channel memory not to grow without bound, so that a fifty-hour
    game does not drag the sequences of thousands of entities that no longer exist into the save.
31. As a **game programmer**, I want to be able to declare explicitly that a channel is no longer
    needed, so as to free its memory when I know the entity is dead.
32. As an **engine maintainer**, I want automatic eviction to be deterministic and not depend on the
    system clock, so that it does not introduce a divergence between two otherwise identical games.
33. As a **game programmer**, I want to be able to list the live channels and the profile resolved
    for each, so as to notice that a channel I thought was filtered is not.
34. As a **game programmer**, I want the filter simply to be inactive without configuration, so that
    the service works in a project that does not use it and in the reusability tests.

### Saving

35. As a **player**, I want reloading a game to resume the random sequences from the exact point, so
    that I cannot replay the same moment with different outcomes.
36. As a **game programmer**, I want restore to happen by **construction** and not through a method
    called afterwards, so that there is no instant in which the service is alive but holds the
    randomness of the wrong game.
37. As a **game programmer**, I want the serialized state to have a version number of its own, so
    that I can migrate it without touching the format of the other services.
38. As a **game programmer**, I want only what cannot be rebuilt from the seed to be saved, so that
    the save grows with actual usage and not with playing time.

### Structure and performance

39. As a **game programmer**, I want `RND` neither to import nor to receive other services, so that
    it stays testable on its own and reusable in another project.
40. As a **game programmer**, I want the parameters to arrive already validated in the constructor
    and the service not to read files, so that invalid content fails at load time and not halfway
    through a game.
41. As a **game programmer**, I want to be able to construct two independent services in the same
    process, so that the tests do not share state and two games can coexist.
42. As a **generation programmer**, I want to be able to sample the noise hundreds of thousands of
    times per map without stutters, so that generation does not freeze the game.
43. As an **engine maintainer**, I want impurity to be confined to two operations only — advancing a
    stream, updating a channel's memory — so that the rest can be reasoned about as a pure
    transformation.

### Testing

44. As an **engine maintainer**, I want a headless test runner separate from the integration one, so
    that I can test the services without starting a browser.
45. As an **engine maintainer**, I want the cross-engine reproducibility promise to be verified on
    several real engines, so that it does not remain a statement of intent — today "two instances
    with the same seed" runs on a single engine and always passes.
46. As an **engine maintainer**, I want the service to be exercised with made-up channels and
    distributions, foreign to this game, so as to prove that it really is generic.

## Implementation Decisions

### Modules

- **`RND`, a generic service**, with no dependencies on other services and no `excalibur`. Built
  exactly once in the `GameContext` (CTX-1), it receives its own dependencies and parameters through
  the constructor (CTX-2).
- **No consumer service is touched.** `CBT`, `LOOT`, `GEN` and `AI` do not exist yet; this spec stops
  at the contract they will consume.
- **Test scaffolding**, absent today: a headless test runner, and a browser test project that reuses
  the existing Playwright configuration.

### Public contract

The contract is the one fixed in the `random.md` sheet, which remains the authoritative source:

```ts
interface RandomService {
  stream(id: StreamId, seed?: number): RandomStream;
  forget(channel: string): void;
  channels(): readonly { channel: string; profile: string }[];
  serialize(): RandomState;
}
// restore by construction, never through an instance method
declare function deserialize(state: RandomState): RandomService;
```

### Technical decisions

1. **Generator: `xoshiro128**`**, state in a `Uint32Array`, multiplications with `Math.imul`. Not
   PCG32: it would require 64-bit arithmetic, i.e. `BigInt`, which allocates on every operation.
   Frozen: changing it invalidates every save and every map from a seed (ADR 0001).
2. **Stream seed = `hash(root seed, id)`**, with a string hash function chosen, named and frozen
   together with the generator. The order in which streams are created is irrelevant by
   construction. An explicit seed passed by the caller takes precedence and is serialized.
3. **`stream(id)` is memoized**: the same `id` returns the same instance for the whole life of the
   service.
4. **Gaussian by sum of uniforms** (twelve draws minus six: mean 0 and σ 1 exactly), not Box–Muller,
   which would use `Math.log` and `Math.cos`. Tails truncated at ±6σ, which is beyond the meaning of
   any foreseen use (ADR 0001).
5. **Coherent 2D noise with a permutation table** built **exactly once**, from the stream, when the
   stream is created. From then on `noise2` and `fbm2` are pure functions of (seed, x, y) and **do
   not advance the stream's state**: this is the property that makes sampling independent of the
   order. The lacunarity of the octaves is applied by repeated multiplication, never with
   `Math.pow`.
6. **The consumption table is part of the contract**: `next`, `int`, `bool`, `pick`, `weighted`,
   `shuffle`, `gaussian`, `diceRoll` (one draw per die) and `filtered` advance the stream; `noise2`
   and `fbm2` do not. A call refused for invalid parameters — `diceRoll` validates its bounds before
   rolling — consumes nothing: a caller's bug must not shift the sequence.
7. **Filtered randomness by weight readjustment**, never by re-rolling: the channel memory holds the
   current weight of each outcome, reduced when it comes up and recovered over the following draws.
   No re-roll loop, hence no termination to guarantee (ADR 0002).
8. **Channel → profile resolution by prefix**, resolved **once** when the channel is created and
   stored with its state: no matching cost per draw. Data shape:

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

9. **Optional configuration.** In its absence the filter is inactive and `filtered()` behaves like
   `weighted()`. It is not a balancing default hidden inside a generic service: it is the absence of
   the feature.
10. **Parameter validation.** `RND` reads no files. It exposes the **expected shape** of its own
    configuration so that the game's loader validates it before the context is constructed
    (ARC-7.2, CTX-10), with errors that state file, path and value, and reports every problem at
    once rather than one per run.

    **No schema validation library**, against what this sheet first assumed. ARC-7.2 says "against a
    schema (e.g. Zod)", and the example is not the requirement: the contract table says `RND` depends
    on nothing and ARC-3.4 wants it liftable into another project as it stands, which a first runtime
    dependency for a shape of four fields would cost. The check is ~270 lines of pure code, and Zod's
    issues would need wrapping anyway — it has no notion of the file the value came from. `CFG` may
    still use a library for the rest of the game's content and call this check for `RND`'s slice.
11. **A channel cap with deterministic LRU eviction**, plus an explicit `forget(channel)`. Recency is
    measured with the service's **draw counter**, never with the system clock (ARC-9.3); ties are
    broken by channel name, to obtain a total order.
12. **Serialization**: version, root seed, state of the touched streams only (with the explicit seed
    if present), current weights of the live channels. Out: streams never requested, permutation
    tables, any value rebuildable from the seed. Restore through a static factory.
13. **No `derive()`.** The only requester is GEN-9, in a priority-3 service whose API generates a
    whole map per call, and chunked generation is not planned. Hash-based seeding makes a future
    addition additive: it will not alter the seed of any existing stream.
14. **Automated checking of the prohibitions.** A lint rule must forbid `Math.random()` outside
    `RND` (ARC-9.2) and `Math.log`, `Math.cos`, `Math.sin`, `Math.exp`, `Math.pow` inside `RND` and
    on every deterministic path. Without it, ADR 0001 is just an intention.

### Numbers deliberately left unfixed

The channel cap and the profile parameters (reduction, recovery) are **data**, not decisions of this
spec. The values in the example are plausible placeholders, not tuned: they are tuned by observing
the sequences produced, not by reasoning about them.

## Testing Decisions

### What makes a good test here

A test must exercise **external behaviour only**: it enters through a constructed `RND` and observes
its values. It must not know the generator's internal structure, the shape of the channel memory, nor
the names of the transformation functions. The practical criterion: if the test breaks when the noise
implementation is replaced by simplex with the same contract, the test is wrong.

The deliberate exception is the **golden vectors**: there the exactness of the values *is* the
contract (ADR 0001), and a test that breaks when the implementation changes is doing exactly its job.

### Seam

**Only one: the construction of the service.** Every test builds an `RND` with a seed (and, where
needed, a configuration) and verifies externally observable properties. No lower-level entry point is
introduced: no exported transformation functions, no injectable uniform source.

The consequence must be stated: the properties concerning a single transformation can be verified
**only statistically**, with large samples, and never with exact assertions on a chosen input. In
particular, RND-17's clause about the transformations being testable "without a generator" is **not
exercised**: it remains a design rule, not a verified fact.

A second entry point remains unavoidable for RND-4: reproducibility **across engines** is not
observable from a single engine. The golden vectors are therefore also run inside the browsers.

**The other exception is `isolation.spec.ts`, which reads the service's own source.** Some of what
ARC-3.2 requires has no observable behaviour until it is violated: a service that imports `node:fs`,
or holds a constant named after a goblin, produces exactly the same numbers as one that does not.
Those tests are the ones the criterion above cannot cover, and they are kept apart in a file that
says so — everything else in the suite enters through a constructed `RND`. The **balancing values**
half of ARC-3.2 is deliberately *not* checked that way: no scan can tell a hash constant from a
reduction factor, so it is proved by behaviour, in `reusability.spec.ts`.

A source scan reports what it finds, so **its failure mode is silence**: a scan that has stopped
reading, that walks one directory of two, or that deletes code on its way to stripping a comment
looks exactly like a scan that found nothing wrong. Each of those is therefore itself under test —
the walk is checked by name, and the word search is run over a sample containing the shapes a domain
name really takes (`LOOT_CHANNEL_CAP`, `defaultCombatReduction`, `goblinFight`) before it is trusted
to report none.

### Infrastructure to introduce

- **A headless test runner** (Vitest, consistent with the Vite already in use), separate from the
  integration tests — ARC-11.1 requires it and it does not exist today.
- **Re-enabling firefox and webkit** in the Playwright configuration: today they are commented out
  and only chromium runs, so any cross-engine test would pass without proving anything.
- **A test page** that runs the golden vectors in the browser and exposes the result, reached by the
  Playwright test.

### What gets tested

| Property | How |
|---|---|
| Reproducibility | two instances with the same seed, identical sequences over 10⁶ draws |
| Cross-engine reproducibility (RND-4) | golden vectors versioned in the repo for `next`, `int`, `gaussian`, `noise2`, `fbm2`, run on chromium, firefox and webkit |
| Stream independence | consuming 1000 values from one does not alter another's sequence |
| Independence from creation (RND-19) | creating a new stream does not alter any other; `stream(id)` twice → the same instance |
| Uniformity | χ² on buckets for `next` and `int` |
| Dice (RND-23) | one die flat over [1, faces], **highest face included**; the sum of N dice inside [N, faces × N], both ends reached, peak in the middle (2d6 at 7 ≈ 6/36); one draw consumed per die, none for a count of zero; invalid bounds refused with the value in the message and **without advancing the sequence** |
| Gaussian | sample mean and σ within tolerance over 10⁵ samples; truncation does not shift the mean beyond the declared limit; no sample beyond ±6σ |
| Noise | continuity between nearby samples, determinism per coordinate, independence from order; sampling does not alter the stream's sequence |
| Filter | consecutive repetitions collapse compared with the unfiltered weighted draw; **monotonicity** (`w(a) > w(b)` ⇒ `freq(a) ≥ freq(b)`); a **golden vector of the distribution** measured for a fixed configuration |
| Eviction | once the cap is exceeded the least recent channel is evicted, deterministically and independently of iteration order |
| Serialization | save, draw 100 values, reload, draw again → the same 100 values |
| Reusability (ARC-3.4) | made-up channels and distributions, and **with no configuration file at all** |

It is **not** asserted that the filter's long-term distribution stays within tolerance of the nominal
weights: the filter shifts it by construction, and that is its job. A tolerance wide enough to let
that test pass would make it meaningless (ADR 0002).

### Prior art

None for the unit tests: `RND` is the first service and the headless runner does not exist yet, so
this spec also fixes the convention for whoever comes next. The only existing test is a Playwright
visual snapshot on the main page, which is prior art only for the browser part: same configuration,
same `webServer`, one project more.

## Out of Scope

- **`derive()` and chunked generation** (RND-5, GEN-9). Deferred; the addition will be additive.
- **3D noise**, and simplex as an alternative to Perlin: RND-7 allows it (**MAY**), it does not
  require it.
- **The pity mechanism**: it is a loot game rule (LOOT-6), not a randomness technique. It lives in
  `LOOT` and does not touch `RND`.
- **The consumer services.** `CBT`, `LOOT`, `GEN` and `AI` are neither written nor modified.
- **The save file format.** `RND` produces and consumes its own portion of state with its own
  version; composing it, writing it and migrating it belongs to `SAVE`.
- **Tuning the filter profiles and the channel cap.** They are data, and they are tuned by playing.
- **Loading and validating `random.json`.** The service receives already-validated parameters;
  loading and validating belongs to the game (`CFG`).
- **Any integration with `excalibur`.**

## Further Notes

- **RND-17 has no test criterion.** The sheet listed "Transformations without a generator: by
  injecting a fake uniform sequence…", a criterion the chosen seam does not allow to be satisfied;
  it has been removed. RND-17 remains in force as a **design rule** — impurity is confined, the
  transformations are pure — but no test verifies it: code review is what holds it up.
- **The lint rule is the fragile part.** The prohibition on transcendentals has no observable effect
  until it is violated on an engine different from the development one: it is precisely the kind of
  error that no local test catches and that the automated check must prevent.
- **Re-enabling firefox and webkit has a cost**: CI time grows, and the existing visual snapshot
  tests may require per-engine snapshots. If this becomes a problem, the golden vectors can run in a
  dedicated Playwright project, with the three engines, while the visual snapshot stays on chromium
  alone.
- **One dependency is missing** and must be introduced with this work: the headless runner. A schema
  validation library was expected too and was **not** introduced — see the technical decision on
  parameter validation for why, and what it would have cost the contract table's first row.
- **`Math.sqrt` and `Math.imul` are allowed** and must be explicitly excluded from the lint rule:
  ECMAScript specifies their result exactly. The prohibition concerns transcendental functions only.

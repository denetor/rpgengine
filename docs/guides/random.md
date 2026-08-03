# RND — Random service: usage guide

This is a practical, call-by-call guide to the actual `RND` implementation in
`src/engine/core/random`. For the requirements and the rationale behind each design
decision, see [`../services/random.md`](../services/random.md) — this page only shows how to
call the public surface. Every example below reflects the real signatures exported from
`src/engine/core/random/index.ts`.

```ts
import {
  Random,
  UNFILTERED_PROFILE,
  NOISE_MAX_SLOPE,
  validateFilterConfig,
  assertFilterConfig,
  describeIssue,
  FilterConfigError,
} from '../../engine/core/random'; // adjust the relative path to your file's location
import type {
  RandomStream,
  RandomState,
  FilterConfig,
  FilterConfigIssue,
  WeightedEntry,
} from '../../engine/core/random';
```

## 1. Quick reference

One line per call; jump to the matching section below for the description, the full example
and the error cases.

| Call | Consumes the stream? | Notes |
|---|---|---|
| `rnd.stream(id, seed?)` | — | memoized per `id` (RND-19) |
| `rnd.forget(channel)` | no | no-op if the channel is unknown |
| `rnd.channels()` | no | diagnostic, includes unfiltered channels |
| `rnd.serialize()` | no | |
| `Random.deserialize(state, filter?)` | — | static factory |
| `stream.next()` | yes | |
| `stream.int(min, maxExcl)` | yes | |
| `stream.bool(p)` | yes | |
| `stream.pick(items)` | yes | throws on empty list |
| `stream.shuffle(items)` | yes (`n - 1` draws) | returns a new array |
| `stream.diceRoll(faces, count?)` | yes (one per die) | validated before rolling |
| `stream.gaussian(mean, sd, clamp?)` | yes (12 draws) | Irwin–Hall, clamps, never redraws |
| `stream.weighted(entries)` | yes | validated before drawing |
| `stream.filtered(channel, entries)` | yes (one) | `weighted` when unconfigured |
| `stream.noise2(x, y, options?)` | no | pure function of seed + coordinates |
| `stream.fbm2(x, y, octaves, options?)` | no | pure function of seed + coordinates |

## 2. Creating the service

Builds the single source of randomness for a game: a root seed, and optionally a filter
configuration that governs the anti-repetition behaviour of filtered draws (§9).

```ts
// A root seed only. No filter configuration: filtered() will behave exactly like weighted().
const rnd = new Random(123456);
```

```ts
// With a filter configuration, already validated by the loader (see §12).
const config: FilterConfig = {
  channelCap: 512,
  default: 'neutral',
  profiles: {
    neutral: { reduction: 0.6, recovery: 2 },
    lockpick: { reduction: 0.25, recovery: 5 },
  },
  rules: [{ channel: 'lockpick:*', profile: 'lockpick' }],
};
const rnd2 = new Random(123456, config);
```

The root seed must be a whole 32-bit number (`isSeed`), whatever sign: it is taken through
`| 0`. `new Random(2.5)` throws immediately:

```ts
new Random(2.5);
// Error: random service: the root seed '2.5' is not a whole 32-bit number
```

## 3. Streams

Gets (or creates, on first request) an independent sequence of random values for one usage
domain — combat, loot, world generation, AI, ambience. Drawing from one stream never alters
any other's sequence.

```ts
const combat: RandomStream = rnd.stream('combat');
const loot: RandomStream = rnd.stream('loot');

rnd.stream('combat') === combat; // true — same id, same instance (RND-19)
```

An explicit seed can be passed the first time a stream is requested:

```ts
const scripted = rnd.stream('tutorial-fight', 42);
```

Asking again for an existing stream with a *different* explicit seed throws — the seed is
only read on creation:

```ts
rnd.stream('tutorial-fight', 43);
// Error: stream 'tutorial-fight' already exists with a different seed: the seed is read
// only when the stream is created
```

Every method below is called on a `RandomStream`, not on `Random` itself.

## 4. Uniform draws

The basic building blocks: a raw random float, a random whole number in a range, a coin
flip at a given probability, picking one item out of a list, and putting a list in a random
order.

```ts
combat.next();              // 0.7231… — a float in [0, 1)
combat.int(1, 7);           // 4 — an integer in [1, 7)
combat.bool(0.25);          // false — true with probability 0.25
combat.pick(['sword', 'axe', 'bow']); // 'axe'
combat.shuffle([1, 2, 3, 4]);         // [3, 1, 4, 2] — new array, input untouched
```

`pick` throws on an empty list; `shuffle` returns a fresh array and never mutates its
argument.

## 5. Dice rolls

Simulates rolling `count` dice of `faces` faces each and returns their sum — the shape game
rules are actually written in (`2d6`, not "a random integer between 2 and 12"), which is why
it is a primitive of its own rather than a call to `int`.

```ts
combat.diceRoll(6);      // one d6, in [1, 6]
combat.diceRoll(6, 2);   // 2d6: sum of two d6, in [2, 12], peaks at 7
combat.diceRoll(20, 0);  // 0 — no die rolled, nothing consumed from the sequence
```

Bounds are validated **before** rolling; a rejected call does not advance the stream:

```ts
combat.diceRoll(0);
// Error: a die must have a whole number of faces, at least one: got 0

combat.diceRoll(6, -1);
// Error: a roll must be a whole number of dice, at least zero: got -1
```

## 6. Gaussian (normal) distribution

Draws a value from a normal (bell-curve) distribution around a mean, for quantities that
should cluster around a central value rather than spread flat: damage variation, shot
spread, wait jitter, NPC inaccuracy.

```ts
// mean, standard deviation, optional [low, high] truncation
const damage = combat.gaussian(50, 8);
const spread = combat.gaussian(0, 2, [-6, 6]);
```

It is a sum of twelve uniforms (Irwin–Hall), never Box–Muller (RND-4/RND-6): it consumes
twelve values from the stream per call, and truncation **clamps**, it never redraws.

```ts
combat.gaussian(NaN, 1);
// Error: a gaussian mean must be a finite number: got NaN

combat.gaussian(0, -1);
// Error: a gaussian standard deviation must be a finite number, at least zero: got -1

combat.gaussian(0, 1, [5, -5]);
// Error: a gaussian truncation must be a finite interval, low bound first: got [5, -5]
```

## 7. Weighted draws

Picks one entry out of a table where each entry carries its own probability (weight)
instead of every entry being equally likely — the primitive loot tables and AI choices are
built on, so they never have to reimplement it.

```ts
const table: WeightedEntry<string>[] = [
  { value: 'common', weight: 70 },
  { value: 'rare', weight: 25 },
  { value: 'legendary', weight: 5 },
];

loot.weighted(table); // 'common' most of the time
```

An entry of weight 0 never comes up; every weight must be finite and ≥ 0, and at least one
must be positive:

```ts
loot.weighted([]);
// Error: cannot draw from an empty weighted table

loot.weighted([{ value: 'x', weight: -1 }]);
// Error: a weight must be a finite number, at least zero: got -1
```

## 8. Filtered draws (perceived randomness)

A weighted draw (§7) that also fights *perceived* unfairness: on a named channel, whatever
outcome just came up has its weight temporarily reduced, and recovers it over the following
draws. Nothing is ever ruled out — seven heads in a row stays possible, just far less
likely — and there is no "never twice in a row" pattern for a player to learn and exploit.

```ts
// Same table as §7, but on a named channel: what just came up is temporarily
// less likely to come up again, and recovers over subsequent draws (RND-9).
loot.filtered('chest:dungeon-3:barrel-12', table);
```

Channel granularity is entirely the caller's choice (RND-15):

```ts
// One shared memory for every barrel in this dungeon...
loot.filtered('chest:dungeon-3', table);

// ...or one memory per individual barrel.
loot.filtered('chest:dungeon-3:barrel-12', table);
loot.filtered('chest:dungeon-3:barrel-13', table);
```

With no `FilterConfig` passed to the constructor, `filtered` behaves exactly like
`weighted` (RND-21) — the channel is still remembered for diagnostics (see §9), but nothing
is reduced.

## 9. Channel diagnostics and cleanup

Inspects and manages the anti-repetition memory that filtered draws (§8) build up: which
channels currently exist, which profile governs each one, and an explicit way to drop a
channel's memory once the entity behind it is gone.

```ts
rnd.channels();
// [{ channel: 'chest:dungeon-3:barrel-12', profile: 'lockpick' }, ...]
```

On a service with no `FilterConfig`, every reported profile is `UNFILTERED_PROFILE`
(`'none'`) — this is how you tell a channel that only *looks* filtered from one that
actually is.

```ts
// The barrel was looted and destroyed: drop its anti-repetition memory now,
// instead of waiting for the channel cap to evict it.
rnd.forget('chest:dungeon-3:barrel-12');
```

`forget` on a channel that does not exist is a no-op, not an error. It does not touch the
service's draw counter, so it never shifts anyone else's sequence.

## 10. Coherent noise (Perlin / fBm)

Produces smooth, continuous values over a 2D plane — and sums of several octaves of it — for
procedural generation: terrain elevation, biomes, resource density, environmental variation.
Unlike every call above, these are pure functions of `(stream seed, coordinates)` and
consume nothing from the stream (RND-18), so a map region can be resampled on its own and
comes out identical.

```ts
const gen = rnd.stream('worldgen');

gen.noise2(12.5, 7.25);                              // in [-1, 1], frequency 1 (default)
gen.noise2(12.5, 7.25, { frequency: 0.05 });

gen.fbm2(12.5, 7.25, 4);                              // 4 octaves, default lacunarity/persistence
gen.fbm2(12.5, 7.25, 4, {
  frequency: 0.05,
  lacunarity: 2,
  persistence: 0.5,
});
```

`NOISE_MAX_SLOPE` is the declared continuity bound: at frequency `f` and sampling step `d`,
two neighbouring samples differ by at most `NOISE_MAX_SLOPE * f * d`. Use it to size a
sampling step:

```ts
const frequency = 0.05;
const step = 1;
const maxDelta = NOISE_MAX_SLOPE * frequency * step; // 0.2
```

Invalid inputs throw before sampling:

```ts
gen.noise2(NaN, 0);
// Error: noise coordinates must be finite numbers: got (NaN, 0)

gen.noise2(0, 0, { frequency: 0 });
// Error: a noise frequency must be a finite positive number: got 0

gen.fbm2(0, 0, 0);
// Error: a sum of octaves needs a whole number of octaves, at least one: got 0
```

## 11. Save and restore

Turns the service's whole state — root seed, the position of every stream actually used,
and the live channels' anti-repetition memory — into plain data for a save file, and rebuilds
an equivalent service from it, so a reloaded game resumes the random sequences from the exact
point they left off.

```ts
const state: RandomState = rnd.serialize();
// { version: 3, rootSeed: 123456, streams: [...], channels: [...] }

// Restore is a static factory, never an instance method (RND-22): there is no
// instant where a live service holds the wrong game's randomness.
const restored = Random.deserialize(state, config);
```

- Only **touched** streams are in `streams`; a stream never requested is rebuilt from its
  name on next use.
- `filter` configuration is **not** part of the save — pass the configuration currently in
  force at load time; a rebalanced `random.json` takes effect on the next load.
- Reloading a save **without** a `FilterConfig` drops the channels' weights (there is
  nothing to apply them with); channel names still show up in `channels()` as
  `UNFILTERED_PROFILE`.

`Random.deserialize` validates the state before building anything from it — a corrupt save
throws rather than producing a subtly wrong game:

```ts
Random.deserialize({ version: 2, rootSeed: 1, streams: [], channels: [] } as RandomState);
// Error: random state: version 2 cannot be read by version 3
```

## 12. Validating a filter configuration (`game/balance/random.json`)

Checks that a game's filter configuration — the channel profiles and prefix rules that
drive filtered draws (§8) — is well-formed *before* it is handed to `Random`, so a typo or
an out-of-range value in `random.json` is refused with a precise, actionable error instead
of quietly producing a subtly broken game hours later. `RND` reads no files itself: this is
what the loader is expected to call first (RND-24).

```ts
const raw: unknown = JSON.parse(fileContents);
const issues: readonly FilterConfigIssue[] = validateFilterConfig(raw, 'random.json');

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(describeIssue(issue));
    // random.json: profiles['lockpick'].reduction: expected a number greater than 0
    // and at most 1, or an outcome would stop coming up altogether; found 1.5
  }
  throw new Error('invalid random.json');
}
```

Or, to fail fast with a single exception carrying every issue:

```ts
try {
  assertFilterConfig(raw, 'random.json');
} catch (error) {
  if (error instanceof FilterConfigError) {
    console.error(error.message); // every issue, one per line
    console.error(error.issues);  // the same issues as structured data
  }
  throw error;
}
```

Notes on the check:

- `undefined` (the key not present at all) is valid — it means "no filter". An explicit
  `null` is refused.
- Every problem is reported at once, except cascades: an invalid `profiles` block does not
  also report every now-unresolvable profile reference.
- Unknown keys are refused rather than ignored, so a typo in `rules` is caught instead of
  silently doing nothing.
- `'none'` cannot be used as a profile name — it is reserved for `UNFILTERED_PROFILE`.

## Links

- [`../services/random.md`](../services/random.md) — full contract, requirements (`RND-*`) and
  test criteria.
- `src/engine/core/random/index.ts` — the actual public surface this guide documents.
- `src/engine/core/random/reusability.spec.ts` — a second, domain-agnostic worked example
  (a vineyard, not a dungeon) exercising the whole surface end to end.

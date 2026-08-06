# CFG — Parameter composition: usage guide

This is a practical, call-by-call guide to the actual `CFG` implementation in
`src/engine/core/config`. For the requirements and the rationale behind each design decision,
see [`../services/config.md`](../services/config.md) — this page only shows how to call the
public surface. Every example below reflects the real signatures exported from
`src/engine/core/config/index.ts`.

```ts
import { composeConfig, ConfigError, describeIssue } from '../../engine/core/config'; // adjust the relative path
import type {
  Composed,
  ConfigIssue,
  ConfigSource,
  Problem,
  SectionShape,
} from '../../engine/core/config';
```

`CFG` is a **verb, not a noun**: one pure function that runs once during bootstrap, returns the
services' parameters, and becomes garbage. There is no object to keep, nothing to inject, and
nowhere to look a value up at runtime (CFG-15).

## 1. Quick reference

One line per call; jump to the matching section below for the description, the full example and
the error cases.

| Call | Reads anything? | Notes |
|---|---|---|
| `composeConfig(shapes, sources)` | no | returns a **tuple**, one slice per shape, in order |
| `describeIssue(issue)` | no | one issue as one line of text |
| `new ConfigError(issues)` | — | thrown by `composeConfig`; carries **every** issue |

And the three things a caller writes rather than calls:

| Written by | What | Notes |
|---|---|---|
| the **service** | a section: `{ key, fallback, validate }` | matched structurally — no import from `CFG` (CFG-13) |
| the **bootstrap** | the list of sections | needs `as const` if it is given a name (§9) |
| the **bootstrap** | the sources: `{ name, values }` | already read and parsed (CFG-14) |

## 2. Declaring a section (the service's job)

A section is what a service says about its own parameters: the key it is written under, what
they are when nobody mentions them, and the check that accepts them. All three belong to the
service, never to `CFG` — which knows no key, no default and no range (CFG-12).

```ts
// In the service, e.g. src/engine/core/random/config.ts
interface FilterSection {
  readonly key: 'random';
  readonly fallback: FilterConfig | undefined;
  validate(value: unknown): readonly FilterConfigProblem[];
}

export const FILTER_SECTION: FilterSection = {
  key: 'random',
  fallback: undefined,
  validate: filterConfigProblems,
};
```

The service **imports nothing from `CFG`** to write this: the object matches `SectionShape`
structurally. That is what keeps a generic service liftable into a project that composes its
parameters some other way (ARC-3.4, ARC-4.1), and it is what keeps a service from importing
another service (ARC-4.1).

The check reports **every** problem and takes **no source**: a service validating its own slice
has nothing true to say about where the value came from, and `CFG` — the only thing that saw it
arrive — stamps that on afterwards (CFG-3).

```ts
// `FilterConfigProblem` is the service's own type, declared in the service:
// { path: string; value: unknown; message: string }. It matches `CFG`'s
// `Problem` structurally, which is the whole point — nothing is imported.
function filterConfigProblems(value: unknown): readonly FilterConfigProblem[] {
  if (!isRecord(value)) {
    return [{ path: '', value, message: 'expected an object' }];
  }
  // …one entry per thing wrong, with path, value and message
  return [];
}
```

| Field of a `Problem` | Meaning |
|---|---|
| `path` | where in the section: `'channelCap'`, `"profiles['lockpick'].reduction"`. Empty for the section itself |
| `value` | the offending value, exactly as it was found at `path` |
| `message` | what was expected there. Does **not** repeat the value: `describeIssue` adds it |

## 3. Composing (the bootstrap's job)

Takes the sections and the sources, applies the declared precedence, runs each service's check
on the merged result, and either returns every slice or throws with every problem it found.

```ts
const [filter] = composeConfig([FILTER_SECTION], [
  { name: 'random.json', values: { random: await readJson('game/balance/random.json') } },
]);

const rng = new Random(seed, filter);
```

There is no `if` in it. The happy path is the only path a caller writes, because the unhappy one
stops the program: a game that cannot compose its parameters has nothing to do next (CTX-10).

What comes back is a **tuple**, one slice per shape, in the order the shapes were given — there
is no object holding all of them (CFG-8):

```ts
const [filter, timeOfDay, difficulty] = composeConfig(
  [FILTER_SECTION, TIME_SECTION, DIFFICULTY_SECTION],
  sources,
);
```

`CFG` reads nothing, parses nothing, and consults neither clock nor environment (CFG-14).
Whoever has a file system, a `fetch` or a bundler passes the result in already parsed, and names
it — the name appears in errors only because the caller gave it.

## 4. Sources and precedence

The precedence is declared and deterministic: the shape's `fallback` first, then the sources
**in the order they are given**, each overriding the previous (CFG-4).

```ts
// Nobody mentions the section: the slice is the shape's own fallback.
const [rows] = composeConfig([ROWS_SECTION], []);

// One source over the fallback.
const [rows] = composeConfig([ROWS_SECTION], [
  { name: 'estate.json', values: { rows: { spacing: 3, vinesPerRow: 44 } } },
]);

// Two sources: the second wins where they overlap.
const [rows] = composeConfig([ROWS_SECTION], [
  { name: 'estate.json', values: { rows: { spacing: 3 } } },
  { name: 'this-year.json', values: { rows: { spacing: 2.4 } } },
]); // spacing: 2.4
```

A **partial** source is legitimate: writing three keys of thirty does not turn the other
twenty-seven into `undefined`.

```ts
const [rows] = composeConfig([ROWS_SECTION], [
  { name: 'this-year.json', values: { rows: { spacing: 2.4 } } },
]); // { spacing: 2.4, vinesPerRow: 60 } — vinesPerRow still from the fallback
```

A key **not written at all** leaves the section alone; a key written as `undefined` is a value,
and the section's own check is entitled to have an opinion about it.

## 5. The overlay is one level deep, and no deeper

Below a section's key a value is replaced **whole**: a list of rules or a map of profiles from a
source does not merge into the one it replaces (CFG-4).

```ts
// Fallback: { hectares: { 'the-hill': 1.5, 'below-the-well': 0.8 }, walked: [...] }
const [plots] = composeConfig([PLOTS_SECTION], [
  { name: 'estate.json', values: { plots: { hectares: { 'the-hill': 1.5 } } } },
]);
// hectares is now exactly { 'the-hill': 1.5 } — the well plot is gone, not merged back in.
```

Deep merging is refused on purpose: merging two arrays element by element assumes that
`rules[0]` in the file *is* `rules[0]` in the default, which nothing says, and it makes
**removing** an entry impossible. A value that is not an object replaces whatever was there.

## 6. Refusal: one throw, every problem

One issue anywhere means nothing comes back. `composeConfig` throws a single `ConfigError`
carrying every problem of every section, so that a designer fixes five typos in one run instead
of five (CFG-3), and no service is ever constructed on parameters that did not validate (CTX-10).

```ts
try {
  const [filter] = composeConfig([FILTER_SECTION], sources);
  return new Random(seed, filter);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message); // every issue, one per line
    console.error(error.issues);  // the same issues as structured data
  }
  throw error;
}
```

Each issue is the service's `Problem` plus the one thing no service could have supplied:

```ts
const issue: ConfigIssue = error.issues[0];
// {
//   source: 'random.json',
//   path: 'channelCap',
//   value: 0,
//   message: 'expected a whole number of channels of at least 1',
// }

describeIssue(issue);
// random.json: channelCap: expected a whole number of channels of at least 1; found 0
```

The `source` is **the sources that composed the section**, joined — not the source of the
offending key:

| Which sources mentioned the section | `source` reads |
|---|---|
| none (the value is the shape's fallback) | `defaults` |
| one | `random.json` |
| two or more, in order | `base.json+local.json` |

Naming the file that carried the offending *key* would require `CFG` to take a `path` apart, and
the dots and brackets in a path are a notation the **service** invents. This is coarser and
always honest: it names every file that had a hand in the section, and never the wrong one.

Two more things to know about the check:

- It runs **once, on the merged result**, never on a single source: a partial file is legitimate,
  so a source is not a thing that can be valid on its own.
- Every section is validated even after one has failed, so one bad value in the first section
  does not hide a bad value in the last.

## 7. A section no shape claims

A top-level key of a source that no shape claims is refused as an issue like any other, listing
the sections that were expected (CFG-16).

```ts
composeConfig([FILTER_SECTION], [
  { name: 'random.json', values: { randmo: { channelCap: 512 } } },
]);
// ConfigError — randmo: is not a section of this configuration (expected random); found {"channelCap":512}
```

This is the one check no service can perform, because no service sees the set of sections.
Without it a misspelt section name is the quietest failure the engine can have: the file parses,
nothing refuses it, the game starts with every default in place, and the designer finds out
months later that the file was never read.

The cost: a bootstrap composing only *some* of the game's shapes cannot be handed a source
carrying the others. Pass the sections that this start actually composes.

## 8. Two shapes claiming one key

That is a bug in the caller's own code rather than a fact about the game's data, so it throws a
plain `Error` — immediately, before a single source is looked at, and **not** as a `ConfigIssue`:

```ts
composeConfig([FILTER_SECTION, FILTER_SECTION], []);
// Error: two shapes claim the section 'random': a section belongs to one service
```

Reporting it among the issues would send somebody looking through a file that is perfectly fine.

## 9. Two typing traps, both load-bearing

The slices are typed **one by one and in order**. Two details make that work, and both were
established by compiling them rather than by reasoning about them — a reader who "simplifies"
either one loses the typing silently, since everything still runs.

**A named list of sections needs `as const`.** The `const` type parameter of `composeConfig`
preserves a tuple for an array literal *written at the call site*. Give that list a name — which
any bootstrap composing a dozen sections will want to — and it widens to an *array of the union*
before `composeConfig` is ever reached, so every slice comes back typed as every service's
parameters at once.

```ts
// Wrong: every slice is typed `FilterConfig | TimeParameters | undefined`.
const SECTIONS = [FILTER_SECTION, TIME_SECTION];

// Right.
const SECTIONS = [FILTER_SECTION, TIME_SECTION] as const;

const [filter, time] = composeConfig(SECTIONS, sources);
```

**A slice's type comes from `fallback`, not from `validate`.** A shape written with a bare
`fallback: undefined` types its slice `undefined` rather than "the service's parameters or none".
A service whose absent configuration is legitimate must write the type out — and write it **on
the section**, not on a constant holding the absence:

```ts
// Wrong: `NO_FILTER` is narrowed back to `undefined` wherever it is read, so the
// slice is typed `undefined` after all and no real configuration will fit it.
const NO_FILTER: FilterConfig | undefined = undefined;
export const FILTER_SECTION = { key: 'random', fallback: NO_FILTER, validate };

// Right: the type on the section itself.
export const FILTER_SECTION: {
  key: 'random';
  fallback: FilterConfig | undefined;
  validate: typeof filterConfigProblems;
} = { key: 'random', fallback: undefined, validate: filterConfigProblems };
```

The test that catches either mistake assigns a real value **to** the slice's type. The reading
one writes first — assigning the slice *to* `FilterConfig | undefined` — passes in both cases,
because `undefined` is assignable to it too.

```ts
const [filter] = composeConfig([FILTER_SECTION], []);

const stillAConfiguration: typeof filter = someRealConfiguration; // fails if either trap is live
```

## 10. What `CFG` deliberately is not

- **Not a container.** It does not survive bootstrap, is not a field of the `GameContext`, and is
  injected into nothing. What a service gets is a constructor parameter, indistinguishable from a
  compiled-in constant (CFG-15).
- **Not a validator.** It knows that a section did not validate; it does not know what a
  `reduction` is, and must not learn (CFG-13).
- **Not a loader.** It reads no file, parses nothing, and touches neither clock nor environment.
  A `loadConfig` would invite somebody to give it a path (CFG-14).
- **Not the home of the player's preferences.** Volume, language, bindings and accessibility are
  mutable at runtime and persisted outside the save: they belong to `SET`. A value is either a
  construction parameter or a preference, never both (CFG-12).

## Links

- [`../services/config.md`](../services/config.md) — full contract, requirements (`CFG-*`) and
  test criteria.
- [`random.md`](./random.md) — the guide to `RND`, the first service to declare its own section.
- `src/engine/core/config/index.ts` — the actual public surface this guide documents.
- `src/engine/core/config/reusability.spec.ts` — a domain-agnostic worked example (an estate
  growing grapes, not a dungeon) exercising the whole surface end to end.
- `tests-headless/composed-parameters.spec.ts` — the two services meeting: a section composed
  here and handed to a real `Random`.

# CFG — Parameter composition and validation

**Area:** Core · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `CFG-*`

## Purpose

Turn heterogeneous, untrusted sources into the **already validated parameters** the services are
constructed with: it applies a declared precedence, hands each shape to the service that owns it, and
refuses **in block** before a `GameContext` exists (CTX-10). It knows no key, owns no value, and does
not exist after bootstrap.

`CFG` is therefore a **verb, not a noun**. It is not the place where the game's numbers live, and no
service reads from it at runtime: it runs once, returns the slices, and becomes garbage. The service
that uses a parameter is the one that declares its shape and its default — the pattern `RND` already
follows (RND-24) — because a generic engine cannot contain this game's constants (ARC-3.2), and
because a number's meaning belongs where the number is used.

Two things it deliberately is **not**:

- **A container.** A `CFG` that survived bootstrap and answered questions would be the mutable global
  ARC-8.1 forbids, spelled in capitals. What a service gets is a constructor parameter,
  indistinguishable from a compiled-in constant. There is no lookup, because there is nothing left to
  look up in: `composeConfig` returns the slices **in the order of the shapes it was given**, and the
  caller destructures them.
- **The home of the player's preferences.** Volume, language, bindings and accessibility are mutable
  at runtime and persisted outside the save: a different lifetime, a different store, a different
  direction of travel. They belong to [`SET`](./settings.md), and the two sets of values are disjoint
  (CFG-12).

The whole mechanism is roughly sixty lines: a loop over the shapes, a loop over the sources, and a
three-line overlay. That is deliberate. Every ambition beyond it — a registry, a lookup, a merge that
descends, a provenance that follows a value down a path — buys precision the engine does not need
with machinery that outlives the moment it was written for.

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, other services, the file system, the network, any key of this game |
| Consumed by | `game/bootstrap`, once, before `createGameContext` (CTX-10) |
| Dynamic state | **none**: it does not exist after bootstrap |
| Static state | none of its own — only what the caller passes it for the duration of the call |
| External data | **none**: the sources arrive **already read and parsed**, as values (CFG-14) |
| Events emitted | none |
| Order of magnitude | one call per game start, over a few dozen keys |

## Public API (indicative)

```ts
/**
 * One source of parameters, as the caller read it. `CFG` does no I/O: whoever
 * has a file system, a `fetch` or a bundler passes the result in.
 */
interface ConfigSource {
  /** How the caller wants it named in an error: 'random.json', 'defaults', … */
  readonly name: string;
  /** Already parsed, keyed by section. `CFG` neither reads nor parses. */
  readonly values: Readonly<Record<string, unknown>>;
}

/**
 * What is wrong with a value, in the terms a service can speak: what was
 * expected, where, and what was found instead. **Not** where it came from — a
 * service validating its own slice cannot know that (CFG-3).
 */
interface Problem {
  /** `'channelCap'`, `"profiles['lockpick'].reduction"`. Empty for the section itself. */
  readonly path: string;
  readonly value: unknown;
  readonly message: string;
}

/**
 * What a service says about its own slice: the key it is written under, what it
 * is when nobody mentions it, and the check that accepts it. All three belong to
 * the service, never to `CFG` (CFG-13).
 */
interface SectionShape<T> {
  readonly key: string;
  /** The section in the absence of every source. May legitimately be `undefined` (RND-21). */
  readonly fallback: T;
  /** The service's own check, which reports **every** problem, not the first (RND-24). */
  validate(value: unknown): readonly Problem[];
}

/** A problem, plus the one thing no service could have supplied (CFG-3). */
interface ConfigIssue extends Problem {
  /** The sources that composed the section, joined: 'random.json', 'base+local'. */
  readonly source: string;
}

/** The slice of each shape, in the order the shapes were given. */
type Composed<S> = { [K in keyof S]: S[K] extends SectionShape<infer T> ? T : never };

/**
 * Not called `load`, because it loads nothing: it composes. The name is the
 * contract — a `loadConfig` invites somebody to give it a path.
 *
 * Throws `ConfigError` with **every** problem found (CFG-3). Two shapes sharing
 * a key throw as well, immediately: that is a bug in the caller's code, not a
 * fact about the game's data, and it has no source, no path and no value to be
 * reported as an issue with.
 */
declare function composeConfig<const S extends readonly SectionShape<unknown>[]>(
  shapes: S,
  sources: readonly ConfigSource[],
): Composed<S>;

/** A configuration that cannot be used, and everything wrong with it, in one throw. */
declare class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];
}

/** One issue as a line: `random.json: random.channelCap: expected …; found 0`. */
declare function describeIssue(issue: ConfigIssue): string;
```

Two details of that signature are load-bearing, and both were established by compiling the contract
before writing it down rather than by reasoning about it:

- **`const S`.** Without the `const` type parameter the array literal is inferred as an *array of the
  union* of the shapes rather than as a tuple, and every slice comes back typed as every service's
  parameters at once. The tuple is the whole point of CFG-8; `const` is what makes it one.
- **The fallback's type is the slice's type.** `T` is inferred from `fallback`, not from `validate`,
  which says nothing about what a valid value is.

A service declares its section without importing anything from here: the object matches
`SectionShape` **structurally**, which is what keeps a generic service free of any dependency on the
mechanism that configures it (ARC-4.1, CFG-13). Which makes the second point above something to
write out, since a bare `undefined` would type the composed slice `undefined`:

```ts
/** The absence of a configuration is the absence of the filter (RND-21). */
export const FILTER_SECTION: {
  key: 'random';
  fallback: FilterConfig | undefined;   // …the type on the section, for the reason below
  validate: typeof filterConfigProblems;
} = { key: 'random', fallback: undefined, validate: filterConfigProblems };
```

The type goes on **the section** and not on a constant holding the fallback. A
`const NO_FILTER: FilterConfig | undefined = undefined` — the shorter thing to write, and what this
sheet asked for until somebody compiled it — is narrowed back to `undefined` wherever it is read, so
the slice ends up typed `undefined` after all. Nothing says so: a test that assigns the slice *to*
`FilterConfig | undefined` passes either way, and only one that assigns a real configuration *to the
slice's type* fails.

The whole of a game's bootstrap, for the one service that exists today:

```ts
const [filter] = composeConfig([FILTER_SECTION], [
  { name: 'random.json', values: { random: await readJson('game/balance/random.json') } },
]);

const rng = new Random(seed, filter);
```

There is no `if` in it. The happy path is the only path a caller writes, because the unhappy one
stops the program: a game that cannot compose its parameters has nothing to do next (CTX-10).

## Requirements

**CFG-1** — No **magic number** **MUST** appear in the code. Every value that a game might want to
tune **MUST** reach the service that uses it as a **constructor parameter**, coming from data
validated at load time. This is the rule that ARC-12.1 states and that this sheet exists to make
possible; it holds for every service, and `CFG` is only the mechanism that satisfies it.

The rule is about *tunable* values. A service's own **protocol constants** — `NOISE_MAX_SLOPE`, the
name reserved by `UNFILTERED_PROFILE`, the octave defaults of RND-7 — are not configuration: they are
part of the contract, and a game that could change them would break the guarantees the contract
makes. They stay in the service, and its sheet says so.

**CFG-2** — *Retired.* It required the composed slices to be deeply `readonly` and frozen at runtime.
The types carry the guarantee: a slice is declared `readonly` and a service that writes to it does
not compile. What a runtime `deepFreeze` adds is protection against code that has already cheated
with a cast, bought with a recursive walk over every profile and every rule at each start. The
identifier is not reused (see `README.md`).

**CFG-3** — Validation **MUST** happen **on the merged result**, never on a single source: a partial
file is legitimate (CFG-4), so a source is not a thing that can be valid on its own.

Every problem **MUST** be reported, not the first — a designer who fixes one error per run is a
designer starting the game five times to find five typos — and each **MUST** carry **source, path and
value** (ARC-7.2). Path and value are the service's, which is the only thing that knows what a
`reduction` is; the **source** is `CFG`'s, and is the only thing it adds to what it was told.

The source named **MUST** be the sources that composed **the section**, joined — `'random.json'`,
`'base+local'` — and `'defaults'` when no source mentioned it and the value is the service's own
fallback. It is deliberately not the source of the offending *key*: knowing that would require `CFG`
to take an issue's `path` apart, and the dots and the brackets in a path are a notation the **service**
invents. A service that wrote `profiles/lockpick` would be mislabelled, silently, by a mechanism that
is supposed to know nothing about it. The precision would only pay when two files overwrite each
other on the same section — which no game here does — and the imprecision is honest: it names every
file that had a hand in the section, never the wrong one.

A single issue **MUST** stop everything: `composeConfig` either returns every slice or throws, and no
service is constructed on a configuration that did not validate (CTX-10). A world that exists in a
partially valid state is a world that fails in the third hour of play instead of at load time.

**CFG-4** — Precedence **MUST** be declared and deterministic: the fallback of the shape first, then
the sources **in the order they are given**, each overriding the previous. A partial source **MUST**
be overlayable: writing three keys of thirty **MUST NOT** turn the other twenty-seven into
`undefined`.

The overlay **MUST** be **one level deep inside a section**, and no deeper: everything below a
section's key is replaced whole, and a value that is not an object replaces whatever was there.

```ts
function overlay(base: unknown, next: unknown): unknown {
  if (isRecord(base) && isRecord(next)) {
    return { ...base, ...next };
  }
  return next;
}
```

Deep merging is refused on purpose — merging two arrays element by element assumes that `rules[0]` in
the file *is* `rules[0]` in the default, which nothing says, and it makes **removing** an entry
impossible. A whole-value replacement is coarser and always means one thing.

**CFG-5** — *Moved to [`SET`](./settings.md).* It required user settings to be kept separate from
balancing and persisted outside the save. They are now a service of their own, on the grounds that
they are mutable at runtime and `CFG` is not: see SET-1 and CFG-12. The identifier is not reused (see
`README.md`).

**CFG-6** — *Moved to [`SET`](./settings.md).* It required the `settings-changed` event. `CFG` emits
no events: it does not exist while a game is running. See SET-4. The identifier is not reused.

**CFG-7** — *Absorbed into CFG-8.* It required parameters to be grouped by area of responsibility
rather than in a flat object. With every section declared by the service that consumes it (CFG-13),
grouping is no longer something anyone could get wrong. The identifier is not reused.

**CFG-8** — Every service **MUST** receive **only its own section**, never the whole result: what
comes back is one slice per shape, in order, and there is no object holding all of them. A service
that could see the map's parameters and the AI's would be coupled to both, and its sheet would stop
being a complete statement of what influences it.

The API makes this structural rather than merely required: `composeConfig` returns a tuple, so
"handing a service everything" is not a thing anybody has an object to do with.

**CFG-9** — *Retired.* It asked for hot-reloading of the balancing in development. It is a convenience
of a specific game, not a property of the engine, and it contradicts CFG-15: a mechanism that
survives bootstrap in order to re-run itself is the container this sheet exists to avoid. A game that
wants it reloads the page. The identifier is not reused.

**CFG-10** — *Retired.* It forbade text shown to the player in the configuration. With `CFG` owning no
key, the rule has no subject here: it is ARC-12.2, and it holds for the game's content files. The
identifier is not reused.

**CFG-11** — *Superseded by CFG-16.* It asked for an automated report of unused balancing parameters.
A key belonging to no shape is refused rather than reported: inside a section by the service that
owns it (RND-24), and at the top level by CFG-16. The identifier is not reused.

**CFG-12** — `CFG` **MUST NOT** contain a parameter of its own: no key name, no default, no range, no
unit. It knows a section only through the shape it is given, and it **MUST** be usable, unchanged, by
a game whose sections it has never heard of (ARC-3.2, ARC-3.4).

The values a player can change **MUST NOT** pass through `CFG` at all. A value is either a
**construction parameter** — fixed for the run, immutable, `CFG`'s — or a **preference** — mutable at
runtime, persisted outside the save, `SET`'s. Never both: a value with two homes has two answers.

**CFG-13** — The **shape**, the **default** and the **check** of a section **MUST** be declared by the
service that consumes it, and `CFG` **MUST NOT** validate a value itself. It knows that a section did
not validate; it does not know what a `reduction` is, and must not learn.

The declaration **MUST NOT** require the service to import anything from `CFG`: the match is
structural. A generic service that had to depend on the configuration mechanism in order to say what
its parameters are would be a service that could not be lifted out (ARC-3.4, ARC-4.1), and the
check's signature says the same thing from the other side — `validate(value)` takes no source,
because a service has nothing true to say about one.

What `CFG` owns is what no single service can own, because it is a fact *between* sources: the
precedence, the overlay, which sources composed a section, the sections nobody claims, and the
decision to refuse everything at once.

**CFG-14** — `CFG` **MUST** be a **pure function** of what it is given: it **MUST NOT** read files,
storage or the network, **MUST NOT** consult the clock or the environment, and **MUST NOT** parse.
The sources arrive already read, named by the caller — the name appears in errors only because the
caller gave it (RND-24, ARC-4.1).

This is what makes it testable without a file system, identical in the browser and in the headless
suite, and unable to behave differently depending on where the game keeps its files.

**CFG-15** — `CFG` **MUST NOT** survive bootstrap: it **MUST NOT** be a field of the `GameContext`,
**MUST NOT** be injected into any service, and no service **MUST** hold a reference to the result. The
slices are passed to the constructors and the rest is dropped.

The prohibition is the whole point of the sheet. A mechanism that stays reachable becomes the place
where somebody looks up a value at runtime, and a value looked up at runtime is a global.

**CFG-16** — A key of a source that **no shape claims** **MUST** be refused, as an issue like any
other, listing the sections that were expected.

It is the one check no service can perform, because no service sees the set of sections. Without it a
misspelt section name — `randmo` for `random` — is the quietest failure the engine can have: the file
parses, nothing refuses it, the game starts with every default in place, and the designer discovers
months later that the file was never read. The cost is that a bootstrap composing only some of the
game's shapes cannot be handed a source that carries the others; the answer is to pass the sections
that this start actually composes, which the bootstrap is the one thing that knows.

## Test criteria

- A partial source over a fallback produces the expected result, with the declared precedence, and
  leaves the untouched keys at their fallback.
- A nested value — an array of rules, a map of profiles — coming from a source **replaces** the
  fallback's, and is not merged into it (CFG-4).
- An invalid value produces an issue naming **the sources that composed the section**; a section no
  source mentioned names `defaults`, and one composed from two sources names both.
- Every problem in every section is reported by one call; a section that is not an object does not
  produce one issue per key it should have had.
- One issue anywhere means nothing comes back, and — checked with a shape whose `validate` records
  its calls — no constructor runs (CTX-10).
- A source key that no shape claims is refused, and the message lists the sections expected (CFG-16).
- Two shapes declaring the same key throw, and not as a `ConfigIssue`.
- The slices come back **in the order of the shapes**, each with its own type: a test that assigns
  the second slice to the first one's type does not compile.
- **Reusability** (ARC-3.4): the whole surface exercised with the sections of a foreign domain — an
  estate growing grapes, with its own keys, defaults and checks — with no key of this game named
  anywhere in the service. As for `RND`: *if making it pass ever requires changing the service, the
  service was not generic.*
- The sources are values, not paths: the suite composes a configuration without touching a file
  system (CFG-14).

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-12.1 (no magic numbers), ARC-7.2 (validation),
  ARC-3.2 (generic services own no constant)
- [`settings.md`](./settings.md) — the mutable half: the player's preferences
- [`game-context.md`](./game-context.md) — CTX-10, what must be true before a context exists
- [`random.md`](./random.md) — RND-24, the first service to declare the shape of its own parameters

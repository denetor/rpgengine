# CFG — Parameter composition and validation

**Area:** Core · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `CFG-*`

## Purpose

Turn heterogeneous, untrusted sources into the **already validated and frozen parameters** the
services are constructed with: it applies a declared precedence, hands each shape to the service that
owns it, and refuses **in block** before a `GameContext` exists (CTX-10). It knows no key, owns no
value, and does not exist after bootstrap.

`CFG` is therefore a **verb, not a noun**. It is not the place where the game's numbers live, and no
service reads from it at runtime: it runs once, produces the slices, and becomes garbage. The service
that uses a parameter is the one that declares its shape and its default — the pattern `RND` already
follows (RND-24) — because a generic engine cannot contain this game's constants (ARC-3.2), and
because a number's meaning belongs where the number is used.

Two things it deliberately is **not**:

- **A container.** A `CFG` that survived bootstrap and answered questions would be the mutable global
  ARC-8.1 forbids, spelled in capitals. What a service gets is a constructor parameter, indistinguishable
  from a compiled-in constant.
- **The home of the player's preferences.** Volume, language, bindings and accessibility are mutable
  at runtime and persisted outside the save: a different lifetime, a different store, a different
  direction of travel. They belong to [`SET`](./settings.md), and the two sets of values are disjoint
  (CFG-12).

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
  /** Already parsed. `CFG` neither reads nor parses. */
  readonly values: Readonly<Record<string, unknown>>;
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
  validate(value: unknown, source: string): readonly ConfigIssue[];
}

/**
 * Not called `load`, because it loads nothing: it composes. The name is the
 * contract — a `loadConfig` invites somebody to give it a path.
 */
declare function composeConfig(
  shapes: readonly SectionShape<unknown>[],
  sources: readonly ConfigSource[],
): Result<Config, readonly ConfigIssue[]>;

interface Config {
  /**
   * The frozen slice of a section, keyed by the shape itself: `CFG` matches
   * sections by identity, and so never has to know a key name. Asking for a
   * shape that was not composed is a bug, and throws.
   */
  section<T>(shape: SectionShape<T>): T;
}

/** One problem, in the three terms ARC-7.2 requires, plus where it came from. */
interface ConfigIssue {
  /** The **source the offending value came from**, as the caller named it (CFG-3). */
  readonly source: string;
  /** `'random.channelCap'`, `"random.profiles['lockpick'].reduction"`. */
  readonly path: string;
  readonly value: unknown;
  readonly message: string;
}

/** One issue as a line: `random.json: random.channelCap: expected …; found 0`. */
declare function describeIssue(issue: ConfigIssue): string;
```

The whole of a game's bootstrap, for the one service that exists today:

```ts
const config = composeConfig([randomFilterShape], [
  { name: 'random.json', values: { random: await readJson('game/balance/random.json') } },
]);
if (!config.ok) throw new ConfigError(config.error);

const rng = new Random(seed, config.value.section(randomFilterShape));
```

## Requirements

**CFG-1** — No **magic number** **MUST** appear in the code. Every value that a game might want to
tune **MUST** reach the service that uses it as a **constructor parameter**, coming from data
validated at load time. This is the rule that ARC-12.1 states and that this sheet exists to make
possible; it holds for every service, and `CFG` is only the mechanism that satisfies it.

The rule is about *tunable* values. A service's own **protocol constants** — `NOISE_MAX_SLOPE`, the
name reserved by `UNFILTERED_PROFILE`, the octave defaults of RND-7 — are not configuration: they are
part of the contract, and a game that could change them would break the guarantees the contract
makes. They stay in the service, and its sheet says so.

**CFG-2** — What comes out **MUST** be **fully typed** and **`readonly`**, deeply: no service **MUST**
be able to modify at runtime what it was constructed with, and no two services **MUST** be able to
observe one another through a shared parameter object.

**CFG-3** — Validation **MUST** happen **on the merged result**, never on a single source: a partial
file is legitimate (CFG-4), so a source is not a thing that can be valid on its own.

Every problem **MUST** be reported, not the first — a designer who fixes one error per run is a
designer starting the game five times to find five typos — and each **MUST** carry **source, path and
value** (ARC-7.2). The source named **MUST** be the one the offending value **actually came from**,
which is the one thing a service validating its own slice cannot know: a value that arrived from the
game's file and one that arrived from a default are the same value, and only `CFG` saw them arrive.

A single issue **MUST** stop everything: `composeConfig` returns either every slice or none of them,
and no service is constructed on a configuration that did not validate (CTX-10). A world that exists
in a partially valid state is a world that fails in the third hour of play instead of at load time.

**CFG-4** — Precedence **MUST** be declared and deterministic: the fallback of the shape first, then
the sources **in the order they are given**, each overriding the previous. A partial source **MUST**
be overlayable: writing three keys of thirty **MUST NOT** turn the other twenty-seven into
`undefined`.

The overlay **MUST** be **one level deep inside a section**, and no deeper: everything below a
section's key is replaced whole. Deep merging is refused on purpose — merging two arrays element by
element assumes that `rules[0]` in the file *is* `rules[0]` in the default, which nothing says, and it
makes **removing** an entry impossible. A whole-value replacement is coarser and always means one
thing.

**CFG-5** — *Moved to [`SET`](./settings.md).* It required user settings to be kept separate from
balancing and persisted outside the save. They are now a service of their own, on the grounds that
they are mutable at runtime and `CFG` is not: see SET-1 and CFG-12. The identifier is not reused (see
`README.md`).

**CFG-6** — *Moved to [`SET`](./settings.md).* It required the `settings-changed` event. `CFG` emits
no events: it does not exist while a game is running. See SET-4. The identifier is not reused.

**CFG-7** — *Absorbed into CFG-8.* It required parameters to be grouped by area of responsibility
rather than in a flat object. With every section declared by the service that consumes it (CFG-13),
grouping is no longer something anyone could get wrong. The identifier is not reused.

**CFG-8** — Every service **MUST** receive **only its own section**, never the whole result: `CFG` is
handed the shapes, and `section(shape)` returns one slice. A service that could see the map's
parameters and the AI's would be coupled to both, and its sheet would stop being a complete statement
of what influences it.

**CFG-9** — *Retired.* It asked for hot-reloading of the balancing in development. It is a convenience
of a specific game, not a property of the engine, and it contradicts CFG-15: a mechanism that
survives bootstrap in order to re-run itself is the container this sheet exists to avoid. A game that
wants it reloads the page. The identifier is not reused.

**CFG-10** — *Retired.* It forbade text shown to the player in the configuration. With `CFG` owning no
key, the rule has no subject here: it is ARC-12.2, and it holds for the game's content files. The
identifier is not reused.

**CFG-11** — *Retired.* It asked for an automated report of unused balancing parameters. Dead
configuration cannot accumulate in a mechanism that holds none: a key belonging to no shape is
already refused as unknown by the service that owns the section (RND-24). The identifier is not
reused.

**CFG-12** — `CFG` **MUST NOT** contain a parameter of its own: no key name, no default, no range, no
unit. It knows a section only through the shape it is given, and it **MUST** be usable, unchanged, by
a game whose sections it has never heard of (ARC-3.2, ARC-3.4).

The values a player can change **MUST NOT** pass through `CFG` at all. A value is either a
**construction parameter** — fixed for the run, immutable, `CFG`'s — or a **preference** — mutable at
runtime, persisted outside the save, `SET`'s. Never both: a value with two homes has two answers.

**CFG-13** — The **shape**, the **default** and the **check** of a section **MUST** be declared by the
service that consumes it, and `CFG` **MUST NOT** validate a value itself. It knows that a section did
not validate; it does not know what a `reduction` is, and must not learn.

What `CFG` owns is what no single service can own, because it is a fact *between* sources: the
precedence, the overlay, the provenance of a value, and the decision to refuse everything at once.

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

## Test criteria

- A partial source over a fallback produces the expected result, with the declared precedence, and
  leaves the untouched keys at their fallback.
- A nested value — an array of rules, a map of profiles — coming from a source **replaces** the
  fallback's, and is not merged into it (CFG-4).
- An invalid value produces an issue naming **the source it actually came from**, not the last source
  read: the test overrides a valid default with an invalid file, and with a valid file over an invalid
  default, and expects a different `source` each way. A test using a single source cannot see this.
- Every problem in every section is reported by one call; a section that is not an object does not
  produce one issue per key it should have had.
- One issue anywhere means no slice comes back, and — checked with a shape whose `validate` records
  its calls — no constructor runs (CTX-10).
- Asking for a shape that was not composed throws, rather than returning `undefined`.
- A returned slice cannot be mutated: the attempt does not compile, and does not succeed at runtime
  either.
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
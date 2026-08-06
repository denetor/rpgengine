# Spec — `CFG`, parameter composition and validation

**Service:** `CFG` · **Priority:** 1 · **Sheet:** [`services/config.md`](../services/config.md)
**Requirements:** ARC-12.1, ARC-7.2, ARC-3.2, ARC-3.4, CTX-10 · **Step:** 2 of the plan in
[`REQUIREMENTS.md`](../REQUIREMENTS.md)

## Problem Statement

The engine has one service so far, and it already has parameters: `RND` reads a channel cap, a set of
filter profiles and a list of rules that a designer is meant to edit without recompiling. It knows
exactly what a valid one looks like — `random/config.ts` is four hundred lines of checks that report
file, path and value — and it can refuse a bad one in its own constructor.

What nothing does is get the value *to* it. There is no mechanism that reads a game's parameters,
decides what wins when two places say different things, checks the result and hands each service its
own share before anything is built. Today the gap is invisible because `bootstrap()` returns an empty
context and constructs nothing. The moment step 3 fills that context, three things happen at once,
and each of them is expensive to undo:

1. **Every service invents its own loading.** One takes a path in its constructor, one takes a parsed
   object, one reads a global. ARC-4.1 says a service reads no files; without a shared mechanism that
   rule is kept by discipline, and discipline is what ARC-14 exists because nobody has.
2. **A `Config` object appears, and never leaves.** It is the obvious thing to build: one object with
   everything in it, passed to the context so services can ask it questions. It is also a mutable
   global with a respectable name — exactly what the previous version of this project's `config.md`
   described, and what `settings.md` cites as the reason `SET` had to be split out. Once services
   hold a reference to it, removing it means touching all of them.
3. **A designer's typo goes unpunished.** A misspelt section (`randmo` for `random`), a reduction of
   `1.5`, a cap of `0`: without a load-time refusal the game starts, plays, and behaves oddly in the
   third hour, at a moment nobody connects to the file they edited. ARC-7.2 asks for the opposite,
   and RND-24 already implements its half of it — but only for a value somebody thought to check.

The designer's problem and the developer's are the same problem seen from two ends: there is nowhere
for a number to live between the file it is written in and the constructor that uses it, and anything
built to fill that space tends to stay there.

## Solution

A single pure function, `composeConfig`, that runs once during bootstrap and disappears.

It is given the **sections** — one object per service, carrying the key it is written under, what it
is when nobody mentions it, and the service's own check — and the **sources**, already read and
parsed by whoever has a file system. It applies a declared precedence, overlays partial sources one
level deep, runs each service's check on the merged result, and either returns every slice or throws
with **every** problem it found, each naming the sources it came from.

What comes back is a **tuple**: the slice of the first shape, then the second, in the order they were
given. There is no object holding all of them, so there is nothing to keep, nothing to inject, and
nowhere to look a value up at runtime. The caller destructures it, passes each slice to a
constructor, and lets the rest be collected.

```ts
const [filter] = composeConfig([FILTER_SECTION], [
  { name: 'random.json', values: { random: await readJson('game/balance/random.json') } },
]);

const rng = new Random(seed, filter);
```

The whole implementation is around sixty lines: a loop over the shapes, a loop over the sources, and
a three-line overlay. That size is a design goal and not an estimate — every ambition beyond it
(a registry, a lookup, a merge that descends, a provenance that follows a value down a path) buys
precision this engine does not need with machinery that outlives the moment it was written for.

## User Stories

### The designer tuning the game

1. As a designer, I want a wrong value in a balancing file to stop the game at load time, so that I
   find out from a message instead of from odd behaviour hours into play.
2. As a designer, I want the error to name the **file** the value came from, so that I do not have to
   guess which of my files is at fault.
3. As a designer, I want the error to name the **path** inside that file, so that I can go to the
   line rather than read the whole section.
4. As a designer, I want the error to show me **the value it found**, so that I can see the typo
   without opening the file.
5. As a designer, I want **every** problem reported by one run, so that I do not start the game five
   times to find five typos.
6. As a designer, I want a misspelt section name to be refused, so that a file I edited cannot be
   silently ignored in its entirety.
7. As a designer, I want to write only the keys I am changing, so that tuning one number does not
   mean restating the twenty-nine I am not touching.
8. As a designer, I want a value I write to replace the default **whole** when it is a list or a set
   of profiles, so that I can remove an entry and not only add one.
9. As a designer, I want a game that fails to compose its parameters to build **nothing**, so that I
   am never looking at a world that is half-configured.

### The developer of a service

10. As a service developer, I want to declare my parameters' key, default and check in my own
    service, so that the meaning of a number lives where the number is used.
11. As a service developer, I want to declare them **without importing the configuration mechanism**,
    so that my service can be lifted into another project that composes its parameters some other
    way.
12. As a service developer, I want my check to report problems without being told where the value
    came from, so that I am not asked for a fact I cannot know.
13. As a service developer, I want to receive **only my own section**, so that my sheet remains a
    complete statement of what influences my service.
14. As a service developer, I want the slice I receive to be typed as my own parameters, so that the
    compiler catches a wiring mistake instead of the game catching it.
15. As a service developer, I want my constructor to keep its own refusal, so that a service is never
    built on parameters it cannot use even when somebody bypasses the composition.
16. As a service developer, I want no configuration mechanism reachable from my code at runtime, so
    that I cannot be tempted to look a value up instead of being given it.

### The author of the game's bootstrap

17. As the bootstrap author, I want one call that composes everything, so that adding a service means
    adding a shape and a destructured name, not a loading procedure.
18. As the bootstrap author, I want the happy path to contain no `if`, so that the code reads as what
    it does and not as what it guards against.
19. As the bootstrap author, I want to decide **what** the sources are and **what they are called**,
    so that the engine never assumes where this game keeps its files.
20. As the bootstrap author, I want precedence to be the order I pass the sources in, so that I do
    not have to learn a resolution rule to predict the result.
21. As the bootstrap author, I want a failure to arrive as one exception carrying every issue, so
    that I can print them all or render them my own way.
22. As the bootstrap author, I want the composed parameters to be impossible to put in the
    `GameContext`, so that CTX-2 cannot decay into a service locator.
23. As the bootstrap author, I want two shapes claiming the same key to fail immediately and loudly,
    so that a copy-paste in my own code is not mistaken for a problem with the game's data.

### The developer reusing the engine

24. As a developer of another game, I want the mechanism to contain no key, default or range of this
    game, so that I can use it unchanged for a domain it has never heard of.
25. As a developer of another game, I want it to read no file and consult no clock or environment, so
    that it behaves identically in a browser, in Node and in a test.
26. As a developer of another game, I want to pass parsed values rather than paths, so that I can
    keep my parameters in a bundle, a database or a string literal.

### The developer maintaining the engine

27. As a maintainer, I want the composition to be a pure function of its arguments, so that a test
    needs no file system, no mocks and no set-up.
28. As a maintainer, I want a test proving no constructor runs when any section is invalid, so that
    CTX-10 is a checked fact and not a comment.
29. As a maintainer, I want a reusability test written in a foreign domain, so that a future edit
    that smuggles this game's vocabulary into the service is caught the day it lands.
30. As a maintainer, I want the tuple's ordering and typing checked by the compiler, so that
    reordering two shapes cannot silently hand a service somebody else's parameters.

## Implementation Decisions

### Modules

- **New service: `engine/core/config/`.** A service in the sense the boundary rules mean — a
  directory two levels below `engine/`, entered only through its `index.ts` (ARC-2.1, ARC-14.2 rule
  2). It depends on nothing, and nothing in `engine/` depends on it.
- **`engine/core/random/`** gains two exports and makes one private function public. No behaviour of
  the service changes; `filter.ts`, `random.ts` and the rest are untouched.
- **`game/bootstrap.ts`** is *not* modified by this work — see Out of Scope.

### Public contract

The surface, as the sheet states it. The two type-level details below were established by compiling
the contract before writing it down, not by reasoning about it:

```ts
interface ConfigSource {
  readonly name: string;
  readonly values: Readonly<Record<string, unknown>>;
}

interface Problem {
  readonly path: string;
  readonly value: unknown;
  readonly message: string;
}

interface SectionShape<T> {
  readonly key: string;
  readonly fallback: T;
  validate(value: unknown): readonly Problem[];
}

interface ConfigIssue extends Problem {
  readonly source: string;
}

type Composed<S> = { [K in keyof S]: S[K] extends SectionShape<infer T> ? T : never };

declare function composeConfig<const S extends readonly SectionShape<unknown>[]>(
  shapes: S,
  sources: readonly ConfigSource[],
): Composed<S>;

declare class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];
}

declare function describeIssue(issue: ConfigIssue): string;
```

- **`const S` is not decoration.** With a plain type parameter the array literal is inferred as an
  *array of the union* of the shapes, and every destructured slice comes back typed as every
  service's parameters at once — which defeats CFG-8 at the only level where it can be checked. The
  variadic-tuple constraint (`readonly [...SectionShape<unknown>[]]`) does **not** fix it; the `const`
  type parameter does. This was verified by typechecking both variants.
- **`const S` holds for a literal at the call site, and not for a list with a name.** A caller that
  keeps its sections in a `const` of its own — a bootstrap composing a dozen of them will — widens it
  to an array of the union before `composeConfig` is reached, and has to write `as const` on that
  list. The reusability proof, the first caller to name its list, is where this turned up.
- **`T` is inferred from `fallback`, not from `validate`.** A shape written with a bare
  `fallback: undefined` types its slice `undefined`, not "the service's parameters or nothing". A
  service whose absent configuration is legitimate must therefore declare the fallback's type
  explicitly. It must declare it **on the section**: a `const NO_FILTER: FilterConfig | undefined =
  undefined` is narrowed back to `undefined` wherever it is read, so the constant that was supposed
  to carry the type does not. That is what `RND` does, and what the estate does with its tasting.

### The composition, in order

1. Build the set of claimed keys from the shapes. **Two shapes with the same key throw immediately**,
   before anything is read: that is a bug in the caller's code, not a fact about the game's data, and
   it has no source, path or value to be reported as an issue with.
2. For every source, every top-level key that no shape claims produces an issue naming the sections
   expected (CFG-16). This is the one check no service can perform, because no service sees the set of
   sections.
3. For every shape, in order: start from the fallback, then for each source that mentions the key,
   overlay its value and record the source's name among the section's contributors.
4. Run the shape's `validate` on the merged value and stamp each returned `Problem` with the section's
   contributors, joined — `'random.json'`, `'base+local'`, or `'defaults'` when no source mentioned
   the section.
5. If there is any issue at all, throw `ConfigError` with all of them. Otherwise return the values as
   a tuple.

The overlay is one level deep and nothing more:

```ts
function overlay(base: unknown, next: unknown): unknown {
  if (isRecord(base) && isRecord(next)) {
    return { ...base, ...next };
  }
  return next;
}
```

### Decisions taken deliberately against the obvious alternative

- **No `Config` object and no `section()` lookup.** The tuple removes an interface, an identity-keyed
  map, a failure mode ("asking for a shape that was not composed") and the temptation to keep the
  result. CFG-8 stops being a rule anybody could break and becomes the shape of the return value.
- **No `Result` type.** None exists in this project; introducing one would put an unwrap at every call
  site for a failure whose only sensible handling is to stop. The precedent is `FilterConfigError`,
  which already carries `issues` and a message with one line per problem.
- **Provenance is per section, not per key.** Knowing which *key* a bad value came from would require
  `CFG` to take an issue's `path` apart, and the dots and brackets in a path are a notation the
  **service** invents. The precision would only pay when two files overwrite each other on the same
  section, which no game here does; the imprecision names every file that had a hand in the section
  and never names the wrong one.
- **`validate` takes no source.** A service has nothing true to say about where a value came from, so
  it is not asked. `CFG` stamps the one fact it owns.
- **No runtime freezing.** The slices are `readonly` by type and a service that writes to one does not
  compile. A recursive `deepFreeze` would add protection only against code that has already cheated
  with a cast, paid for with a walk over every profile and rule at each start. CFG-2 is retired.
- **No schema library.** Same reasoning RND-24 records: the contract says `CFG` depends on nothing,
  and ARC-3.4 wants it liftable as it stands.

### Changes to `RND`

- `problemsWith` becomes public as **`filterConfigProblems(value): readonly FilterConfigProblem[]`** —
  the same check that already exists, without a source.
- **`FILTER_SECTION`** is declared and exported: `key: 'random'`, a typed `FilterConfig | undefined`
  fallback, and `filterConfigProblems` as its check. It imports nothing from `engine/core/config`;
  the match with `SectionShape` is structural, which is also what keeps boundary rule 3
  (no service imports another service) satisfied without an exception.
- `FilterConfigIssue` is restated as `FilterConfigProblem` plus a `file`, so that the two checks share
  one definition of what a problem is.
- `validateFilterConfig` and `assertFilterConfig` keep their `file` parameter unchanged: they serve
  the constructor, which refuses rather than reports, and whose caller may well know what to call the
  value it was handed.
- Both new names are exported from `random/index.ts`, the service's one door.

## Testing Decisions

### What makes a good test here

`CFG` is a pure function of two arguments, which makes the external behaviour easy to state and the
implementation easy to leak into a test by accident. A test here:

- Enters through **`engine/core/config/index.ts`** and nothing else. `overlay`, the contributor
  bookkeeping and the shape of the internal loops are implementation, and no test names them.
- Says what it gives and what it expects back: shapes and sources in, slices or a thrown `ConfigError`
  out. Where an error is expected, it asserts on the **issues** — source, path, value, message — and
  not on the assembled string, except in the one test that covers `describeIssue` itself.
- Uses shapes invented for the test, with checks of two or three lines. A test that imported
  `FILTER_SECTION` to exercise `CFG` would be testing two services at once and would fail for
  reasons belonging to neither.
- Never asserts that a valid configuration produces "no error" alone: it asserts on the composed
  value, because a mechanism that returns the wrong slice silently is the failure that matters.

### The seam

**One new seam: `src/engine/core/config/index.ts`.** Every test of the composition enters there, in
`*.spec.ts` files sitting beside the code, as `random/` already does. The seam of
`src/engine/core/random/index.ts` already exists and is not moved; the two new exports are tested
through it.

No test reaches into `compose.ts` or any other internal module, and no new seam is opened in
`game/` or in `tests-headless/`.

**One test does live in `tests-headless/`, and had to.** The circle-closing one — a section composed
by `CFG` and handed to a real `Random` — names both services, and boundary rule 3 refuses a spec
inside either one importing the other's door (ARC-4.1); this was verified by writing the import and
watching `npm run boundaries` fail. `tests-headless/composed-parameters.spec.ts` enters through the
two existing public doors and opens no seam of its own. The refusal is right: the fit between the two
is not a fact about either service, it is the fact a bootstrap depends on, and `game/bootstrap.ts`
constructs nothing yet. Everything that is about `RND` alone — the section's contents, the structural
match, the equivalence of its two checks — stays in `random/config.spec.ts`, as below.

### What gets tested

Under `engine/core/config/`:

- **Composition and precedence** — fallback alone; a source replacing it; two sources in order; a
  partial source leaving untouched keys at their fallback; a nested value (a list, a map) replaced
  whole rather than merged; a non-object replacing an object.
- **Refusal** — every problem of every section in one throw; a section that is not an object yielding
  one issue and not one per key it should have had; nothing returned when anything is invalid; and,
  with a shape whose `validate` records its calls, the proof that no constructor runs (CTX-10).
- **Provenance** — an issue naming the single source that carried the section; `'defaults'` when no
  source mentioned it; both names when two sources composed it.
- **Unknown sections** — a source key no shape claims is refused, with the expected sections listed
  (CFG-16).
- **Caller bugs** — two shapes with the same key throw, and not as a `ConfigIssue`.
- **Messages** — `describeIssue` renders source, path, expectation and value on one line.
- **Types** — a type-level spec: the destructured slices are typed one by one and in order; assigning
  one service's slice to another's type does not compile; a bare `undefined` fallback types the slice
  `undefined`. Written with `@ts-expect-error`, which `npm run typecheck` already covers.
- **Reusability** (ARC-3.4) — the whole surface exercised with the sections of an estate growing
  grapes: its own keys, defaults and checks, and no key of this game named anywhere. The criterion is
  the one `RND` states: *if making it pass ever requires changing the service, the service was not
  generic.*
- **Purity** (CFG-14) — the suite composes configurations without touching a file system, which is a
  property of how the tests are written as much as of the service.

Under `engine/core/random/`, added to the existing parameter tests: `FILTER_SECTION` carries the key,
the typed fallback and the check; `filterConfigProblems` reports the same problems as
`validateFilterConfig` minus the source; and the section fits a shape written out in the spec file
itself, which is what "matched structurally" means. Under `tests-headless/`, for the reason given
above: a configuration composed through `CFG` and handed to `new Random(...)` is accepted by the
constructor, and one that does not validate stops the program before a `Random` exists.

### Prior art

- `src/engine/core/random/config.spec.ts` — entering through a validation surface rather than a
  constructed service, and asserting on file, path and value rather than on prose.
- `src/engine/core/random/reusability.spec.ts` — the vineyard: the shape and the register the
  reusability proof should be written in, including its deliberate refusal to share this game's test
  scaffolding.
- `src/engine/core/random/filter.spec.ts` — a service tested only through its public door.
- `tests-headless/boundaries.spec.ts` — the precedent for a test whose subject is a rule rather than a
  behaviour, if the type-level spec needs a home other than the service's directory.

## Out of Scope

- **Wiring the bootstrap.** `game/bootstrap.ts` returns an empty context and constructs no `Random`.
  Reading `game/balance/random.json`, composing it and putting an `rng` in the context belongs to the
  `GameContext` work of step 3, which is where a field to hold it first exists. This spec delivers
  the mechanism and the section declaration; nothing in `game/` changes.
- **`BUS`**, the other service of step 2, and the `bus` testbed scene.
- **`SET`** and anything a player can change: a different lifetime, a different store, and a service
  of its own.
- **Content loading.** `CFG` composes parameters, not the files that describe things that exist.
- **Hot reloading** of balancing in development (CFG-9, retired).
- **Deep merging**, per-key provenance, runtime freezing and a schema library — all decided against
  above, and recorded in the sheet so that a future reader does not re-propose them as oversights.
- **`docs/specs/rnd-random-service.md`**, which cites CFG-13 in passing and remains accurate.
- **`CONTEXT.md`**, whose *Configuration* entry already describes this design and needs no change.

## Further Notes

- The **sheet is normative**, this spec is not: where the two disagree,
  [`services/config.md`](../services/config.md) wins, and the requirement identifiers (CFG-1 …
  CFG-16) are the stable references. CFG-2 and CFG-11 are tombstones — retired here, and their
  identifiers are not reused.
- The design was settled in a grilling session over the previous version of the sheet, whose starting
  point was a `Config` container with `section()`, a `Result`, a deep freeze and per-key provenance.
  Each of those was removed for a reason recorded in the sheet rather than here.
- **No ADR is proposed.** The decisions above are cheap to reverse, and each is already explained
  where a reader meets it.
- The type-level findings (`const S`, the typed fallback) came from compiling a rehearsal of the
  contract in the project's own TypeScript 5.9 before it was written down. They are the two things in
  this spec most likely to be "simplified" by an implementer who has not tried them.

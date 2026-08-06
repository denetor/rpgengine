# 01 — The composition: shapes and sources in, typed slices or a refusal out

**What to build:** the `CFG` service, whole, for the path a game actually walks. It is handed the
**sections** — one object per service carrying the key it is written under, what it is when nobody
mentions it, and the service's own check — and the **sources**, already read and parsed by whoever
has a file system. It applies the declared precedence, overlays a partial source one level deep, runs
each service's check **on the merged result**, and then either returns every slice or throws with
every problem it found.

What comes back is a **tuple**, one slice per shape, in the order the shapes were given: there is no
object holding all of them, nothing to keep, and nowhere to look a value up at runtime (CFG-8,
CFG-15). What is thrown is one `ConfigError` carrying every issue, each naming the sources that
composed its section, so that a designer fixes five typos in one run instead of five (CFG-3).

Validation is not a later ticket. Composing without refusing would deliver the dangerous half of the
service: a value that reached a constructor unchecked is the failure this sheet exists to prevent
(CTX-10).

Two type-level details are load-bearing and were established by compiling the contract before it was
written down — they are the parts most likely to be "simplified" by somebody who has not tried them,
which is why the type spec lands in this ticket and not a later one:

```ts
type Composed<S> = { [K in keyof S]: S[K] extends SectionShape<infer T> ? T : never };

//                  ↓ without `const`, the literal infers as an *array of the union* of the shapes,
//                    and every slice comes back typed as every service's parameters at once.
//                    `readonly [...SectionShape<unknown>[]]` does NOT fix it; this does.
declare function composeConfig<const S extends readonly SectionShape<unknown>[]>(
  shapes: S,
  sources: readonly ConfigSource[],
): Composed<S>;
```

`T` is inferred from `fallback` and not from `validate`, so a shape written with a bare
`fallback: undefined` types its slice `undefined` rather than "the service's parameters or nothing".

The sheet is [`docs/services/config.md`](../../../docs/services/config.md) and it is normative; the
spec is [`docs/specs/cfg-parameter-composition.md`](../../../docs/specs/cfg-parameter-composition.md).

**Blocked by:** None — can start immediately.

**Status:** done

- [x] A section with no source mentioning it composes to the shape's fallback
- [x] Sources apply **in the order given**, each overriding the previous
- [x] A partial source leaves the keys it does not mention at their previous value
- [x] Below a section's key a value is replaced **whole**: a list of rules or a map of profiles from a
      source does not merge into the one it replaces
- [x] A value that is not an object replaces whatever was there
- [x] Each section's check runs on the **merged result**, never on a single source
- [x] Every problem of every section is reported by one call; a section that is not an object does not
      produce one issue per key it should have had
- [x] Each issue carries **source, path, value and message**; the source is the names of the sources
      that composed the section, joined, and `defaults` when none mentioned it
- [x] One issue anywhere means nothing is returned: `ConfigError` carries all of them, and a shape
      whose check records its calls proves every section was still validated
- [x] `describeIssue` renders one issue as one line, with the source, the path, what was expected and
      what was found
- [x] The destructured slices are typed **one by one and in order**: a type-level spec compiles, and
      assigning one service's slice to another's type is rejected
- [x] The type-level spec also records that a bare `undefined` fallback types its slice `undefined`
- [x] The service reads nothing, parses nothing and consults neither clock nor environment: the whole
      suite composes configurations without touching a file system (CFG-14)
- [x] Every test enters through the service's public door; no test names an internal module
- [x] The unit lane is green: lint, typecheck, boundaries and the headless suite

## Closing notes

- **The service is four files and one door.** `types.ts` (the vocabulary the caller speaks),
  `compose.ts` (the loop over the shapes, the loop over the sources, the three-line overlay),
  `errors.ts` (`ConfigError` and `describeIssue`) and `index.ts`. The composition itself is 60 lines
  of code under 70 lines of comment, which is the size the sheet asks for.

- **The `const` type parameter was verified rather than believed.** Removing it from
  `composeConfig` and running `npm run typecheck` produces two errors in `types.spec.ts` —
  `Type 'OvenParameters | DeliveryParameters' is not assignable to type 'OvenParameters'`, once per
  slice. The tuple is what CFG-8 is checked by, and the type-level spec is what would notice it
  going away. The `@ts-expect-error` lines are load-bearing in the same way: `tsc` fails on an
  unused one, so a directive that stopped catching anything fails the build rather than passing
  quietly.

- **The provenance is stamped last, and that turned out to matter.** The first version wrote
  `{ source, ...problem }`, copying the idiom of `random/config.ts`. There the problem type cannot
  carry a file; here a shape is matched **structurally**, so a service whose own problems already
  carry a source — the shape `RND`'s `FilterConfigIssue` has — would have silently replaced the one
  fact `CFG` owns. It is now `{ ...problem, source }`, with a test that hands the composition a
  check naming a file it invented and asserts the source is still the one the composition saw. The
  test was confirmed red against the old order.

- **A section written as `undefined` is a value, not a silence.** `mentions` asks
  `Object.hasOwn`, so a source that writes `delivery: undefined` overlays `undefined` over the
  fallback and lets the section's own check have an opinion about it, where a source that says
  nothing leaves the fallback alone. The distinction is what makes a partial source legitimate, and
  it is now pinned by a test rather than only by a comment.

- **`describeValue` is a deliberate copy of `RND`'s.** Its length cap, its `NaN` handling and its
  `try`/`catch` are the same thirty lines that already sit in `random/config.ts`. No service may
  import another (ARC-4.1), so the shared module that would remove the copy is exactly the
  dependency `CFG` exists without; the copy is recorded at the head of `errors.ts` so that a later
  reader does not read it as an oversight. `VALUE_LIMIT = 80` is a limit on how much of a message is
  printed, not a parameter of anybody's game, so CFG-12 has no subject in it.

- **What is deliberately still missing.** CFG-16 (a source key no shape claims) and the throw for
  two shapes claiming one key belong to ticket 02; the estate that proves the service generic
  belongs to ticket 04. A review pass flagged all three as unmet requirements of the sheet, which
  they are — they are simply not this ticket's.

- **The suite touches no file system.** The sources are object literals written in the spec files,
  and nothing under `engine/core/config/` imports `node:fs` or anything else (CFG-14). The unit lane
  — lint, typecheck, boundaries, 304 tests — is green.

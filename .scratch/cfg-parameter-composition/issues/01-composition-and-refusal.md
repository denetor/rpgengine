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

**Status:** ready-for-agent

- [ ] A section with no source mentioning it composes to the shape's fallback
- [ ] Sources apply **in the order given**, each overriding the previous
- [ ] A partial source leaves the keys it does not mention at their previous value
- [ ] Below a section's key a value is replaced **whole**: a list of rules or a map of profiles from a
      source does not merge into the one it replaces
- [ ] A value that is not an object replaces whatever was there
- [ ] Each section's check runs on the **merged result**, never on a single source
- [ ] Every problem of every section is reported by one call; a section that is not an object does not
      produce one issue per key it should have had
- [ ] Each issue carries **source, path, value and message**; the source is the names of the sources
      that composed the section, joined, and `defaults` when none mentioned it
- [ ] One issue anywhere means nothing is returned: `ConfigError` carries all of them, and a shape
      whose check records its calls proves every section was still validated
- [ ] `describeIssue` renders one issue as one line, with the source, the path, what was expected and
      what was found
- [ ] The destructured slices are typed **one by one and in order**: a type-level spec compiles, and
      assigning one service's slice to another's type is rejected
- [ ] The type-level spec also records that a bare `undefined` fallback types its slice `undefined`
- [ ] The service reads nothing, parses nothing and consults neither clock nor environment: the whole
      suite composes configurations without touching a file system (CFG-14)
- [ ] Every test enters through the service's public door; no test names an internal module
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

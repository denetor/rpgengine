# 02 — The sections nobody claims, and the keys claimed twice

**What to build:** the two checks that are about the **set** of sections rather than about any one
value, and that therefore belong to `CFG` and to nothing else — no service sees the other sections,
so no service can perform either.

The first is the designer's (CFG-16). A source key that **no shape claims** is refused, as an issue
like any other, listing the sections that were expected. Without it a misspelt section name —
`randmo` for `random` — is the quietest failure the engine can have: the file parses, nothing refuses
it, the game starts with every default in place, and the file is discovered to have never been read
months later. Ticket 01 already refuses a bad value inside a section; this refuses a section nobody
is listening to.

The second is the programmer's. **Two shapes declaring the same key** throw immediately, before any
source is read, and **not** as a `ConfigIssue`: it is a bug in the caller's code rather than a fact
about the game's data, and it has no source, no path and no value to be reported as an issue with.
Reported as an issue it would send somebody looking through a file that is perfectly fine.

The cost of the first check is stated in the sheet and accepted: a bootstrap composing only some of
the game's shapes cannot be handed a source that carries the others, and must pass the sections this
start actually composes — which the bootstrap is the one thing that knows.

**Blocked by:** 01 — the composition and its refusal.

**Status:** done

- [x] A source key that no shape claims produces an issue naming the source it appeared in
- [x] That issue's message lists the sections that were expected
- [x] It is refused **together with** everything else: one throw, not a separate early exit, so a
      typo'd section and a bad value in a good section are reported by the same run
- [x] Several unclaimed keys, across several sources, are all reported
- [x] A source that mentions no section at all is not an error
- [x] Two shapes declaring the same key throw, and what is thrown is **not** a `ConfigError` full of
      issues
- [x] That throw happens before any source is inspected, and its message names the key claimed twice
- [x] Every test enters through the service's public door
- [x] The unit lane is green: lint, typecheck, boundaries and the headless suite

## Closing notes

- **The two checks are three lines apart and could not be further.** `assertOneShapePerKey` throws a
  plain `Error` before anything is read; `unclaimedIssues` produces `ConfigIssue`s that join the
  section ones in a single `ConfigError`. The difference in what is thrown is the difference between
  "your bootstrap is wrong" and "the file you edited is wrong", and it is the whole of what this
  ticket adds.

- **"Before any source is inspected" is tested rather than asserted.** The source handed to the
  composition carries its section behind a getter that records being read. With the duplicate check
  where it is, the getter never runs; moved after the section composition, the test goes red — which
  was confirmed by moving it. It is the only way this particular ordering can be observed from
  outside the door, and it does not name an internal module to do it.

- **The unclaimed keys come first among the issues.** Not arbitrary: they are the reason the rest of
  a run may look untouched, so a designer reading `randmo is not a section` immediately understands
  why every value below it stayed at its default. The order is asserted by a test and the reason is
  now written on `composeConfig`.

- **The message follows `RND`'s precedent word for word.** `unknownKeyProblems` in
  `random/config.ts` already answers "this key is not a parameter of X (expected a, b)"; a section
  that is not a section reads the same way, so a designer meets one sentence rather than two
  dialects. The expected sections are listed in the order the shapes were given, which is the
  caller's own order and therefore stable between runs.

- **Considered and declined: a message for the case of no shapes at all.** `composeConfig([], …)`
  renders `(expected )` with nothing after it. A branch would make that read better, but a bootstrap
  that composes zero shapes has nothing to compose, and the sheet asks for sixty lines rather than
  for a mechanism that covers every way of calling it wrongly. Recorded here so that the next reader
  meets a decision rather than an oversight.

- **`Object.keys` for the unclaimed check, `Object.hasOwn` for the overlay.** They answer different
  questions — "what did this source write" and "did this source write *this*" — and the difference
  only shows for a non-enumerable own key, which no parsed source has. Left as it is, deliberately.

- The unit lane — lint, typecheck, boundaries, 311 tests — is green.

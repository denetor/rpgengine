# 10 — Parameter shape and validation

**What to build:** filter profiles are data that a game designer edits without recompiling. A
profile that names something that does not exist, a reduction out of range or a negative cap must
make **loading** fail, with an error that states file, path and value — not produce strange
behaviour halfway through a game, when nobody will connect the effect to the cause any more.

The service reads no files and knows nothing about this game's content paths: it receives
**already-validated** parameters in the constructor. What it exposes is the **expected shape**, so
that the game's loader can apply it before the game context is constructed.

**Blocked by:** 06 — Per-channel filtered randomness.

**Status:** done

- [x] The service exposes the expected shape of its own parameters, usable by whoever loads them
- [x] Invalid parameters are rejected with an error that indicates file, path and value
- [x] Validation happens **before** the service is constructed: a service constructed with invalid
      parameters does not exist
- [x] The service still reads no files
- [x] The absence of configuration is a **valid** case, not an error
- [x] A profile referenced by a rule but not defined is a validation error
- [x] A default profile that is declared but does not exist is a validation error
- [x] Each error case has its own test, with the message verified

## Closing notes

- One new file, `config.ts` (pure), and one new spec, `config.spec.ts`. The surface is
  `validateFilterConfig(value, file?)` → a list of issues, `assertFilterConfig(value, file?)` → the
  same check as an exception, `describeIssue(issue)` → one line of text, and `FilterConfigError`,
  which carries every issue. All four are exported from `index.ts`: the loader is the intended
  caller, and ARC-2.1 gives a service one door.
- **No schema validation library was added, against what the spec sheet twice said was needed.**
  ARC-7.2 says "against a schema (e.g. Zod)" and the example is not the requirement. The contract
  table's first row says `RND` depends on nothing, and ARC-3.4 wants it liftable into another
  project as it stands; a first runtime dependency for a shape of four fields is not worth that,
  and Zod's issues would have needed wrapping anyway — it has no notion of the file a value came
  from, which is a third of what ARC-7.2 asks for. Written up in the sheet and in the spec, since
  the spec had assumed the opposite.
- **The file name is the caller's, never the service's.** `validateFilterConfig` takes it and does
  nothing else with it. With none given the errors say `filter configuration:`, not `random.json:` —
  this game keeps it there, a reusing game keeps it wherever it likes, and a guess would send
  somebody looking for a file that does not exist. Pinned by a test.
- **Every problem at once, but no cascades.** A designer fixing a file one error per run is a
  designer running the game five times to find five typos. The exception is deliberate: a `profiles`
  that is not a set of profiles — or an empty one — makes every profile name unresolvable, and the
  cross-reference checks are skipped rather than repeating the same news at `default` and at every
  rule. `profiles: {}` is refused where it stands, at `profiles`, and says what is actually wrong.
- **The file name is stamped on once, at the end.** The checks answer with a `Problem` — path, value,
  message — and `validateFilterConfig` adds the file to each. It began as a `file` parameter threaded
  through nine helpers that did nothing with it but copy it; a parameter only ever copied is one more
  thing for the next check to get wrong.
- **Unknown keys are refused rather than ignored**, at the configuration, in a profile and in a rule.
  A misspelled `channelCap` already showed up as a missing one, but `rules` is the one optional
  parameter: misspelled, it would have been a rule set that silently did nothing.
- **A `*` is refused anywhere but at the end of a rule's channel.** It is the one malformed pattern
  that is quietly wrong instead of loudly wrong: `'lockpick:*:door'` is a literal star, matches no
  channel any caller would name, and resolution falls back to the default profile without a word.
  Nothing in ticket 06 forbade it, because `specificityOf` only ever looks at the last character.
- **The root seed is validated too**, which the ticket did not ask for and the same sentence covers:
  a service constructed with invalid parameters must not exist, and the root seed is a parameter. It
  goes through `| 0` on the way to the stream seeds, so `new Random(2.5)` and `new Random(2)` played
  the same game and nothing said so. `isSeed` moved from `state.ts` to `seed.ts`, which is where what
  counts as a seed belongs, and `assertRootSeed` is next to it.
  - It is **first-failure, and not one of the issues above**, which RND-24 now says in as many words:
    it comes from code or from a seed a player typed, not from a file, so there is no file, no path
    and no sibling problem to collect it with — and one wrong number there makes the whole service
    meaningless, which is a reason to stop rather than to enumerate. The first draft of RND-24 put it
    under "file, path and value" and the review was right that the code did not do that.
- **`state.ts` keeps its own check and stays first-failure.** The comment there promising "fuller
  parameter validation in issue 10" is replaced by why the two are not one: a save is bytes the game
  wrote, so there is no file for anyone to fix and the first broken invariant means corrupt. A
  configuration is what a person edits, and answers differently.
- **`filter.spec.ts` lost its `describe('the configuration')` block**, minus one test. The cases are
  now in `config.spec.ts`, one per error with the message verified rather than four cases per `it`
  behind a `/reduction/` regex; what stays in `filter.spec.ts` is the one thing that is about the
  *service* — that a service built on a configuration which does not validate does not come into
  existence.
- **The tests were checked for teeth.** Ignoring unknown keys fails 3; not resolving profile
  references fails 5; not checking the star's position fails 1; not checking the root seed fails 1;
  stopping at the first issue fails 20. The determinism lint rule also caught a `2 ** 40` written
  into the seed test, which is the rule from ticket 09 doing its job on new code.
  - Every error case verifies the **message**, and most verify the whole line rather than a substring
    — a test that accepts any error would pass on an implementation that had lost file, path or
    value, which is the entire requirement.
- **What the two-axis review changed**, so that the diff is not read as if it arrived this way:
  `WILDCARD` is now exported from `filter.ts` and imported by `config.ts` — where a star may appear
  and what it means were one rule split across two files, and could have drifted into two syntaxes.
  `MAX_UINT32` likewise stopped being written twice. The reserved-profile issue carries the profile
  as its `value`, not the name, which is what the field is documented to hold everywhere else.
  `describeValue` lost its `bigint` and function branches, which guarded cases the shape cannot
  produce. RND-24's root-seed paragraph was corrected, as above. And the spec sheet's "~200 lines"
  became ~270, which is what the file actually is.
- **New normative text in the sheet**, listed here so it is reviewable rather than smuggled in:
  **RND-24** (the exposed shape, file/path/value, every problem at once, no cascade, `null` refused,
  unknown keys refused, the star's position, the root seed, and the absence of a schema library), the
  contract table's first row, the public API block, and a test criterion.
- Not in this ticket, by design: `CFG` itself — loading and validating `random.json` is the game's
  job and is out of scope for the whole spec. Nothing here reads a file.

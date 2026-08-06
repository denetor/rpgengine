# 03 — `RND` declares its own section

**What to build:** the first service to say, in its own code, what its parameters are called, what
they are when nobody writes them, and how they are checked — and to say it **without importing
anything from `CFG`** (CFG-13, ARC-4.1). The match with the section shape is structural, which is
what keeps a generic service liftable into a project that composes its parameters some other way, and
what keeps boundary rule 3 satisfied without an exception.

Nothing about how `RND` behaves changes. The check already exists and is already exhaustive; what
this ticket does is give it two doors instead of one, because it has two callers with different
needs:

- **The composition** wants problems without a source. A service validating its own slice has nothing
  true to say about where the value came from — only `CFG` saw it arrive — so the check it is handed
  is not asked for one, and `CFG` stamps the provenance afterwards (CFG-3).
- **The constructor** wants a refusal, and its caller may well know what to call the value it was
  handed. `validateFilterConfig` and `assertFilterConfig` keep their `file` parameter and their
  behaviour exactly as they are today (RND-17).

The section's fallback is declared with its type spelled out, and not as a bare `undefined`: the
composed slice's type is inferred from the fallback, so a bare one would type the slice `undefined`
instead of "a filter configuration or none" (RND-21).

In the tail of this ticket the circle closes: a configuration composed by `CFG` and handed to a real
`Random` is accepted by it, and an invalid one is refused before any `Random` exists (CTX-10).

**Blocked by:** 01 — the composition and its refusal.

**Status:** done

- [x] `RND` exposes, through its one public door, a check that reports **every** problem with a value
      and says nothing about where it came from
- [x] `RND` exposes its **section** — the key it is written under, a fallback whose type is written
      out, and that check — as one object
- [x] The section object is accepted by the composition without `RND` importing anything from `CFG`
- [x] The two existing entry points keep their signature, their `file` parameter and their behaviour;
      the problem reported by the new check and by the old one are the same problem
- [x] What a problem is, is defined once: the issue the constructor's caller sees is that problem plus
      the source it was told
- [x] A valid section composed through `CFG` is accepted by a `Random` built from it, and the slice's
      type is a filter configuration or none — not `undefined`
- [x] An invalid section composed through `CFG` is refused with the same problems the service's own
      check reports, and no `Random` is constructed
- [x] The absence of the section remains valid and yields no problems (RND-21)
- [x] Every existing `RND` test still passes untouched
- [x] The sheet's public API block and what the service exports agree
- [x] The unit lane is green: lint, typecheck, boundaries and the headless suite

## Closing notes

- **The `NO_FILTER` idiom the sheets prescribed does not work, and the compiler said so.** Written as
  `const NO_FILTER: FilterConfig | undefined = undefined`, the constant is **narrowed back to
  `undefined` wherever it is read**, so a section built out of one types its slice `undefined` after
  all — the exact failure the idiom existed to prevent. The type now goes on the section's
  declaration instead, and both sheets have been corrected: `docs/services/config.md`'s snippet and
  the `FILTER_SECTION` block in `docs/services/random.md`.

- **It was caught only because the test assigns in the direction that can fail.** `typecheck` failed
  on `const stillAConfiguration: typeof FILTER_SECTION.fallback = VALID`. The reading a reader writes
  first — assigning the slice *to* `FilterConfig | undefined` — passes either way, since `undefined`
  is assignable to it too. `CFG`'s own `types.spec.ts` had the vacuous direction in its "keeps the
  service's own type when the fallback declares one" test, so ticket 01's guarantee was in fact
  unchecked; that test now assigns a real value to `typeof flour`, and was confirmed red by widening
  the fallback's declared type back to `undefined`.

- **The circle-closing test lives in `tests-headless/`, and had to.** A spec under
  `engine/core/random/` importing `engine/core/config/index.ts` is a service importing another
  service, which boundary rule 3 refuses — verified by writing the import and watching
  `npm run boundaries` fail. The refusal is right: the fit between the two is not a fact about either
  service, it is the fact a bootstrap depends on, and `game/bootstrap.ts` constructs nothing yet.
  `composed-parameters.spec.ts` enters through the two public doors and nothing else. The spec's
  "under `engine/core/random/`" is met for everything that *is* about `RND` alone: the section's
  contents, the structural match and the equivalence of the two checks are in `config.spec.ts`.
  `docs/specs/cfg-parameter-composition.md` said the opposite — "no new seam is opened in … 
  `tests-headless/`" and the circle-closing test "under `engine/core/random/`" — and now records the
  deviation and its reason, so that the next reader meets a decision rather than a contradiction.

- **The structural match is proved structurally.** `config.spec.ts` declares
  `SectionOfSomeConfiguration<T>` — what a composition asks of a section — in its own file and
  assigns `FILTER_SECTION` to it. Importing `SectionShape` to check the match would have proved the
  opposite of the claim, besides being the import rule 3 forbids.

- **`problemsWith` became `filterConfigProblems` rather than gaining a sibling.** There is one check
  and one definition of a problem: `FilterConfigIssue` is now `FilterConfigProblem` plus a `file`,
  and `validateFilterConfig` is one `map` over the public check. The equivalence is pinned by a test
  comparing the two outputs rather than by the two happening to be written alike.

- **Nothing about how `RND` behaves changed.** The 42 tests in `config.spec.ts` are the 36 that were
  there before, untouched, plus 6; the constructor, `validateFilterConfig` and `assertFilterConfig`
  keep their signatures and their messages. The unit lane — lint, typecheck, boundaries, 322 tests —
  is green.

- **The key stayed a literal.** `FILTER_SECTION.key` is typed `'random'` and not `string`, which is
  what the sheet declares. Widening it to match a first draft of the code would have been a sheet
  edited down to the implementation, which is the wrong direction for a normative document; the only
  change either sheet takes here is the fallback idiom, which was wrong in the sheet and is now
  right.

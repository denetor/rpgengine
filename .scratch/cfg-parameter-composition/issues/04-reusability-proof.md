# 04 — The reusability proof: the estate

**What to build:** the test that would notice if `CFG` ever stopped being generic (ARC-3.4, ARC-3.2).

`CFG` is declared to own no key, no default, no range and no unit, and to be usable unchanged by a
game whose sections it has never heard of (CFG-12). That is a promise which degrades in silence: one
key name assumed, one default that only makes sense for an action RPG, one message that mentions a
channel, and the mechanism is domain-specific before anybody notices.

So the whole surface is exercised with the sections of **an estate growing grapes** — its own keys,
its own defaults, its own checks, its own vocabulary — with no name from this game anywhere in it.
`RND` already has such a file and it sets the register to follow, including its deliberate refusal to
lean on this game's test scaffolding: a proof that the service can be lifted into another project
must not itself import the project.

The criterion, stated so that a later edit cannot quietly fail it: **if making this file pass ever
requires changing the service, the service was not generic.**

**Blocked by:** 01 — the composition and its refusal. 02 — the sections nobody claims, and the keys
claimed twice.

**Status:** done

- [x] The sections are the estate's: rows, plots, rainfall, what a taster writes down — invented here
      and meaning nothing to the service
- [x] Nothing of this game is named in the file: no channel, no profile, no seed, no dungeon
- [x] The file imports the service's public door and its own made-up values, and nothing else — no
      helper borrowed from another suite
- [x] Precedence and overlay are exercised on the estate's sections: a fallback alone, a source over
      it, two sources in order, a partial source
- [x] A refusal is exercised: the estate's own check rejects the estate's own bad value, and the issue
      names the estate's own file
- [x] A key the estate never declared is refused, listing the estate's sections
- [x] The estate's slices come back in the order its shapes were given, each with its own type
- [x] The criterion above is written in the file, so that the next reader knows what failing it means
- [x] The unit lane is green: lint, typecheck, boundaries and the headless suite

## Closing notes

- **The estate found a real limit of the composition's typing, on its first run.** `const S`
  preserves a tuple for an array literal **written at the call site**; a caller that keeps its
  sections in a named list — which this file does, and which any bootstrap composing a dozen of them
  will — widens it to an array of the union before `composeConfig` is ever reached, and every slice
  comes back typed as every section at once. `tsc` reported it five times. The fix is `as const` on
  the list, which is now written on `THE_ESTATE` with the reason beside it, in
  `docs/services/config.md` and in the design spec. **The service was not changed**, which is the
  criterion this file exists to apply: the caller writes one more word, the mechanism stays generic.

- **The estate's checks are the point, not the scenery.** A plot cannot be walked before it has been
  measured; a dry year must be drier than an ordinary one. Both are rules about two values at once,
  which is exactly the kind of thing `CFG` cannot know and must not learn (CFG-13). The messages are
  the estate's own words, and nothing in the service's output had to be taught any of them.

- **The tasting is the section that may be absent**, and it carries the fallback idiom into a foreign
  domain: the type on the section, not on a constant holding the absence. A year that does hold a
  tasting has somewhere to put it, and the last test is what notices if that stops being true.

- **Nothing is borrowed.** The only imports are `./index` and `vitest`; `isRecord` and `issuesOf` are
  written out here rather than shared with the sibling suites, and there is no helper from the bakery
  or from `RND`'s vineyard. The four words of this game that do appear — channel, dungeon, loot,
  damage — appear only in the header's statement of what is *absent*, which is the register
  `random/reusability.spec.ts` set.

- **The file was mutation-tested rather than trusted.** A review pass broke the service four ways —
  an overlay that never merges, the sources applied in reverse, only the first problem of a section
  reported, unclaimed keys ignored — and each one failed a test in this file alone. What that
  exercise also found: `@ts-expect-error` on a cross-assignment proves *less* than it appears, since
  it fires under the union-widening too. What actually pins the tuple is assigning each slice to
  **its own** type, which a widened slice fits none of; the weaker test is kept with its limit
  written beside it.

- **What the review moved.** The three copies of a `try`/`catch` became one `issuesOf`, as the
  sibling suites already have it; the sections are `*_SECTION`, as everywhere else; the estate's
  checks now enforce what its own types promise (`wordsAllowed`, the size of a plot); and
  "nothing comes back" is now tested by a section that records being asked, so the title no longer
  claims more than the assertion. Two cases the sheet's criteria want and the estate had not
  exercised were added: the joined source name over two files, and the estate handing the same
  section over twice.

- The unit lane — lint, typecheck, boundaries, 334 tests — is green.

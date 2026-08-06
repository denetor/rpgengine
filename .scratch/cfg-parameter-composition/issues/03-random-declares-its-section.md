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

**Status:** ready-for-agent

- [ ] `RND` exposes, through its one public door, a check that reports **every** problem with a value
      and says nothing about where it came from
- [ ] `RND` exposes its **section** — the key it is written under, a fallback whose type is written
      out, and that check — as one object
- [ ] The section object is accepted by the composition without `RND` importing anything from `CFG`
- [ ] The two existing entry points keep their signature, their `file` parameter and their behaviour;
      the problem reported by the new check and by the old one are the same problem
- [ ] What a problem is, is defined once: the issue the constructor's caller sees is that problem plus
      the source it was told
- [ ] A valid section composed through `CFG` is accepted by a `Random` built from it, and the slice's
      type is a filter configuration or none — not `undefined`
- [ ] An invalid section composed through `CFG` is refused with the same problems the service's own
      check reports, and no `Random` is constructed
- [ ] The absence of the section remains valid and yields no problems (RND-21)
- [ ] Every existing `RND` test still passes untouched
- [ ] The sheet's public API block and what the service exports agree
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

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

**Status:** ready-for-agent

- [ ] A source key that no shape claims produces an issue naming the source it appeared in
- [ ] That issue's message lists the sections that were expected
- [ ] It is refused **together with** everything else: one throw, not a separate early exit, so a
      typo'd section and a bad value in a good section are reported by the same run
- [ ] Several unclaimed keys, across several sources, are all reported
- [ ] A source that mentions no section at all is not an error
- [ ] Two shapes declaring the same key throw, and what is thrown is **not** a `ConfigError` full of
      issues
- [ ] That throw happens before any source is inspected, and its message names the key claimed twice
- [ ] Every test enters through the service's public door
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

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

**Status:** ready-for-agent

- [ ] The sections are the estate's: rows, plots, rainfall, what a taster writes down — invented here
      and meaning nothing to the service
- [ ] Nothing of this game is named in the file: no channel, no profile, no seed, no dungeon
- [ ] The file imports the service's public door and its own made-up values, and nothing else — no
      helper borrowed from another suite
- [ ] Precedence and overlay are exercised on the estate's sections: a fallback alone, a source over
      it, two sources in order, a partial source
- [ ] A refusal is exercised: the estate's own check rejects the estate's own bad value, and the issue
      names the estate's own file
- [ ] A key the estate never declared is refused, listing the estate's sections
- [ ] The estate's slices come back in the order its shapes were given, each with its own type
- [ ] The criterion above is written in the file, so that the next reader knows what failing it means
- [ ] The unit lane is green: lint, typecheck, boundaries and the headless suite

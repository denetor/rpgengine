# 11 — Reusability proof

**What to build:** the service is declared **generic**: it must work in another game, knowing
nothing about this one. It is a promise that degrades silently — one balancing constant, one channel
name taken for granted, one default that only makes sense here, and the service becomes
domain-specific without anyone noticing.

The proof is a test: the service exercised with **made-up** channels, distributions and names,
foreign to this game, and with no configuration file at all. If that test requires touching the
service, the service was not generic.

**Blocked by:** 04 — Gaussian source · 05 — Coherent noise and fBm · 06 — Per-channel filtered
randomness.

**Status:** ready-for-agent

- [ ] A test exists that exercises the service with a made-up domain, with no reference to this game
- [ ] The test covers uniform and weighted draws, Gaussian, noise and filtered randomness
- [ ] The test runs **with no configuration file at all**, with the filter inactive
- [ ] A variant with made-up profiles exists, to prove that the configuration is not tied to this
      game
- [ ] The service contains no constants, names or identifiers from this game
- [ ] The service contains no balancing values: those arrive as data

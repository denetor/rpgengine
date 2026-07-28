# 02 — Core: deterministic uniform streams

**What to build:** the game's source of randomness, seedable and reproducible. Callers construct the
service with a **root seed**, ask for a **stream** per usage domain (combat, loot, generation, AI)
and draw numbers from it. Two games started with the same seed produce the same sequence; consuming
numbers in one stream does not touch the others; and adding a new stream tomorrow does not change
what the others produce today, because a stream's seed depends on its **name** and not on the order
in which streams come into existence.

The generator and the hash function chosen here are **frozen**: changing them later invalidates
every save and every map generated from a seed. See ADR 0001.

**Blocked by:** 01 — Separate headless test runner.

**Status:** ready-for-agent

- [ ] The service is constructed with a root seed and, optionally, some parameters
- [ ] The generator is `xoshiro128**`, with 32-bit state and no use of `BigInt`
- [ ] A stream's seed is `hash(root seed, id)`; the hash function is chosen, named and documented as
      part of the stability contract
- [ ] Callers may pass an explicit seed for a stream, which takes precedence over the derivation
- [ ] Asking for the same stream twice returns the **same instance**
- [ ] `next`, `int`, `bool`, `pick`, `weighted`, `shuffle` are available
- [ ] Two services constructed with the same seed produce identical sequences over 10⁶ draws
- [ ] Consuming 1000 values from one stream does not alter another stream's sequence
- [ ] Creating a new stream does not alter the sequence of any existing stream
- [ ] `next()` and `int()` pass a χ² test on buckets
- [ ] No transcendental `Math` function appears in the service's code
- [ ] The service imports no other service, does not import `excalibur`, does not read files
- [ ] Two services constructed in the same process are independent

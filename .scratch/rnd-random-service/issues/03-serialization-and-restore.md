# 03 — Serialization and restore

**What to build:** reloading a game must resume the random sequences from the exact point where they
were interrupted — otherwise saving and reloading becomes a way of replaying the same moment until
the desired outcome comes up. The service produces its own portion of the state and knows how to
rebuild itself from it.

Restore happens **by construction**, never through a method called on an already-live service: there
must be no instant in which the service exists but holds the randomness of the wrong game.

Only what cannot be rebuilt from the seed is saved, so that the save file grows with actual usage
and not with playing time.

**Blocked by:** 02 — Core: deterministic uniform streams.

**Status:** ready-for-agent

- [ ] The service exposes a serialization of its own portion of the state only, with a version
      number of its own
- [ ] Restore is a factory that returns an already-complete service; there is no instance method
      that replaces its state
- [ ] The state contains: version, root seed, the state of the **touched** streams only, and a
      stream's explicit seed if it had one
- [ ] A stream that was never requested does not appear in the state and is rebuilt from its own
      name
- [ ] Save, draw 100 values, restore, draw again → the same 100 values
- [ ] A stream born from an explicit seed resumes correctly **without** the caller passing that
      number again
- [ ] The serialized state contains no functions, no runtime references, and no recomputable values
      that could diverge
- [ ] The state is JSON-serializable and survives the full round trip

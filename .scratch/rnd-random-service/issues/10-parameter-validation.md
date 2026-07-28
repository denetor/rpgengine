# 10 — Parameter shape and validation

**What to build:** filter profiles are data that a game designer edits without recompiling. A
profile that names something that does not exist, a reduction out of range or a negative cap must
make **loading** fail, with an error that states file, path and value — not produce strange
behaviour halfway through a game, when nobody will connect the effect to the cause any more.

The service reads no files and knows nothing about this game's content paths: it receives
**already-validated** parameters in the constructor. What it exposes is the **expected shape**, so
that the game's loader can apply it before the game context is constructed.

**Blocked by:** 06 — Per-channel filtered randomness.

**Status:** ready-for-agent

- [ ] The service exposes the expected shape of its own parameters, usable by whoever loads them
- [ ] Invalid parameters are rejected with an error that indicates file, path and value
- [ ] Validation happens **before** the service is constructed: a service constructed with invalid
      parameters does not exist
- [ ] The service still reads no files
- [ ] The absence of configuration is a **valid** case, not an error
- [ ] A profile referenced by a rule but not defined is a validation error
- [ ] A default profile that is declared but does not exist is a validation error
- [ ] Each error case has its own test, with the message verified

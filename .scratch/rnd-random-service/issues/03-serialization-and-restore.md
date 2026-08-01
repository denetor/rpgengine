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

**Status:** done

- [x] The service exposes a serialization of its own portion of the state only, with a version
      number of its own
- [x] Restore is a factory that returns an already-complete service; there is no instance method
      that replaces its state
- [x] The state contains: version, root seed, the state of the **touched** streams only, and a
      stream's explicit seed if it had one
- [x] A stream that was never requested does not appear in the state and is rebuilt from its own
      name
- [x] Save, draw 100 values, restore, draw again → the same 100 values
- [x] A stream born from an explicit seed resumes correctly **without** the caller passing that
      number again
- [x] The serialized state contains no functions, no runtime references, and no recomputable values
      that could diverge
- [x] The state is JSON-serializable and survives the full round trip

## Closing notes

- The format lives in `state.ts`: `RANDOM_STATE_VERSION` (1), `RandomState`, `RandomStreamState`,
  and `assertRandomState`, the only validation this ticket does. Public surface via `index.ts`.
  `serialize()` and the static `Random.deserialize()` are on `random.ts`.
- **A saved stream holds `{ id, words }` and `seed` only if it had an explicit one.** The derived
  seed is not written: it is `hash(root seed, id)`, and recomputing it is exactly what a restore
  does. `words` are four plain numbers, not the `Uint32Array` — a typed array survives neither
  `JSON.stringify` nor the "no runtime references" requirement.
- **The streams are written ordered by name**, by code unit and not with `localeCompare`, whose
  result depends on the locale. Two identical games therefore produce identical bytes whatever
  order the streams were first requested in — which the golden vectors of ticket 08 will want.
- **`snapshot()` copies.** Serializing then drawing 1000 more values must not move a state already
  handed out to `SAVE`; a test pins this.
- **`Stream`'s constructor is now private**, behind `fromSeed` and `fromWords`: a stream cannot come
  into existence without a state, and restore does not go through a seed it would have to invent.
- **What `assertRandomState` refuses**, because each would turn into a silently wrong game rather
  than an error: a version other than the current one, a root seed or an explicit seed that does not
  fit in 32 bits, a stream that does not hold exactly four 32-bit words, an **all-zero** generator
  state (`xoshiro128**` can never leave it and would repeat one value for ever), and the same stream
  named twice. A seed is a bit pattern and both readings of the word are accepted — `-1` and
  `4294967295` are the same seed after `| 0` — so what is refused is a number that would come back
  different from the one written. Migrating between versions belongs to `SAVE` (the spec's "Out of
  scope").
- **Validation is asymmetric on purpose, for now**: a restored root seed is checked, one passed to
  the constructor is not. Ticket 10 owns constructor validation and will make the two agree; until
  then a save is the untrusted input and a caller's literal is not.
- **RND-22 is only partly covered by this ticket.** Its table also asks for the current weights of
  every live channel (RND-13), and channels arrive with tickets 06 and 07 — nothing in the codebase
  produces them yet. The acceptance criteria above name streams only, and the format grows
  additively: a `channels` field alongside `streams`, with a version bump only if the shape written
  today changes.
- Tests in `serialization.spec.ts`, all through the same seam as the rest: a constructed service,
  the state it produces, and the service rebuilt from it. No test reads the generator's internals;
  the "plain data" test walks the state and rejects anything that is not a number, string, boolean,
  array or plain object.

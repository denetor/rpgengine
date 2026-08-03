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

**Status:** done

- [x] A test exists that exercises the service with a made-up domain, with no reference to this game
- [x] The test covers uniform and weighted draws, Gaussian, noise and filtered randomness
- [x] The test runs **with no configuration file at all**, with the filter inactive
- [x] A variant with made-up profiles exists, to prove that the configuration is not tied to this
      game
- [x] The service contains no constants, names or identifiers from this game
- [x] The service contains no balancing values: those arrive as data

## Closing notes

- **`reusability.spec.ts`, one domain, twenty tests.** The domain is an estate growing grapes: soil
  moisture over a plot, rainfall in millimetres, which rows are ripe, what a taster writes about a
  barrel. No dungeons, no loot, no damage, and nothing imported but the service's own door. The
  criterion is written at the top of the file so a later edit cannot quietly fail it: **if making
  this file pass ever requires changing the service, the service was not generic.**
  - It runs the whole surface, not a sample: `next`, `int`, `bool`, `pick`, `shuffle`, `diceRoll`,
    `weighted`, `gaussian`, `noise2`, `fbm2`, `filtered`, `channels`, `forget`, `serialize` and
    `deserialize`. Half of it with **no configuration at all**, the rest under profiles named
    `brisk` and `patient` with a cap of 4 — numbers and names that mean nothing to the service.
- **The last two boxes are not behavioural, and are not tested as if they were.** "Contains no
  constants or names from this game" and "contains no balancing values" are properties of the source,
  and a test that ran the service could pass while both were false. They are checked by two different
  means, each matched to what it can actually see:
  - **Names: a source scan**, in `isolation.spec.ts`, over the shipped `.ts` files with **comments
    stripped**. The distinction is the one that moved the `Math` prohibition to the linter in ticket
    09: a doc comment saying "loot from that enemy" to make a paragraph concrete has not made the
    code domain-specific, and a check that could not tell the two apart would be answered by deleting
    the sentence. A constant called `'loot:goblin'` is a different thing, and is what gets caught.
  - **The scan proves it still works before concluding there is nothing.** A test that passes by
    finding nothing passes identically when it has stopped reading, so a sample goes through the same
    two functions first: `LOOT_CHANNEL_CAP`, `defaultCombatReduction`, `goblinFight()` and
    `'sword:iron'` must all be found, and the same words in a comment must not.
  - **`\b` was not enough, and the first version of this check was nearly useless.** A word boundary
    does not break at an underscore or at a change of case, so `LOOT_CHANNEL_CAP` and
    `defaultCombatReduction` — the two shapes a domain name actually takes in code — both went
    through a regex scan untouched, and only a delimited string literal was ever caught. The search
    now splits the text into runs of letters and splits those again at every lowercase→uppercase
    step. The self-check above is written in the shapes that failed, not the one that passed.
  - **The walk is recursive, and checked by name.** `readdirSync` over one directory goes quiet the
    day somebody adds a folder, and `length > 0` would still pass on one file out of fifteen.
  - **A `//` inside a string literal is the one thing that could make this pass silently**, by
    deleting real code on the way to stripping a comment — the opposite of the false alarm the first
    draft of this note claimed. A line comment is now only stripped when the quotes before it are
    balanced, and there is a test with `const separator = '//'` next to a channel name to prove the
    name survives.
  - **Balancing values: behaviour, not a scan.** No source check can tell `MINIMUM_MULTIPLIER = 1e-12`
    (arithmetic) from a reduction factor (balance), and the service is full of legitimate numbers —
    hash constants, 32 bits, twelve uniforms, the octave defaults. So the claim is tested where it is
    observable: a profile with `reduction: 1` must leave `filtered` **exactly** equal to `weighted`
    over a thousand draws, and two profiles that differ must produce different repeat rates. A floor,
    a nudge or a cap the service had kept for itself would survive a change to the data, and neither
    test would pass if one did.
  - **The octave defaults are the service's only numbers of its own, and are now pinned rather than
    trusted.** `DEFAULT_FREQUENCY`, `DEFAULT_LACUNARITY` and `DEFAULT_PERSISTENCE` are shape, not
    balance — one scale, each octave twice as fast and half as loud — but every noise call in the
    first draft passed explicit options, so a tuned default would have gone straight through the
    proof. Sampling with no options must now equal sampling with those three numbers written out.
- **The word list leaves ordinary English out.** `pick(items)` takes items in the sense of "the
  elements of a list", not `INV`'s sense; `golden` contains `gold`. A list that flagged those is a
  list the next person turns off, so it holds only words that could not be innocent here — `goblin`,
  `lockpick`, `quest`, `mana`, `npc`, `tavern` and the like, from `GAMEPLAY.md`.
- **`filter-golden.json` still says `loot` and `loot:goblin`, deliberately.** It is a test vector read
  by `filter.spec.ts`, not code the service ships, and the scan covers `.ts` sources only. Test data
  naming this game's domain is what test data is for; regenerating that vector to say `tasting` would
  invalidate a golden file for a cosmetic reason, which ADR 0001 treats as a decision rather than a
  tidy-up.
- **Nothing in the service had to change**, which is the result the ticket was after. The one thing
  the proof did turn up is recorded above: it found nothing, and the mechanism that could have hidden
  that is now itself under test.
- **The tests were checked for teeth.** Each of `LOOT_CHANNEL_CAP`, `defaultCombatReduction` and
  `goblinFight()` added to `filter.ts` fails the scan on its own; the same words added to a comment do
  not. Ignoring the profile and reducing by a fixed 0.5 fails 3 of the reusability tests; a channel
  cap of the service's own fails 1; making the unconfigured path differ from `weighted` by one value
  fails 1; a `bool` that ignores its probability fails 1; a `shuffle` that returns the list untouched
  fails 1.
- **What the two-axis review changed**, so the diff is not read as if it arrived this way: the whole
  of the `\b` problem and the recursive walk above; the `//`-in-a-string failure mode, which the first
  draft of these notes had backwards; the octave defaults, which nothing exercised; `tally` replaced
  by a single-purpose count; `frequency: 0.4` named once instead of written six times; the pair
  `(reduction, recovery)` replaced by the `FilterProfile` it already was; and two assertions that were
  nearly vacuous — a frost count that passed for any `bool`, and a shuffle check that passed for a
  shuffle that did nothing. The seam exception for source-reading tests is now recorded in the spec
  sheet, where the seam is fixed, and not only in the service sheet.
- Not in this ticket, by design: the cross-engine half of ARC-3.4 — the golden vectors already run in
  three browsers (ticket 08), and reusability is about the domain, not the engine.

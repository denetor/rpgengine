# AUD — Audio

**Area:** Presentation · **Nature:** generic · **Priority:** 4 · **Status:** proposed
**Requirement prefix:** `AUD-*`

## Purpose

Play music and sound effects in reaction to domain events, with music transitions coherent with the
situation and per-channel mixing.

The domain does not play sounds: it emits events. That a blow makes a noise is a presentation
decision.

## Contract

| Item | Value |
|---|---|
| Depends on | `AST`, `CFG`; observes the bus |
| Does NOT depend on | the domain services |
| Consumed by | the game loop |
| Dynamic state | tracks playing, transition state, volumes, active sounds |
| Static state | event → sound mapping, playlists by area and situation |
| External data | `content/audio/soundmap.json`, `music.json` |
| Events emitted | none |

## Requirements

**AUD-1** — Music **MUST** change by **area and situation** (exploration, combat, dialogue, danger),
with cross-fade transitions, never hard cuts (GP-55).

**AUD-2** — Switching to combat music **MUST** have hysteresis: short, closely spaced fights **MUST
NOT** make the track oscillate. Leaving combat **MUST** have a configurable delay.

**AUD-3** — Sound effects **MUST** be triggered by **domain events** through a mapping declared in
data, not by calls scattered through the game logic (ARC-1.1).

**AUD-4** — The event → sound mapping **MUST** be able to depend on context: a footstep sounds
different on grass, on stone and in water, based on terrain properties (MAP-11).

**AUD-5** — Volumes **MUST** be adjustable separately for master, music and effects, and persisted as
player preferences, outside the game save (GP-57, SET-1). A change **MUST** be applied on the
`settings-changed` event (SET-4), not by re-reading the value periodically.

**AUD-6** — Sounds **SHOULD** be **positional**: volume and panning as a function of the distance
from the listener.

**AUD-7** — There **MUST** be a limit on the number of simultaneous instances of the same sound,
with a replacement policy: ten enemies hit in the same frame **MUST NOT** produce ten overlapping
playbacks.

**AUD-8** — Random variations (pitch, sample chosen among alternatives) **MUST** use a dedicated
`RND` stream, distinct from the gameplay one, so that sound does **NOT** alter the reproducibility
of the simulation (RND-2).

**AUD-9** — A missing sound **MUST NOT** bring the game down: silence and a diagnostic (AST-8).

**AUD-10** — Audio **MUST** be able to be absent: a headless game runs without audio (ARC-1.4).

**AUD-11** — Playback **MUST** respect pause: game sounds stop or are attenuated, interface ones do
not.

Pause is not a state of the clock and cannot be read from it (TIME-2): it is a decision of the
orchestration, which announces it as a fact of *this* game. The service reacts to that event, and its
interface sounds keep running on the driver's own time, which never stopped.

**AUD-12** — The service **MUST** work with a made-up event mapping (ARC-3.4).

## Test criteria

- A burst of identical events produces at most the allowed number of instances.
- Hysteresis prevents a track change on short, closely spaced fights.
- Audio randomness consumption does not alter the combat stream's sequence.
- A missing sound produces a diagnostic and silence, not an error.
- The headless simulation runs identically without the audio service.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-55, GP-56, GP-57
- [`assets.md`](./assets.md) · [`settings.md`](./settings.md) · [`random.md`](./random.md)

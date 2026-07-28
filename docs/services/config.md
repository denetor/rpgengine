# CFG — Configuration and balancing

**Area:** Core · **Nature:** generic · **Priority:** 1 · **Status:** proposed
**Requirement prefix:** `CFG-*`

## Purpose

Collect in a single place, typed and validated, all the game's **numeric parameters**: balancing,
thresholds, timings, sizes, rendering constants. It exists to make the game tunable without hunting
for numbers scattered through the code, and to make explicit what is a **design choice** as opposed
to what is a rule.

An important distinction with respect to **content** (`game/content/`): content describes *things
that exist* (this quest, this sword); configuration describes *how the system behaves* (how much a
point of Strength weighs, how often the AI re-evaluates).

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, other services |
| Consumed by | all services, at construction (CTX-2) |
| Dynamic state | only the **user settings** (volume, language, rebinding, accessibility) |
| Static state | all balancing parameters |
| External data | configuration file + balancing files in `game/balance/` |
| Events emitted | `settings-changed` |

## Public API (indicative)

```ts
interface GameConfig {
  readonly world: { tileSize: number; zBands: Record<ZBand, number> };
  readonly ai: { evaluationIntervalMs: number; activationRadius: number };
  readonly combat: { baseHitVariance: number };
  // …one section per area, all readonly
}

interface UserSettings {
  volume: { master: number; music: number; sfx: number };
  locale: string;
  bindings: BindingMap;
  accessibility: { textScale: number; reduceShake: boolean };
}

function loadConfig(sources: ConfigSource[]): Result<GameConfig, ConfigError[]>;
```

## Requirements

**CFG-1** — No **magic number** **MUST** appear in the code: tile size, z-bands, `INDEX_TO_TILE`
indices, activation radii, respawn timers, AI thresholds, price multipliers live in the
configuration.

**CFG-2** — The configuration **MUST** be **fully typed** and **`readonly`**: no service **MUST** be
able to modify it at runtime.

**CFG-3** — The configuration **MUST** be validated against a schema at load time, with errors that
state section, key and received value (ARC-7.2).

**CFG-4** — Every parameter **MUST** have a declared default value; a partial configuration **MUST**
be overlayable onto the defaults (`default ← file ← user`), with a documented precedence.

**CFG-5** — The **user settings** (volume, language, controls, accessibility) **MUST** be kept
separate from balancing: they are the only ones persisted outside the game save, because they hold
for all games.

**CFG-6** — Changing a user setting **MUST** produce the `settings-changed` event; consumers (audio,
HUD, input) react to it, rather than periodically re-reading the state.

**CFG-7** — Parameters **MUST** be grouped by **area of responsibility** matching the services, not
in a single flat object.

**CFG-8** — Every service **MUST** receive **only its own section** of the configuration, not the
whole object: this reduces coupling and makes explicit what influences it.

**CFG-9** — The game **SHOULD** be able to hot-reload the balancing in development, in order to
iterate without restarting.

**CFG-10** — The configuration **MUST NOT** contain text shown to the player: that belongs to `I18N`
(ARC-12.2).

**CFG-11** — An unused balancing parameter **SHOULD** be reported by an automated check, to avoid an
accumulation of dead configuration.

## Test criteria

- Loading with a partial file produces the expected defaults, with the declared precedence.
- An unknown key or a wrong type produces a diagnostic error, not a silent value.
- Attempting to mutate the configuration does not compile.
- `settings-changed` is emitted exactly once per change, with the new values.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-12 (centralized configuration)
- [`localization.md`](./localization.md) · [`input.md`](./input.md) · [`audio.md`](./audio.md)

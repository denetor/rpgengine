# SET — Player preferences

**Area:** Core · **Nature:** generic · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `SET-*`

## Purpose

Hold the handful of values the **player** changes — volume, language, key bindings, accessibility —
and persist them **outside the game save**, because they belong to the person rather than to the
playthrough. Deleting a save, starting a new game or loading somebody else's slot must not restore
somebody else's volume.

It exists as a service of its own because these values have the opposite properties to the
construction parameters of [`CFG`](./config.md): they are **mutable while the game runs**, they are
**written back** to a store, and a change to one **must reach** whoever is already using it. `CFG` is
a function that runs once and disappears; `SET` is a small piece of state with a long life. Putting
both behind one name is what made the previous version of `config.md` describe a global variable.

What it is not: a place for balancing, and not a general key-value store for whatever a system finds
convenient to keep. A value belongs here only if a **player** can change it from a menu.

## Contract

| Item | Value |
|---|---|
| Depends on | a **store port** implemented by the presentation (the only one that touches `localStorage`) |
| Does NOT depend on | `excalibur`, the DOM, `CFG`, other services |
| Consumed by | `presentation` (the options screen), `INP`, `AUD`, `REN`, `CAM`, `I18N` |
| Dynamic state | the current value of every declared preference — **not** in the game save (SET-1) |
| Static state | the declarations the game gives it: key, default, check |
| External data | what the store returns, already parsed |
| Events emitted | `settings-changed` |
| Order of magnitude | a few dozen preferences, read often, written on a player's action |

## Public API (indicative)

```ts
/**
 * One preference, declared by whoever offers it. `SET` declares none of its own
 * (SET-2): it knows a preference only through this.
 */
interface PreferenceShape<T> {
  readonly key: string;
  /** What the preference is before the player has ever touched it. */
  readonly fallback: T;
  /** Accepts or refuses a stored value. A refused one falls back (SET-3). */
  accepts(value: unknown): value is T;
}

interface SettingsService {
  get<T>(shape: PreferenceShape<T>): T;

  /**
   * Returns the event rather than publishing it (ARC-4.2), and returns none when
   * the value did not actually change (SET-4).
   */
  set<T>(shape: PreferenceShape<T>, value: T): CommandResult<T>;

  /** Back to the declared default; the same event as any other change. */
  reset<T>(shape: PreferenceShape<T>): CommandResult<T>;

  /** Everything the player has changed, for the store. */
  serialize(): Readonly<Record<string, unknown>>;
}

/** Where preferences survive between sessions. The engine knows nothing more. */
interface PreferenceStore {
  read(): Readonly<Record<string, unknown>> | undefined;
  write(values: Readonly<Record<string, unknown>>): void;
}

interface SettingsChanged {
  readonly type: 'settings-changed';
  readonly key: string;
  readonly value: unknown;
}
```

## Requirements

**SET-1** — Preferences **MUST** be persisted **outside the game save**, in a store of their own: they
hold for every game and every slot. Loading a save **MUST NOT** overwrite them, and deleting one
**MUST NOT** lose them. Nothing a preference holds **MUST** ever appear in a save file, and nothing
that affects the outcome of the game **MUST** ever be a preference: a value the player can change from
a menu and that changes what happens is a cheat menu.

**SET-2** — `SET` **MUST NOT** declare a preference of its own: no key, no default, no unit. It
receives declarations, and **MUST** be usable unchanged by a game whose preferences it has never heard
of (ARC-3.2, ARC-3.4). "Volume", "locale" and "text scale" are examples in this sheet, not names in
the code.

**SET-3** — Reading a preference **MUST** always answer. A stored value that is unknown, of the wrong
type or refused by its own check **MUST** fall back to the declared default, be reported as a
diagnostic, and **MUST NOT** stop the game from starting.

This is the deliberate opposite of CFG-3, which refuses everything at the first problem, and the
asymmetry is the point: a broken balancing file is a bug that must be seen before a world exists,
while a corrupted preferences file is a player who ends up with the default volume. Refusing to start
would be the wrong answer to the smaller problem.

**SET-4** — A change **MUST** produce a `settings-changed` event carrying the key and the new value,
**returned** by the command and published by the orchestration (ARC-4.2). Consumers react to it; no
service **MUST** re-read a preference periodically to notice a change.

Setting a preference to the value it already has **MUST NOT** produce an event: an options screen that
writes every field on close would otherwise restart the music on every visit.

**SET-5** — Persistence **MUST** go through the abstract store port, never through `localStorage`
directly: the engine imports no browser API (ARC-1.2), and the whole service **MUST** be testable
headless against a fake store (ARC-1.4).

**SET-6** — What `SET` holds **MUST NOT** be duplicated in `CFG` (CFG-12). A value is either a
construction parameter or a preference, and if a game genuinely needs both — a default the designer
sets and the player then overrides — the **default belongs to the preference's declaration**, not to a
second copy in the balancing files.

## Test criteria

- A preference set, then read, answers the new value; unset, it answers the declared default.
- A store holding a value of the wrong type, an unknown key, or a value the check refuses: the game
  starts, the affected preference reads as its default, and each problem is reported once.
- `set` to the current value returns no event; `set` to a different one returns exactly one, with the
  key and the new value.
- What `serialize` returns, given back to a new instance through the store, reproduces every value —
  and holds nothing the player never changed.
- The game save produced by `SAVE` contains no key of any preference (SET-1).
- **Reusability** (ARC-3.4): the whole surface driven with the preferences of a foreign domain, against
  a fake store, with no key of this game named anywhere in the service.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-12.4 (preferences), ARC-4.2 (commands return events)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-57 (volume), GP-62, GP-63 (rebinding), GP-66 (accessibility)
- [`config.md`](./config.md) — the immutable half: the construction parameters
- [`input.md`](./input.md) · [`audio.md`](./audio.md) · [`rendering.md`](./rendering.md) ·
  [`localization.md`](./localization.md)
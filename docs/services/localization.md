# I18N — Localization

**Area:** Core · **Nature:** generic · **Priority:** 3 · **Status:** proposed
**Requirement prefix:** `I18N-*`

## Purpose

Resolve every text shown to the player starting from a **key**, in the active language, with
parameter interpolation and plural handling. No game string exists in the code.

The same holds for content: what a dialogue hands over is not text, it is a **key** to the text. The
dialogue lines are written as prose in the `.ink` sources, but reach the presentation as the stable
ids extracted from them (DLG-9, DLG-24).

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, other services |
| Consumed by | `HUD`, `DLG` (for downstream resolution), orchestration |
| Dynamic state | active language |
| Static state | translation catalogues per language |
| External data | `content/locales/<lang>/*.json` |
| Events emitted | `locale-changed` |

## Public API (indicative)

```ts
type TextKey = string & { readonly __brand: 'TextKey' };

interface LocalizationService {
  t(key: TextKey, params?: Record<string, string | number>): string;
  plural(key: TextKey, count: number, params?: Record<string, string | number>): string;
  has(key: TextKey): boolean;
  setLocale(locale: string): Result<void, LocaleError>;
  availableLocales(): readonly LocaleInfo[];
  formatNumber(value: number): string;
  formatDate(value: GameTimeMs): string;
}
```

## Requirements

**I18N-1** — No string shown to the player **MUST** be hardcoded, neither in the code nor in the
content files: keys appear everywhere (ARC-12.2, GP-65).

**I18N-2** — A missing key **MUST NOT** produce a blank screen: it **MUST** fall back to the backup
language and, if that is missing too, show the key itself in visible form, reporting the error.

**I18N-3** — An **automated check** **MUST** verify that every key used in the code and in the
content exists in all languages declared complete, and report orphan keys.

**I18N-4** — Parameter interpolation **MUST** be typed or at least validated: a missing parameter
**MUST** be a diagnostic error, not an `undefined` in the text.

**I18N-5** — The service **MUST** support the **plural rules** of the active language, not just
English's singular/plural distinction.

**I18N-6** — Language switching **MUST** happen at runtime, without a restart, and emit
`locale-changed` so that the interface redraws itself. The **chosen** language is a player preference
and is persisted as one, outside the game save (SET-1): the service holds the active language, it does
not store it.

**I18N-7** — Texts **MUST** be organized by **domain** (`ui.*`, `dialog.*`, `item.*`, `quest.*`),
with the ability to load catalogues separately.

**I18N-8** — The service **MUST NOT** be called by the domain: the domain produces keys and
parameters, the presentation resolves the text. An internal log message is not localized text.

**I18N-9** — The catalogue format **MUST** be editable by a translator without touching the code,
and **SHOULD** allow export to a common interchange format.

**I18N-10** — Numbers, quantities and dates **MUST** be formatted according to the active language.

**I18N-11** — Languages **SHOULD** be markable as incomplete, with an explicit fallback for missing
keys, so that partial translations can be shipped.

## Test criteria

- A key missing in the active language but present in the fallback returns the fallback text.
- The completeness check detects missing keys and orphan keys on synthetic catalogues.
- Plurals are correct in at least two languages with different rules.
- Switching language emits exactly one event and subsequent texts change accordingly.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-12
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-65
- [`dialog.md`](./dialog.md) · [`hud.md`](./hud.md) · [`settings.md`](./settings.md)

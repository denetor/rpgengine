# AST — Assets and resources

**Area:** Core · **Nature:** generic · **Priority:** 3 · **Status:** proposed
**Requirement prefix:** `AST-*`

## Purpose

Declare, load and make available the binary resources — sprite sheets, tilesets, sounds, Tiled maps,
fonts — in a **data-driven** way, with staged loading and clear diagnostics on missing files.

It is the only service with a foot in the outside world: assets are files. But the **declaration** of
which assets exist and how they are made (grids, frames, animations) is data, not code.

## Contract

| Item | Value |
|---|---|
| Depends on | a **loading port** implemented by the presentation |
| Does NOT depend on | `excalibur` in the manifest and in the index (only the port touches it) |
| Consumed by | `presentation`, `REN`, `AUD`, `MAP` |
| Dynamic state | which bundles are loaded |
| Static state | the asset manifest |
| External data | `content/assets.json` — manifest: id, path, kind, grid, animations, bundle |
| Events emitted | `bundle-loaded`, `asset-failed`, `loading-progress` |

## Public API (indicative)

```ts
interface AssetManifest {
  bundles: Record<BundleId, { assets: AssetId[]; preload: boolean }>;
  assets: Record<AssetId, AssetDeclaration>;
}

type AssetDeclaration =
  | { kind: 'spritesheet'; path: string; grid: { w: number; h: number; cols: number; rows: number };
      animations?: Record<string, { frames: number[]; durationMs: number; loop: boolean }> }
  | { kind: 'tileset'; path: string; tileSize: number }
  | { kind: 'audio'; path: string; channel: 'music' | 'sfx' }
  | { kind: 'tiled-map'; path: string }
  | { kind: 'font'; path: string };

interface AssetService {
  loadBundle(id: BundleId): Promise<Result<void, AssetError[]>>;
  unloadBundle(id: BundleId): void;
  get<T extends AssetKind>(id: AssetId, kind: T): LoadedAsset<T>;
  progress(): { loaded: number; total: number };
}
```

## Requirements

**AST-1** — Assets **MUST** be declared in a **data manifest**, not registered through calls
scattered in the code (ARC-12.3).

**AST-2** — Sprite grids, frames and animations **MUST** be described in the manifest: no frame
index and no cell size **MUST** appear as a magic number in the code (CFG-1).

**AST-3** — The manifest **MUST** be validated against the schema; an asset that is declared but
absent **MUST** produce a loading error with id and path.

**AST-4** — Assets **MUST** be grouped into **bundles** that can be loaded and unloaded separately,
so as not to load the whole game at startup.

**AST-5** — The service **MUST** expose loading progress, so that the loading screen is real and not
simulated.

**AST-6** — No domain service **MUST** depend on assets: the domain knows a sprite's **id**, never
its pixels (ARC-1).

**AST-7** — Resolving an asset **MUST** be typed by kind: asking for a sound with a sprite's id
**MUST** be an error.

**AST-8** — A missing asset in production **SHOULD** fall back to a visible placeholder resource
(error texture, silent sound) instead of bringing the game down, while reporting the anomaly.

**AST-9** — The service **MUST** be replaceable with a headless fake that resolves every asset to a
placeholder, to make system tests runnable without files (ARC-1.4).

**AST-10** — Loading a Tiled map **MUST** produce data (grid, objects, properties) consumable by
`MAP` and `ENT` without going through the renderer.

**AST-11** — An automated check **SHOULD** report assets that are declared and never used.

## Test criteria

- An invalid manifest produces diagnostic errors with id and path.
- Loading and unloading a bundle leaves no resources retained.
- The headless fake allows the full system test suite to run with no files on disk.
- Asking for an asset with the wrong kind does not compile.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-12.3
- [`map.md`](./map.md) · [`rendering.md`](./rendering.md) · [`audio.md`](./audio.md)

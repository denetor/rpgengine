# AST — Asset e risorse

**Area:** Core · **Natura:** generico · **Priorità:** 3 · **Stato:** proposto
**Prefisso requisiti:** `AST-*`

## Scopo

Dichiarare, caricare e mettere a disposizione le risorse binarie — sprite sheet, tileset, suoni,
mappe Tiled, font — in modo **data-driven**, con caricamento a fasi e diagnostica chiara sui file
mancanti.

È l'unico servizio con un piede nel mondo esterno: gli asset sono file. Ma la **dichiarazione** di
quali asset esistono e di come sono fatti (griglie, frame, animazioni) è dato, non codice.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | una **porta di caricamento** implementata dalla presentazione |
| NON dipende da | `excalibur` nel manifesto e nell'indice (solo la porta lo tocca) |
| Consumato da | `presentation`, `REN`, `AUD`, `MAP` |
| Stato dinamico | quali bundle sono caricati |
| Stato statico | manifesto degli asset |
| Dati esterni | `content/assets.json` — manifesto: id, percorso, tipo, griglia, animazioni, bundle |
| Eventi emessi | `bundle-loaded`, `asset-failed`, `loading-progress` |

## API pubblica (indicativa)

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

## Requisiti

**AST-1** — Gli asset **DEVONO** essere dichiarati in un **manifesto dati**, non registrati con
chiamate sparse nel codice (ARC-12.3).

**AST-2** — Griglie sprite, frame e animazioni **DEVONO** essere descritti nel manifesto: nessun
indice di frame né dimensione di cella **DEVE** comparire come numero magico nel codice (CFG-1).

**AST-3** — Il manifesto **DEVE** essere validato allo schema; un asset dichiarato ma assente
**DEVE** produrre un errore in caricamento con id e percorso.

**AST-4** — Gli asset **DEVONO** essere raggruppati in **bundle** caricabili e scaricabili
separatamente, per non caricare l'intero gioco all'avvio.

**AST-5** — Il servizio **DEVE** esporre l'avanzamento del caricamento, perché la schermata di
caricamento sia reale e non simulata.

**AST-6** — Nessun servizio di dominio **DEVE** dipendere dagli asset: il dominio conosce l'**id**
di uno sprite, mai i suoi pixel (ARC-1).

**AST-7** — La risoluzione di un asset **DEVE** essere tipizzata per genere: chiedere un suono con
l'id di uno sprite **DEVE** essere un errore.

**AST-8** — Un asset mancante in produzione **DOVREBBE** ricadere su una risorsa segnaposto visibile
(texture di errore, suono muto) invece di far crollare il gioco, segnalando l'anomalia.

**AST-9** — Il servizio **DEVE** essere sostituibile con un fake headless che risolve ogni asset in
un segnaposto, per rendere i test di sistema eseguibili senza file (ARC-1.4).

**AST-10** — Il caricamento di una mappa Tiled **DEVE** produrre dati (griglia, oggetti, proprietà)
consumabili da `MAP` e `ENT` senza passare dal renderer.

**AST-11** — Un controllo automatico **DOVREBBE** segnalare gli asset dichiarati e mai usati.

## Criteri di test

- Il manifesto non valido produce errori diagnostici con id e percorso.
- Caricare e scaricare un bundle non lascia risorse trattenute.
- Il fake headless permette l'esecuzione completa dei test di sistema senza file su disco.
- Chiedere un asset con il genere sbagliato non compila.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-12.3
- [`map.md`](./map.md) · [`rendering.md`](./rendering.md) · [`audio.md`](./audio.md)

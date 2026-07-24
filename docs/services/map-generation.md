# GEN — Generazione procedurale di mappe

**Area:** Mondo · **Natura:** generico · **Priorità:** 3 · **Stato:** proposto
**Prefisso requisiti:** `GEN-*`

## Scopo

Produrre **griglie dati** di mappa a partire da un seed e da una ricetta: aree completamente
casuali, oppure composte connettendo settori presi da un pool di pezzi disegnati a mano. L'output è
lo stesso formato di una mappa Tiled, così che a valle nessuno distingua le due origini.

Non genera *pixel* e non genera *contenuto narrativo*: produce terreno, connessioni e **punti
d'interesse** che l'orchestrazione popolerà.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | `RND` (iniettato come stream, non come servizio intero) |
| NON dipende da | `excalibur`, `MAP`, altri servizi |
| Consumato da | orchestrazione, che passa il risultato a `MAP` |
| Stato dinamico | nessuno: è una funzione da (seed, ricetta) a mappa |
| Stato statico | ricette di generazione, pool di settori |
| Dati esterni | `content/generation/*.json` — ricette, pool di stanze, vincoli, tabelle di bioma |
| Eventi emessi | nessuno |
| Ordine di grandezza | una mappa 256×256 in meno di 100 ms |

## API pubblica (indicativa)

```ts
interface GeneratedMap {
  terrain: Uint16Array;              // stesso formato di una mappa caricata
  width: number; height: number;
  entrances: readonly Cell[];
  pointsOfInterest: readonly { kind: PoiKind; cell: Cell; tags: string[] }[];
  regions: readonly { id: string; kind: RegionKind; cells: Cell[] }[];
}

interface MapGenerator {
  generate(recipe: RecipeId, seed: number): Result<GeneratedMap, GenerationError>;
}
```

## Requisiti

**GEN-1** — Il generatore **DEVE** essere una **funzione pura** di (ricetta, seed): nessuno stato
interno tra due generazioni, nessuna dipendenza dall'ordine delle chiamate.

**GEN-2** — La stessa coppia (ricetta, seed) **DEVE** produrre una mappa **identica bit per bit**,
oggi e dopo un aggiornamento del browser (RND-4).

**GEN-3** — Una mappa generata **DEVE** poter essere ricostruita da seed invece che salvata per
intero: nel salvataggio finiscono seed, ricetta e differenze (MAP-18).

**GEN-4** — **DEVONO** essere supportate almeno due famiglie di ricette:
- **generazione libera**, in cui il terreno nasce da rumore e regole (GP-8);
- **composizione da pool**, in cui settori disegnati a mano vengono scelti, orientati e connessi
  (GP-9).

**GEN-5** — Le ricette **DEVONO** essere **dati validati** (ARC-7): parametri di rumore, soglie di
bioma, dimensioni, densità, numero di stanze, regole di connessione. Cambiare la generazione **NON
DEVE** richiedere di ricompilare.

**GEN-6** — La generazione **DEVE** garantire la **connettività**: ogni punto d'interesse e ogni
uscita **DEVONO** essere raggiungibili da ogni ingresso. La verifica è parte del generatore, non un
controllo esterno opzionale.

**GEN-7** — Se una ricetta non riesce a soddisfare i vincoli, il generatore **DEVE** riprovare un
numero limitato di volte e poi **fallire in modo esplicito**, mai restituire una mappa rotta.

**GEN-8** — Il generatore **DEVE** produrre **punti d'interesse tipizzati** (ingresso, uscita,
stanza del tesoro, accampamento, sorgente d'acqua) come **dati posizionali**. Popolarli di nemici,
oggetti e quest è compito dell'orchestrazione, non del generatore.

**GEN-9** — La generazione **DEVE** essere **decomponibile in porzioni** riproducibili
indipendentemente, derivando uno stream per porzione (RND-5): serve per generare a chunk senza che
il risultato dipenda dall'ordine di visita del giocatore.

**GEN-10** — Il generatore **DEVE** produrre solo `TerrainId` validi rispetto alla tabella dei
terreni; una ricetta che ne cita uno inesistente **DEVE** fallire in validazione (ARC-7.5).

**GEN-11** — Il generatore **NON DEVE** conoscere `MAP`: restituisce dati, che l'orchestrazione
consegna al servizio mappa (ARC-4.1).

**GEN-12** — Il generatore **DOVREBBE** esporre una modalità diagnostica che restituisce le fasi
intermedie (mappa di rumore, biomi, stanze, corridoi), per poter osservare e tarare il processo.

**GEN-13** — La generazione **NON DEVE** bloccare il gioco: per mappe grandi **DEVE** essere
eseguibile a fasi interrompibili o fuori dal thread principale, restando deterministica.

## Criteri di test

- Stesso seed → mappa identica, su 100 ricette diverse.
- Connettività verificata su 1000 seed casuali per ogni ricetta: nessuna mappa con punti isolati.
- Una ricetta impossibile fallisce con errore diagnostico entro il numero di tentativi previsto.
- La generazione per chunk in ordine diverso produce lo stesso mondo.
- Il generatore produce una mappa valida con un insieme di terreni inventato (ARC-3.4).

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-8, GP-9, GP-10
- [`map.md`](./map.md) · [`random.md`](./random.md) · [`pathfinding.md`](./pathfinding.md)

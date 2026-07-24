# RND — Numeri casuali

**Area:** Core · **Natura:** generico · **Priorità:** 1 · **Stato:** proposto
**Prefisso requisiti:** `RND-*`

## Scopo

Essere l'**unica sorgente di casualità** del gioco, seedabile e riproducibile, e offrire non solo
numeri uniformi ma le **forme statistiche** che i vari sistemi richiedono: distribuzione normale per
le variazioni che devono addensarsi attorno a un valore, rumore coerente per la generazione
procedurale, casualità *filtrata* per evitare sequenze che al giocatore sembrano poco casuali.

Il punto centrale: **casualità matematicamente corretta e casualità percepita come tale sono cose
diverse**. Sette teste di fila sono un risultato legittimo di una moneta equa, ma in un gioco
vengono lette come un bug. Questo servizio fornisce entrambe e lascia a ogni sistema la scelta.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, `Math.random()`, altri servizi |
| Consumato da | `CBT`, `LOOT`, `GEN`, `AI`, orchestrazione |
| Stato dinamico | seed radice, stato di ogni stream, code della casualità filtrata |
| Stato statico | parametri delle distribuzioni e delle code, per uso |
| Dati esterni | `game/balance/random.json`: lunghezza code, criteri di rifiuto, σ per uso |
| Eventi emessi | nessuno |
| Ordine di grandezza | ~10⁴ estrazioni/secondo durante la generazione di una mappa |

## API pubblica (indicativa)

```ts
type StreamId = string;  // 'combat' | 'loot' | 'worldgen' | 'ai' | …

interface RandomService {
  /** Ogni stream ha uno stato proprio: consumare da uno non altera gli altri. */
  stream(id: StreamId): RandomStream;
  serialize(): RandomState;
}

interface RandomStream {
  next(): number;                                   // [0, 1)
  int(minIncl: number, maxExcl: number): number;
  bool(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: readonly { value: T; weight: number }[]): T;
  shuffle<T>(items: readonly T[]): T[];

  /** Normale (Box–Muller), opzionalmente troncata. */
  gaussian(mean: number, stdDev: number, clamp?: [number, number]): number;

  /** Estrazione filtrata sulla coda di quel canale: evita ripetizioni e cluster. */
  filtered<T>(channel: string, entries: readonly { value: T; weight: number }[]): T;

  /** Rumore coerente, deterministico dalla coppia (seed, coordinate). */
  noise2(x: number, y: number, options?: NoiseOptions): number;   // [-1, 1]
  fbm2(x: number, y: number, octaves: number, options?: NoiseOptions): number;
}
```

## Requisiti

### Riproducibilità

**RND-1** — Il servizio **DEVE** essere seedabile e produrre, a parità di seed e di sequenza di
chiamate, esattamente la stessa sequenza di valori. Nessun uso di `Math.random()` **DEVE** esistere
altrove nel progetto (ARC-9.2), verificato da lint.

**RND-2** — Il servizio **DEVE** offrire **stream indipendenti per dominio d'uso** (combattimento,
loot, generazione mondo, IA, ambiente). Consumare numeri in uno **NON DEVE** alterare la sequenza
degli altri: aggiungere un effetto visivo casuale non deve cambiare l'esito di un combattimento.

**RND-3** — Lo stato di ogni stream **DEVE** essere serializzabile e ripristinabile: caricare un
salvataggio riprende le sequenze dal punto esatto (ARC-10).

**RND-4** — L'algoritmo di base **DEVE** essere esplicito, documentato e stabile (es. PCG32 o
xoshiro128\*\*), **non** l'implementazione del motore JavaScript: un aggiornamento del browser non
**DEVE** cambiare le partite.

**RND-5** — Il servizio **DEVE** poter derivare uno stream figlio deterministico da una chiave
(`derive('chunk:12,7')`), così che la generazione di una porzione di mondo sia riproducibile
**indipendentemente dall'ordine** in cui le porzioni vengono generate.

### Forme statistiche

**RND-6** — Il servizio **DEVE** esporre una sorgente **gaussiana** parametrica (media, deviazione
standard) con troncamento opzionale, per le grandezze che devono addensarsi attorno a un valore
centrale: variazione del danno, dispersione dei colpi, jitter delle attese, imprecisione dei PNG.

**RND-7** — Il servizio **DEVE** esporre **rumore coerente e continuo** (Perlin o simplex) in 2D,
con supporto a più ottave (fBm), per la generazione procedurale: altimetria, biomi, densità di
risorse, variazioni ambientali. Il rumore **DEVE** dipendere in modo deterministico da seed e
coordinate, non dall'ordine di campionamento. **PUÒ** offrire simplex in alternativa a Perlin.

**RND-8** — Il servizio **DEVE** esporre l'estrazione pesata (`weighted`) come primitiva: le loot
table e le scelte di IA non **DEVONO** reimplementarla.

### Casualità filtrata (casualità percepita)

**RND-9** — Il servizio **DEVE** offrire una modalità di estrazione **filtrata**, che per ogni
**canale** (loot di quel nemico, esito dei colpi di quell'arma, spawn di quell'area) mantiene una
**coda dei risultati recenti** e rifiuta o corregge l'estrazione se troppo simile o ripetuta
rispetto ai precedenti.

**RND-10** — Lunghezza della coda, criterio di rifiuto e numero massimo di riestrazioni **DEVONO**
essere **data-driven e per-canale** (ARC-7.1): canali diversi vogliono comportamenti diversi.

**RND-11** — Il filtro **DEVE** garantire la terminazione: superato il numero massimo di
riestrazioni, si accetta l'ultimo valore. Il filtro **NON DEVE** poter entrare in ciclo, nemmeno
quando esiste un solo esito possibile.

**RND-12** — Il servizio **DOVREBBE** offrire, in alternativa alla riestrazione, il
**riaggiustamento dei pesi**: ciò che è appena uscito vede il proprio peso ridotto e recuperato nel
tempo. È più efficiente della riestrazione e dà una distribuzione più controllabile.

**RND-13** — Lo stato delle code **DEVE** essere serializzato: ricaricare un salvataggio **NON DEVE**
azzerare la memoria anti-ripetizione, altrimenti il salvataggio diventa un modo per manipolare gli
esiti.

**RND-14** — La documentazione di ogni canale **DEVE** dichiarare quale tecnica usa e perché: le
tecniche vanno applicate **dove servono**, non ovunque. Il danno critico di un boss e il colore di
un fiore non hanno gli stessi requisiti.

### Struttura

**RND-15** — Gaussiana, rumore coerente e filtro **DEVONO** essere costruiti **sopra** lo stream
uniforme di base, non su sorgenti indipendenti: garantisce che RND-1 valga per tutti.

**RND-16** — La logica **DEVE** essere pura e priva di allocazioni negli hot path: `noise2`
**DEVE** poter essere chiamato milioni di volte durante la generazione di una mappa (ARC-13.3).

## Criteri di test

- **Riproducibilità**: due istanze con lo stesso seed producono sequenze identiche su 10⁶ estrazioni.
- **Indipendenza degli stream**: consumare 1000 valori da `ai` non altera la sequenza di `combat`.
- **Uniformità**: test del χ² su bucket per `next()` e `int()`.
- **Gaussiana**: media e deviazione standard campionarie entro tolleranza su 10⁵ campioni; il
  troncamento non sposta la media oltre il limite dichiarato.
- **Rumore**: continuità (differenza limitata tra campioni vicini), determinismo per coordinata,
  indipendenza dall'ordine di campionamento.
- **Filtro**: su 10⁴ estrazioni non compaiono ripetizioni oltre la soglia dichiarata; la
  distribuzione a lungo termine resta entro la tolleranza dai pesi nominali; la terminazione è
  garantita anche con un solo esito possibile.
- **Serializzazione**: salvare, estrarre 100 valori, ricaricare, riestrarre → stessi 100 valori.
- **Riusabilità** (ARC-3.4): il servizio funziona con canali e distribuzioni inventati, estranei a
  questo gioco.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-9 (determinismo)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-19 (formula del danno), GP-25 (loot table)
- [`loot.md`](./loot.md) · [`map-generation.md`](./map-generation.md) · [`combat.md`](./combat.md)

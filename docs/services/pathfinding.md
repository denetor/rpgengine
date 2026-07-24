# PATH — Pathfinding

**Area:** Agenti · **Natura:** generico · **Priorità:** 3 · **Stato:** proposto
**Prefisso requisiti:** `PATH-*`

## Scopo

Calcolare percorsi su griglia e rispondere alle domande di raggiungibilità che l'IA pone prima
ancora di muoversi: *è raggiungibile? quanto costa arrivarci? qual è il primo passo?*

Il servizio calcola percorsi; **non muove** le entità. Il movimento, con la sua fisica e le sue
animazioni, è della presentazione.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | una **porta di navigabilità** (`(x,y) → costo`), implementata su `MAP` + `ENT` |
| NON dipende da | `excalibur`, `MAP`, `ENT`, altri servizi |
| Consumato da | orchestrazione (esecuzione degli intenti di `AI`) |
| Stato dinamico | cache dei percorsi, code di richieste, componenti connesse |
| Stato statico | parametri: euristica, diagonali, tolleranze |
| Dati esterni | costi di movimento per terreno (da `MAP`), budget per frame in configurazione |
| Eventi emessi | `path-ready`, `path-failed` |
| Ordine di grandezza | ~50 richieste/secondo su mappe 256×256, entro un budget di ~2 ms/frame |

## API pubblica (indicativa)

```ts
interface NavigationPort {
  cost(x: number, y: number): number;      // Infinity = intransitabile
  width: number; height: number;
}

interface Pathfinder {
  /** Richiesta asincrona: il calcolo può essere distribuito su più frame. */
  request(from: Cell, to: Cell, agent: AgentProfile): PathRequestId;
  poll(id: PathRequestId): PathResult | 'pending';
  cancel(id: PathRequestId): void;

  /** Risposta immediata su distanze brevi, entro un budget di nodi. */
  findImmediate(from: Cell, to: Cell, agent: AgentProfile, maxNodes: number): PathResult | 'too-far';

  /** Raggiungibilità in O(1) tramite componenti connesse: da chiamare prima di cercare. */
  isReachable(from: Cell, to: Cell, agent: AgentProfile): boolean;

  /** Fuga: la cella migliore entro un raggio che massimizza la distanza dalle minacce. */
  findFleeTarget(from: Cell, threats: readonly Cell[], radius: number, agent: AgentProfile): Cell | undefined;

  invalidate(region: Rect): void;
}
```

## Requisiti

**PATH-1** — Il servizio **DEVE** dipendere solo da una **porta di navigabilità**, non dal servizio
mappa: deve poter essere testato su una griglia sintetica di costi (ARC-4.1).

**PATH-2** — Il calcolo **DEVE** essere deterministico: a parità di griglia, estremi e profilo, il
percorso restituito **DEVE** essere sempre lo stesso, compresa la risoluzione dei pareggi nella coda
di priorità (ARC-9.4).

**PATH-3** — Il servizio **DEVE** supportare **profili di agente** diversi: un agente acquatico, uno
volante e uno terrestre leggono costi diversi sulla stessa griglia. Il profilo è un dato.

**PATH-4** — `isReachable` **DEVE** rispondere in tempo pressoché costante tramite **componenti
connesse** precalcolate: evita di lanciare ricerche costose destinate a fallire, il caso peggiore
per le prestazioni.

**PATH-5** — Le richieste **DEVONO** poter essere **distribuite su più frame** con un budget di nodi
esplorati per frame, senza mai bloccare il gioco (ARC-13.2).

**PATH-6** — Le richieste **DEVONO** avere una priorità: il percorso del PNG che insegue il
giocatore precede quello del contadino che torna a casa.

**PATH-7** — I percorsi **DEVONO** essere invalidati alla modifica della navigabilità (porta chiusa,
ponte crollato), reagendo a `cell-changed`: l'invalidazione **DEVE** essere **regionale**, non
globale.

**PATH-8** — Il servizio **DEVE** supportare un **costo di attraversamento** oltre alla semplice
transitabilità: il fango rallenta, la strada è preferita, l'area sorvegliata è evitata da chi ha una
taglia. Costi aggiuntivi contestuali **DEVONO** poter essere aggiunti dal profilo dell'agente.

**PATH-9** — Il percorso restituito **DOVREBBE** essere **semplificato** (rimozione dei nodi
collineari, smussatura) prima della consegna, perché il movimento non risulti a scalini.

**PATH-10** — Il servizio **DEVE** offrire una ricerca di **fuga**: non un percorso verso una meta,
ma la destinazione entro un raggio che massimizza la distanza dalle minacce restando raggiungibile.
È necessaria a GP-29 e non è esprimibile come una normale ricerca da A a B.

**PATH-11** — Se la destinazione è occupata o non transitabile, il servizio **DOVREBBE** restituire
il percorso verso la **cella libera più vicina** ad essa, invece di fallire: è quasi sempre ciò che
serve.

**PATH-12** — I percorsi **NON DEVONO** essere serializzati: sono ricalcolabili (ARC-10.4).

**PATH-13** — Il calcolo **NON DEVE** allocare per nodo esplorato: strutture riusate tra le
richieste (ARC-13.3).

**PATH-14** — Il servizio **NON DEVE** muovere le entità né conoscere la loro rappresentazione:
restituisce celle.

## Criteri di test

- Su griglie sintetiche note (labirinti, corridoi, aree isolate) il percorso è ottimo e
  riproducibile.
- `isReachable` è coerente con l'esito della ricerca completa su 10⁴ coppie casuali.
- Una richiesta distribuita su più frame produce lo stesso risultato di una immediata.
- L'invalidazione regionale non azzera la cache dell'intera mappa.
- La ricerca di fuga da tre minacce sceglie la cella attesa.
- Prestazione: 50 richieste su mappa 256×256 entro il budget dichiarato, con zero allocazioni.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-13 (performance)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-13, GP-29
- [`map.md`](./map.md) · [`utility-ai.md`](./utility-ai.md)

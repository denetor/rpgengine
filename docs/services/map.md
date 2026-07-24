# MAP — Mappa: griglia dati e collisione

**Area:** Mondo · **Natura:** generico · **Priorità:** 1 · **Stato:** proposto
**Prefisso requisiti:** `MAP-*` — i requisiti `MAP-1…MAP-9` sono definiti in
[`MAP-REQUIREMENTS.md`](../MAP-REQUIREMENTS.md); questa scheda ne definisce il **contratto di
servizio** e aggiunge `MAP-10` in avanti.

## Scopo

Possedere la **griglia dati** del mondo — la verità logica su cosa c'è in ogni cella — e rispondere
alle domande che gameplay e IA le pongono: cosa c'è in (x,y), è calpestabile, che costo ha
attraversarla, quali celle sono in quest'area.

È **dominio puro**: non disegna nulla. Il Dual Grid System e l'ordinamento per Y sono decisioni di
*rendering* che leggono questa griglia; la griglia non sa che esistono.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, `TileMap`, altri servizi |
| Consumato da | `PATH`, `AI`, `SPX`, `REN`, orchestrazione |
| Stato dinamico | modifiche a runtime (porta aperta, ponte crollato, area rivelata) |
| Stato statico | griglia dei terreni, tabella delle proprietà per terreno, aree nominate |
| Dati esterni | mappe Tiled, mappe generate (`GEN`), `terrains.json` (proprietà per terreno) |
| Eventi emessi | `cell-changed`, `area-entered`, `area-exited` |
| Ordine di grandezza | mappe fino a 512×512 celle con query di calpestabilità in O(1) |

## API pubblica (indicativa)

```ts
interface MapService {
  readonly width: number;
  readonly height: number;

  terrainAt(x: number, y: number): TerrainId;
  isWalkable(x: number, y: number): boolean;
  moveCost(x: number, y: number): number;          // Infinity = intransitabile
  propertiesAt(x: number, y: number): TerrainProperties;   // acqua, profondo, rumoroso, buio…

  setTerrain(x: number, y: number, t: TerrainId): CommandResult<void>;
  setBlocked(x: number, y: number, blocked: boolean): CommandResult<void>;

  areaAt(x: number, y: number): AreaId | undefined;
  cellsOfArea(id: AreaId): Iterable<Cell>;
  areaKind(id: AreaId): 'handcrafted' | 'generated';   // determina il respawn (GP-10)

  toWorld(cell: Cell): Vector2;   // in pixel, per la presentazione
  toCell(world: Vector2): Cell;
  inBounds(x: number, y: number): boolean;
}
```

## Requisiti aggiuntivi

**MAP-10** — Il servizio **DEVE** essere l'**unica autorità** sulla calpestabilità del terreno. La
collisione statica **DEVE** derivare dalla griglia dati, non da collider disegnati a mano
duplicati nel renderer.

**MAP-11** — Le proprietà di un terreno (calpestabile, costo di movimento, rumorosità, tipo di
suolo per suoni e particelle, luminosità) **DEVONO** essere **dati** in tabella per `TerrainId`, non
condizioni cablate nel codice.

**MAP-12** — Le query di cella (`terrainAt`, `isWalkable`, `moveCost`) **DEVONO** essere O(1) e
prive di allocazioni: sono chiamate migliaia di volte per ricerca di percorso (ARC-13.3).

**MAP-13** — La rappresentazione interna **DOVREBBE** essere un array tipizzato piatto
(`Uint16Array`), non un array di array di oggetti.

**MAP-14** — Le coordinate di cella e quelle di mondo **DEVONO** essere tipi distinti o comunque
distinguibili: confonderle è l'errore più comune di questo dominio.

**MAP-15** — Le modifiche a runtime **DEVONO** emettere `cell-changed`, perché renderer, indice
spaziale e cache di pathfinding si aggiornino senza doversi confrontare periodicamente con la
griglia.

**MAP-16** — Il servizio **DEVE** supportare **aree nominate** con confini, tipo (disegnata a mano o
generata) e proprietà proprie: sono l'unità a cui si agganciano regole di respawn (GP-10), musica
(GP-55), spawn e crimine.

**MAP-17** — L'attraversamento del confine di un'area da parte di un'entità tracciata **DEVE**
emettere `area-entered` / `area-exited`.

**MAP-18** — Lo stato dinamico serializzato **DEVE** contenere **solo le differenze** rispetto alla
mappa di partenza (celle modificate), non l'intera griglia: una mappa generata si ricostruisce da
seed (GEN-3) più le differenze.

**MAP-19** — Il servizio **DEVE** accettare indifferentemente una mappa caricata da Tiled e una
generata proceduralmente: la sorgente **NON DEVE** essere visibile a valle (GP-7, GP-8, GP-9).

**MAP-20** — Il servizio **DEVE** poter ospitare **più mappe** contemporaneamente caricate
(l'area corrente e quelle adiacenti), con identificazione esplicita: il passaggio da un'area
all'altra non **DEVE** richiedere di ricostruire il contesto.

**MAP-21** — La collisione delle **entità** (impronta di un barile, di un albero) **NON** appartiene
a questo servizio ma a `ENT`/`SPX`: la mappa conosce il terreno, non chi ci sta sopra. Chi deve
sapere se una cella è libera interroga entrambi.

## Criteri di test

- Costruire una mappa sintetica 32×32 e verificare calpestabilità, costi e confini.
- `toCell(toWorld(c)) === c` per ogni cella, inclusi i bordi.
- Modificare una cella emette esattamente un `cell-changed`.
- Il round-trip di serializzazione contiene solo le differenze attese.
- Il servizio funziona con un insieme di terreni inventato, estraneo a questo gioco (ARC-3.4).

## Collegamenti

- [`MAP-REQUIREMENTS.md`](../MAP-REQUIREMENTS.md) — MAP-1…MAP-9: livelli, DGS, ordinamento per Y,
  overhead, formato dati
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-7, GP-8, GP-9, GP-10, GP-52
- [`map-generation.md`](./map-generation.md) · [`pathfinding.md`](./pathfinding.md) ·
  [`spatial-index.md`](./spatial-index.md) · [`rendering.md`](./rendering.md)

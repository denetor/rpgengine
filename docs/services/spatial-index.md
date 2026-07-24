# SPX — Indice spaziale

**Area:** Mondo · **Natura:** generico · **Priorità:** 2 · **Stato:** proposto
**Prefisso requisiti:** `SPX-*`

## Scopo

Rispondere velocemente alle domande di prossimità: *chi c'è entro N tile? chi è il bersaglio
ostile più vicino? quali entità sono in questo rettangolo?*

Esiste per una ragione precisa: senza indice, ogni PNG scandisce ogni tick tutte le entità della
scena, e il costo cresce col quadrato del numero di attori. È il difetto di prestazioni più comune
nei giochi 2D scritti in modo diretto, ed è esattamente ciò che ARC-13.1 vieta.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, `ENT`, altri servizi |
| Consumato da | `AI`, `AFF`, `CRM`, `CBT` (bersagli ad area), orchestrazione |
| Stato dinamico | posizioni indicizzate (ricostruibile: **non** serializzato) |
| Stato statico | dimensione delle celle dell'indice |
| Dati esterni | dimensione cella in configurazione |
| Eventi emessi | nessuno |
| Ordine di grandezza | ~10³ entità mobili, ~10⁴ query di prossimità/secondo |

## API pubblica (indicativa)

```ts
interface SpatialIndex {
  insert(id: EntityId, pos: Vector2, tags: TagMask): void;
  move(id: EntityId, pos: Vector2): void;
  remove(id: EntityId): void;
  updateTags(id: EntityId, tags: TagMask): void;

  /** Scrive nel buffer fornito dal chiamante: nessuna allocazione per query. */
  queryRadius(center: Vector2, radius: number, filter: TagMask, out: EntityId[]): number;
  queryRect(rect: Rect, filter: TagMask, out: EntityId[]): number;
  nearest(center: Vector2, maxRadius: number, filter: TagMask): EntityId | undefined;

  /** Iterazione ordinata per distanza crescente, senza materializzare l'elenco. */
  forEachInRadius(center: Vector2, radius: number, filter: TagMask,
                  visit: (id: EntityId, distSq: number) => boolean): void;
}
```

## Requisiti

**SPX-1** — Le query di prossimità **DEVONO** avere costo proporzionale al numero di entità
**nell'area interrogata**, non al totale delle entità del mondo (ARC-13.1).

**SPX-2** — Il filtro per **capacità/tag DEVE** essere applicato *dentro* l'indice, non a valle: un
PNG che cerca bersagli non **DEVE** ricevere e scartare gli elementi decorativi. Il filtro **DEVE**
essere una maschera di bit, non un confronto di stringhe (ARC-6.3).

**SPX-3** — Le query **NON DEVONO** allocare: il chiamante fornisce il buffer, oppure usa
l'iterazione con callback (ARC-13.3).

**SPX-4** — L'aggiornamento della posizione di un'entità **DEVE** essere O(1) ammortizzato e
**NON DEVE** richiedere la rimozione e il reinserimento se la cella non cambia.

**SPX-5** — `nearest` **DEVE** interrompersi appena il risultato è certo, senza esaminare l'intero
raggio massimo.

**SPX-6** — L'indice **NON DEVE** essere serializzato: è una struttura derivata, ricostruita
dall'insieme delle entità al caricamento (ARC-10.4).

**SPX-7** — L'indice **NON DEVE** possedere le entità né conoscerne le proprietà: conosce id,
posizione e maschera di tag. Chiedere *cos'è* un'entità spetta a `ENT`.

**SPX-8** — Il risultato di una query **DEVE** avere ordine deterministico (per distanza crescente,
a parità di distanza per id crescente): un ordine dipendente dalla struttura interna renderebbe la
simulazione non riproducibile (ARC-9.4).

**SPX-9** — La struttura **DEVE** essere adatta a entità prevalentemente mobili in uno spazio a
densità irregolare: una **griglia uniforme** con dimensione di cella tarata è preferibile a un
quadtree, salvo evidenza contraria misurata.

**SPX-10** — La dimensione della cella **DEVE** essere configurabile e **DOVREBBE** essere
dell'ordine del raggio di query più frequente.

**SPX-11** — Il servizio **DOVREBBE** offrire una query di **visibilità** che combina distanza,
angolo e ostruzione del terreno, poiché è ciò che serve davvero a percezione e crimine (GP-47).
L'interrogazione del terreno avviene tramite una porta, non importando `MAP`.

**SPX-12** — In modalità sviluppo l'indice **DOVREBBE** poter esporre le proprie celle per la
visualizzazione diagnostica.

## Criteri di test

- Equivalenza con una scansione a forza bruta su 10⁴ posizioni casuali: stessi risultati, stesso
  ordine.
- Prestazione: 10⁴ query di raggio su 10³ entità entro il budget dichiarato, con zero allocazioni.
- Il filtro per maschera esclude correttamente le entità prive della capacità.
- Spostare un'entità entro la stessa cella non provoca reinserimento.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-6.3 (query per capacità), ARC-13 (performance)
- [`entity-registry.md`](./entity-registry.md) · [`utility-ai.md`](./utility-ai.md) ·
  [`affordance.md`](./affordance.md)

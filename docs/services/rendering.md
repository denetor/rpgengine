# REN — Rendering e adattatore di scena

**Area:** Presentazione · **Natura:** di dominio · **Priorità:** 1 · **Stato:** proposto
**Prefisso requisiti:** `REN-*`

## Scopo

Essere il **confine** tra il motore e Excalibur: l'unico luogo dove uno stato di dominio diventa un
`Actor`, uno sprite, un'animazione, un ordine di disegno.

È l'inverso di tutti gli altri servizi: gli altri esistono per **non** conoscere Excalibur, questo
esiste per contenerlo. Se la separazione presentazione/dominio fallisce, fallisce qui.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | `excalibur`, `AST`; osserva il bus |
| NON dipende da | nessun servizio di dominio se non in **lettura** attraverso viste |
| Consumato da | il ciclo di gioco |
| Stato dinamico | mappa `EntityId → Actor`, pool di attori, stato delle animazioni |
| Stato statico | mappatura archetipo → aspetto, z-band, definizioni di animazione |
| Dati esterni | `content/visuals/*.json` — aspetto per archetipo, animazioni, effetti |
| Eventi emessi | nessuno verso il dominio; consuma eventi di dominio |

## API pubblica (indicativa)

```ts
interface RenderAdapter {
  /** Reagisce agli eventi di dominio: nasce un'entità, nasce un Actor. */
  onEntitySpawned(id: EntityId, view: EntityView): void;
  onEntityDespawned(id: EntityId): void;

  /** Sincronizza gli Actor con lo stato di dominio, una volta per frame. */
  sync(world: WorldView, alpha: number): void;

  actorOf(id: EntityId): Actor | undefined;      // solo dentro la presentazione
  playEffect(effect: EffectRequest): void;       // colpi, particelle, numeri fluttuanti
}
```

## Requisiti

### Confine

**REN-1** — Questo servizio, insieme a `HUD`, `AUD`, `CAM` e all'adattatore di input, **DEVE** essere
l'unico a importare `excalibur` (ARC-1.2).

**REN-2** — Il legame `EntityId → Actor` **DEVE** vivere solo qui, come mappa esplicita. Nessun
`Actor` **DEVE** comparire in uno stato di dominio (ARC-1.3).

**REN-3** — La direzione della dipendenza **DEVE** essere unica: la presentazione osserva il dominio
e reagisce ai suoi eventi; il dominio **NON DEVE** conoscere l'esistenza degli `Actor` (ARC-1.1).

**REN-4** — Gli `Actor` **DEVONO** essere creati e distrutti reagendo a `entity-spawned` e
`entity-despawned`, mai per iniziativa della presentazione (ENT-13).

**REN-5** — La presentazione **NON DEVE** contenere regole di gioco: nessun calcolo di danno,
nessuna decisione di IA, nessuna transizione di quest in un `onPreUpdate`.

### Disegno

**REN-6** — L'ordinamento degli elementi **DEVE** seguire le z-band e l'ordinamento per Y della base
definiti in [`MAP-REQUIREMENTS.md`](../MAP-REQUIREMENTS.md) (MAP-1, MAP-5), con i valori presi da
configurazione (CFG-1).

**REN-7** — Il rendering del terreno **DEVE** applicare il **Dual Grid System** leggendo la griglia
dati di `MAP`, senza possedere una propria copia della verità (MAP-2, MAP-3, MAP-10).

**REN-8** — L'aspetto di un'entità **DEVE** essere **dato**: la mappatura archetipo → sprite,
animazioni e offset sta nei file di contenuto, non in una classe per tipo di nemico (ARC-7.1).

**REN-9** — Le animazioni **DEVONO** essere guidate dallo **stato di dominio** (in movimento, ferito,
morto), non da una macchina a stati parallela che può divergere.

**REN-10** — Gli `Actor` **DOVREBBERO** essere riusati tramite pool per le entità frequenti
(proiettili, particelle, numeri fluttuanti), evitando allocazioni per frame (ARC-13.3).

**REN-11** — Il numero di entità disegnate **DEVE** essere limitato a ciò che è visibile o prossimo:
il culling **NON DEVE** dipendere da una scansione di tutte le entità del mondo (ARC-13.1).

**REN-12** — L'interpolazione tra due passi di simulazione **DEVE** essere gestita qui: se la logica
gira a passo fisso (TIME-5), il rendering interpola. La logica **NON DEVE** essere alterata per
apparire fluida.

**REN-13** — Il feedback visivo (numeri di danno, lampeggio, scuotimento, particelle) **DEVE** essere
attivato da **eventi di dominio**, non da chiamate dirette sparse nella logica.

**REN-14** — L'intero servizio **DEVE** poter essere **assente**: una partita headless funziona senza
adattatore di rendering, ed è così che girano i test di sistema (ARC-1.4).

**REN-15** — Gli effetti di scuotimento e lampeggio **DEVONO** rispettare le impostazioni di
accessibilità (GP-66, CFG-5).

## Criteri di test

- Un test di confine verifica che nessun file fuori dalla presentazione importi `excalibur`
  (ARC-14.2).
- Una simulazione completa gira senza adattatore di rendering, con gli stessi risultati.
- Ogni `entity-spawned` produce esattamente un `Actor`; ogni `entity-despawned` lo rimuove, senza
  perdite dopo 10³ cicli.
- L'ordinamento per Y produce la sovrapposizione corretta su casi noti.
- Nessun riferimento ad `Actor` compare in un documento di salvataggio.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-1, ARC-13
- [`MAP-REQUIREMENTS.md`](../MAP-REQUIREMENTS.md) — MAP-1…MAP-6
- [`entity-registry.md`](./entity-registry.md) · [`map.md`](./map.md) · [`assets.md`](./assets.md) ·
  [`camera.md`](./camera.md)

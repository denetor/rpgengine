# CAM — Camera

**Area:** Presentazione · **Natura:** generico · **Priorità:** 3 · **Stato:** proposto
**Prefisso requisiti:** `CAM-*`

## Scopo

Decidere che porzione di mondo è inquadrata: inseguire il giocatore, restare entro i confini
dell'area, spostarsi su un punto d'interesse durante una scena, tremare a un'esplosione.

Piccolo servizio, ma incide molto sulla sensazione di gioco — ed è anche uno dei più fastidiosi da
correggere dopo, perché tende a spargersi tra scene, attori ed effetti.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | `CFG`; il risultato è applicato dalla camera di Excalibur |
| NON dipende da | i servizi di dominio |
| Consumato da | `REN` |
| Stato dinamico | posizione, zoom, bersaglio, effetti attivi |
| Stato statico | parametri di inseguimento, limiti, curve |
| Dati esterni | parametri in configurazione |
| Eventi emessi | `camera-focus-reached` |

## API pubblica (indicativa)

```ts
interface CameraService {
  follow(target: EntityId, style: FollowStyle): void;
  focusOn(point: Vector2, durationMs: number): void;   // scene, dialoghi, rivelazioni
  release(): void;

  setBounds(bounds: Rect | undefined): void;           // confini dell'area corrente
  setZoom(zoom: number, durationMs?: number): void;
  shake(intensity: number, durationMs: number): void;

  /** Calcola la posizione del frame. Logica pura: testabile senza renderer. */
  update(dt: number, targetPos: Vector2): CameraState;
}
```

## Requisiti

**CAM-1** — La logica della camera **DEVE** essere **pura e testabile**: `update` è una funzione di
stato e bersaglio, verificabile senza renderer. Solo l'applicazione del risultato tocca Excalibur.

**CAM-2** — L'inseguimento **DEVE** essere smorzato e configurabile, con una **zona morta** entro cui
la camera non si muove: seguire il giocatore pixel per pixel produce un'immagine nervosa.

**CAM-3** — La camera **DEVE** rispettare i **confini dell'area**: non **DEVE** mostrare il vuoto
oltre il bordo della mappa, salvo che l'area sia più piccola dello schermo, caso in cui **DEVE**
centrarla.

**CAM-4** — La camera **DEVE** poter essere sottratta all'inseguimento per inquadrare un punto
(scene, rivelazione di una porta che si apre) e restituita dopo, senza scatti.

**CAM-5** — Lo **scuotimento DEVE** essere parametrico e usare rumore, non oscillazioni casuali pure,
per un effetto continuo e non granuloso (RND-7).

**CAM-6** — Lo scuotimento **DEVE** rispettare le impostazioni di accessibilità, fino ad annullarsi
(GP-66).

**CAM-7** — Lo zoom **DEVE** essere animabile con durata e curva; la camera **DEVE** restare
coerente con i confini anche a zoom variabile.

**CAM-8** — La camera **DEVE** poter essere pilotata verso un punto e segnalare l'arrivo, perché una
sequenza narrativa possa procedere.

**CAM-9** — La posizione della camera **NON DEVE** influenzare la logica di gioco: nessuna regola
**DEVE** dipendere da cosa è inquadrato. Ciò che si attiva in base alla vicinanza usa distanze di
dominio, non lo schermo.

**CAM-10** — Lo stato della camera **NON DEVE** essere serializzato: si ricostruisce dal bersaglio e
dai confini al caricamento (ARC-10.4).

**CAM-11** — Al passaggio tra aree la camera **DEVE** ricollocarsi senza interpolazione attraverso lo
spazio intermedio.

## Criteri di test

- L'inseguimento con zona morta non muove la camera per spostamenti sotto soglia.
- Ai bordi della mappa la camera si arresta esattamente sul confine.
- Un'area più piccola dello schermo viene centrata.
- Lo scuotimento con la stessa intensità e lo stesso seed è riproducibile e si annulla con
  l'accessibilità attiva.
- `focusOn` seguito da `release` riprende l'inseguimento senza discontinuità.

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-66
- [`rendering.md`](./rendering.md) · [`config.md`](./config.md) · [`random.md`](./random.md)

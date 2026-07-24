# TIME — Tempo di gioco e scheduler

**Area:** Core · **Natura:** generico · **Priorità:** 1 · **Stato:** proposto
**Prefisso requisiti:** `TIME-*`

## Scopo

Essere l'**unica sorgente di tempo** del dominio. Fornisce il tempo di gioco (distinto dal tempo
reale), la conversione in orario del mondo per il ciclo giorno/notte, e uno **scheduler** per le
azioni differite: respawn, scadenza di status effect, rifornimento dei mercanti, routine dei PNG.

Senza questo servizio, i timer finirebbero sparsi come `setTimeout` e contatori privati, rendendo
impossibili pausa, salvataggio e riproducibilità.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, `Date.now()`, `setTimeout`, altri servizi |
| Consumato da | orchestrazione; il `tick` è pompato dal loop di presentazione |
| Stato dinamico | tempo di gioco trascorso, fattore di scala, coda dei timer pendenti |
| Stato statico | durata del giorno, mappatura tempo→orario |
| Dati esterni | parametri del ciclo giorno/notte |
| Eventi emessi | `timer-elapsed`, `hour-changed`, `day-changed`, `phase-changed` |

## API pubblica (indicativa)

```ts
type GameTimeMs = number;              // millisecondi di tempo di gioco dall'inizio partita
type TimerId = string;

interface Clock {
  now(): GameTimeMs;
  /** Avanza il tempo di gioco. Restituisce gli eventi maturati, non li pubblica (ARC-4.2). */
  tick(realDeltaMs: number): readonly DomainEvent[];

  setScale(factor: number): void;      // 0 = pausa, 1 = normale, >1 = accelerato
  isPaused(): boolean;

  schedule(afterMs: number, payload: TimerPayload): TimerId;
  scheduleRepeating(everyMs: number, payload: TimerPayload): TimerId;
  cancel(id: TimerId): boolean;

  worldTime(): { day: number; hour: number; minute: number; phase: DayPhase };
}
```

## Requisiti

**TIME-1** — Nessun codice di dominio **DEVE** leggere `Date.now()`, `performance.now()` o usare
`setTimeout`/`setInterval`: il tempo entra solo da `tick()` (ARC-9.3).

**TIME-2** — Il **tempo di gioco DEVE** essere distinto dal tempo reale e scalabile, con `scale = 0`
come pausa. In pausa nessun timer **DEVE** maturare.

**TIME-3** — `tick()` **DEVE** restituire gli eventi maturati in ordine di scadenza crescente; a
parità di scadenza, in ordine di registrazione. Il risultato **DEVE** essere indipendente dalla
dimensione dei passi: 10 tick da 16 ms e 1 tick da 160 ms **DEVONO** produrre la stessa sequenza.

**TIME-4** — Lo scheduler **DEVE** gestire correttamente un `delta` che copre **più scadenze**,
incluse le ripetizioni multiple di un timer periodico.

**TIME-5** — Il servizio **DEVE** offrire un **passo fisso di simulazione** opzionale per la logica
sensibile al determinismo, disaccoppiandola dal frame rate di rendering.

**TIME-6** — Lo scheduler **DEVE** reggere migliaia di timer pendenti con inserimento e scadenza in
tempo logaritmico: nessuna scansione lineare per tick (ARC-13).

**TIME-7** — I timer **DEVONO** essere serializzabili: `payload` è un dato, mai una callback. Al
caricamento, i timer pendenti riprendono con il tempo residuo corretto (ARC-10.4).

**TIME-8** — Il servizio **DEVE** convertire il tempo di gioco in **orario del mondo** (giorno, ora,
minuto, fase) secondo una durata del giorno configurabile, ed emettere `hour-changed`,
`day-changed`, `phase-changed` ai passaggi.

**TIME-9** — Il servizio **NON DEVE** sapere cosa significhi un timer: `payload` è opaco. Il
significato ("respawn del nemico E42", "fine avvelenamento") è dell'orchestrazione.

**TIME-10** — Un `delta` abnorme (finestra in background, breakpoint) **DEVE** essere limitato da un
tetto configurabile, per evitare che al ritorno maturino migliaia di eventi in un solo frame.

**TIME-11** — Il servizio **DEVE** distinguere tempo **simulato** e tempo **di interfaccia**: le
animazioni di HUD e menu continuano anche a gioco in pausa.

## Criteri di test

- Stessa sequenza di eventi con passi grandi e piccoli, a parità di tempo totale.
- Un timer periodico da 100 ms su un delta da 350 ms matura 3 volte, con le scadenze corrette.
- Salvataggio e ricaricamento a metà di un timer: il residuo è esatto.
- A `scale = 0` il tempo non avanza e nessun timer matura.
- Le transizioni di fase avvengono una sola volta per passaggio, anche con delta molto grandi.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-9 (determinismo), ARC-13 (performance)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-10 (respawn), GP-12 (ciclo giorno/notte), GP-13 (routine)
- [`persistence.md`](./persistence.md) — serializzazione dei timer

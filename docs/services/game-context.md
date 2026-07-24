# CTX — GameContext e composizione

**Area:** Core · **Natura:** generico · **Priorità:** 1 · **Stato:** proposto
**Prefisso requisiti:** `CTX-*`

## Scopo

Radunare in un unico oggetto le istanze dei servizi di una partita, costruirle una sola volta nel
bootstrap e passarle per iniezione. È la sostituzione strutturale dei singleton globali: rende
possibili partite multiple, test con dipendenze finte e uno spegnimento pulito.

Il GameContext è un **contenitore passivo**: non contiene logica di gioco, non media chiamate, non
è un service locator da cui i servizi pescano ciò che serve a runtime.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | tutti i servizi, **solo per costruirli** nel bootstrap |
| NON dipende da | `excalibur` |
| Consumato da | `game/bootstrap`, `game/orchestration`, `presentation` |
| Stato dinamico | nessuno proprio: aggrega quello dei servizi |
| Stato statico | il contenuto caricato, passato ai servizi in costruzione |
| Dati esterni | nessuno |
| Eventi emessi | nessuno |

## API pubblica (indicativa)

```ts
interface GameContext {
  readonly bus: EventBus<GameEvent>;
  readonly clock: Clock;
  readonly rng: RandomService;
  readonly entities: EntityRegistry;
  readonly map: MapService;
  readonly quests: QuestService;
  // …un campo per servizio
  dispose(): void;
}

/** Unico punto di costruzione dell'intero grafo. */
function createGameContext(options: {
  content: LoadedContent;
  config: GameConfig;
  seed: number;
  save?: SaveGame;
}): GameContext;
```

## Requisiti

**CTX-1** — L'intero grafo delle dipendenze **DEVE** essere costruito in **un solo punto**
(`createGameContext`), esplicitamente, senza risoluzione automatica né decoratori.

**CTX-2** — Ogni servizio **DEVE** ricevere le proprie dipendenze via **costruttore**. Nessun
servizio **DEVE** ricevere il `GameContext` intero: riceverebbe l'accesso a tutto, annullando i
confini (ARC-4.1).

**CTX-3** — **NON DEVE** esistere alcuna istanza di servizio esportata a livello di modulo. Un
`export const rng = new Rng()` è una violazione.

**CTX-4** — **DEVE** essere possibile creare **due o più GameContext indipendenti** nello stesso
processo, senza che l'uno osservi gli effetti dell'altro. È il test che dimostra l'assenza di stato
globale (ARC-8.3).

**CTX-5** — L'ordine di costruzione **DEVE** essere derivabile staticamente: se il grafo richiede
una costruzione circolare, il progetto è sbagliato e **DEVE** essere corretto, non risolto con
inizializzazione differita.

**CTX-6** — `dispose()` **DEVE** rilasciare tutte le risorse e annullare tutte le sottoscrizioni:
dopo `dispose()`, un contesto **NON DEVE** reagire ad alcun evento né trattenere memoria.

**CTX-7** — Il contesto **DEVE** poter essere costruito in modalità **headless**, senza renderer,
senza canvas e senza asset: è la modalità usata dai test di sistema (ARC-1.4).

**CTX-8** — Ogni dipendenza **DEVE** essere sostituibile con un fake in fase di costruzione, senza
modificare il codice del servizio che la riceve.

**CTX-9** — Il contesto **DEVE** esporre una `serialize()` che delega a ciascun servizio la propria
porzione di stato, e una costruzione da salvataggio che la ripercorre (vedi `SAVE`).

**CTX-10** — La configurazione e il contenuto **DEVONO** essere caricati e **validati prima** della
costruzione del contesto: un contesto **NON DEVE** mai esistere in stato parzialmente valido.

**CTX-11** — Il contesto **NON DEVE** contenere stato di interfaccia (selezione, schermata attiva,
focus): quello appartiene alla presentazione (ARC-8.4).

## Criteri di test

- Due contesti creati con seed diversi divergono; con lo stesso seed e gli stessi input coincidono.
- Dopo `dispose()`, nessun handler risulta registrato sul bus.
- Un contesto costruito interamente con fake permette di esercitare l'orchestrazione senza servizi
  reali.
- La creazione con contenuto non valido fallisce prima di istanziare qualunque servizio.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-8 (niente stato globale), ARC-4 (servizi muti)
- [`config.md`](./config.md) · [`persistence.md`](./persistence.md) · [`event-bus.md`](./event-bus.md)

# BUS — EventBus

**Area:** Core · **Natura:** generico · **Priorità:** 1 · **Stato:** proposto
**Prefisso requisiti:** `BUS-*`

## Scopo

Trasportare gli **eventi di dominio** — notifiche immutabili di fatti già avvenuti — da chi li
produce a chi vi reagisce, senza che i due si conoscano. È l'unico canale di comunicazione
*indiretta* del sistema: le chiamate dirette esistono, ma solo dall'orchestrazione verso i servizi.

Il bus **non** è un canale di comando e **non** è un canale di query: non trasporta richieste, non
restituisce valori, non attende risposte.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, DOM, qualunque altro servizio |
| Consumato da | `game/orchestration`, `presentation` |
| Stato dinamico | nessuno (il bus non conserva stato tra i tick, salvo la coda in corso) |
| Stato statico | nessuno |
| Dati esterni | nessuno |
| Eventi emessi | nessuno (è l'infrastruttura) |
| Ordine di grandezza | ~10³ eventi/secondo senza degrado percettibile |

## API pubblica (indicativa)

```ts
type DomainEvent = { readonly type: string; readonly [k: string]: unknown };

interface EventBus<E extends DomainEvent> {
  /** Sottoscrive un tipo di evento. Restituisce la funzione di disiscrizione. */
  on<T extends E['type']>(type: T, handler: (e: Extract<E, { type: T }>) => void): () => void;
  /** Sottoscrive ogni evento: per logging, replay e strumenti di debug. */
  onAny(handler: (e: E) => void): () => void;
  /** Accoda un evento per la consegna. Non esegue gli handler immediatamente. */
  publish(event: E): void;
  publishAll(events: readonly E[]): void;
  /** Consegna tutti gli eventi in coda, inclusi quelli generati durante la consegna. */
  flush(): void;
}
```

## Requisiti

**BUS-1** — Gli eventi **DEVONO** formare una **union discriminata** su `type`, chiusa e nota a
compilazione. Sottoscrivere un tipo inesistente **DEVE** essere un errore di compilazione.

**BUS-2** — Ogni evento **DEVE** essere serializzabile in JSON: niente funzioni, riferimenti runtime,
`Map`, `Set`, `Date` o classi nel payload. Le entità sono referenziate per `EntityId` (ARC-5.2).

**BUS-3** — Gli eventi **DEVONO** essere **immutabili** e descrivere un fatto **già avvenuto**, al
passato (`entity-died`, non `kill-entity`). Un evento **NON DEVE** mai essere usato per chiedere
un'azione.

**BUS-4** — La consegna **DEVE** essere **differita e ordinata**: `publish()` accoda, `flush()`
consegna in ordine FIFO. Non è ammessa la consegna sincrona dentro `publish()`, che renderebbe
l'ordine dipendente dalla profondità di ricorsione.

**BUS-5** — Gli eventi pubblicati **durante** un `flush()` **DEVONO** essere accodati e consegnati
nello stesso `flush()`, dopo quelli già in coda, fino a svuotamento.

**BUS-6** — A parità di evento, gli handler **DEVONO** essere invocati nell'ordine di
sottoscrizione. Questo, con BUS-4 e BUS-5, rende la consegna **deterministica** (ARC-9).

**BUS-7** — **DEVE** esistere un limite configurabile di iterazioni di `flush()` (default: 32); al
superamento il bus **DEVE** fallire in modo diagnostico, riportando i tipi di evento coinvolti nel
ciclo, invece di bloccare il gioco.

**BUS-8** — Un'eccezione lanciata da un handler **NON DEVE** impedire l'esecuzione degli altri
handler: **DEVE** essere catturata, riportata e, in sviluppo, ripropagata a fine `flush()`.

**BUS-9** — Il bus **NON DEVE** conoscere né importare alcun tipo di dominio: è parametrico sul tipo
unione degli eventi, fornito da chi lo istanzia.

**BUS-10** — `onAny` **DEVE** consentire di registrare l'intero flusso di eventi in un journal, per
diagnostica e per la riproduzione di una sessione (vedi `SAVE`, `RND`).

**BUS-11** — In modalità sviluppo il bus **DOVREBBE** poter registrare, per ogni evento, chi lo ha
pubblicato, così da rendere leggibile la catena causale.

**BUS-12** — Nessun servizio **DEVE** sottoscrivere il bus (ARC-4.3). La regola **DEVE** essere
imposta da lint: `EventBus` non compare tra i parametri del costruttore dei servizi.

## Criteri di test

- FIFO rispettato con pubblicazioni annidate a più livelli.
- Ordine di invocazione stabile a parità di sottoscrizioni.
- Il ciclo di eventi produce un errore diagnostico entro il limite, non un blocco.
- Un handler che lancia non interrompe gli altri.
- Una sequenza `publish` → `flush` registrata con `onAny` è riproducibile identica.
- Il bus funziona con una union di eventi inventata, estranea a questo gioco (ARC-3.4).

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-4 (servizi muti), ARC-5 (eventi e riferimenti)
- [`game-context.md`](./game-context.md) — chi possiede l'istanza del bus
- [`persistence.md`](./persistence.md) — journal degli eventi e riproducibilità

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
| Dipende da | — · i parametri arrivano **già validati nel costruttore**: il servizio non legge file (ARC-4.1, CTX-10) |
| NON dipende da | `excalibur`, `Math.random()`, `Math.log`/`Math.cos`/`Math.pow`, altri servizi |
| Consumato da | `CBT`, `LOOT`, `GEN`, `AI`, orchestrazione |
| Stato dinamico | seed radice · stato dei soli stream **toccati**, col seed esplicito se passato · pesi correnti per canale |
| Stato statico | profili di filtro e regole di risoluzione canale→profilo |
| Dati esterni | **facoltativi**; il gioco li tiene in `game/balance/random.json`: profili, regole, tetto dei canali |
| Eventi emessi | nessuno |
| Ordine di grandezza | ~10⁴ estrazioni/secondo durante la generazione di una mappa; ~10⁶ campioni di `noise2` per mappa generata |

## API pubblica (indicativa)

```ts
type StreamId = string;  // 'combat' | 'loot' | 'worldgen' | 'ai' | …

interface RandomService {
  /**
   * Ogni stream ha uno stato proprio: consumare da uno non altera gli altri.
   * Il seed è `hash(seed radice, id)`, oppure quello passato. La stessa `id`
   * restituisce sempre la **stessa istanza** (RND-19).
   */
  stream(id: StreamId, seed?: number): RandomStream;

  /** Dimentica la memoria di un canale: l'entità che lo usava non esiste più (RND-20). */
  forget(channel: string): void;

  /** Diagnostica: canali vivi e profilo di filtro risolto per ciascuno (RND-21). */
  channels(): readonly { channel: string; profile: string }[];

  serialize(): RandomState;
}

/** Il ripristino è per costruzione, mai per metodo d'istanza (RND-22). */
declare class Random implements RandomService {
  static deserialize(state: RandomState): RandomService;
}

interface RandomStream {
  next(): number;                                   // [0, 1)
  int(minIncl: number, maxExcl: number): number;
  bool(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: readonly { value: T; weight: number }[]): T;
  shuffle<T>(items: readonly T[]): T[];

  /** Normale per somma di uniformi, opzionalmente troncata. Non Box–Muller: vedi RND-6. */
  gaussian(mean: number, stdDev: number, clamp?: [number, number]): number;

  /** Estrazione filtrata sul canale: i pesi degli esiti recenti sono ridotti (RND-9). */
  filtered<T>(channel: string, entries: readonly { value: T; weight: number }[]): T;

  /** Rumore coerente. Funzione pura di (seed dello stream, coordinate): non consuma (RND-18). */
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

**RND-4** — L'algoritmo di base **DEVE** essere **`xoshiro128**`**, esplicito, documentato e
congelato: non l'implementazione del motore JavaScript, e non PCG32, che richiede moltiplicazioni a
64 bit e quindi `BigInt`, che alloca a ogni operazione (ARC-13.3). Sono parte dello stesso contratto
di stabilità, e cambiarli invalida ogni salvataggio e ogni mappa da seed:

1. il PRNG;
2. la **funzione di hash sulle stringhe** che deriva i seed degli stream (RND-19);
3. il divieto di **funzioni trascendenti** su tutto il percorso deterministico.

Il punto 3 non è una preferenza stilistica. ECMAScript specifica esattamente `+ - * /`,
`Math.floor`, `Math.sqrt` e `Math.imul`, ma lascia `Math.log`, `Math.cos`, `Math.sin`, `Math.exp` e
`Math.pow` *implementation-approximated*: motori diversi restituiscono ultimi bit diversi. Un
aggiornamento del browser non **DEVE** cambiare le partite, quindi quelle funzioni non **DEVONO**
comparire in nessun cammino che produce valori.

**RND-5** — Il servizio **DOVREBBE** poter derivare uno stream figlio deterministico da una chiave
(`derive('chunk:12,7')`), così che la generazione di una porzione di mondo sia riproducibile
indipendentemente dall'ordine in cui le porzioni vengono generate. **Non è realizzato**: l'unico
richiedente è GEN-9, in un servizio di priorità 3 la cui API genera una mappa intera per chiamata, e
la generazione a chunk non è nei piani attuali. Il seeding per hash di RND-19 rende l'aggiunta
**additiva**: uno stream derivato non altera il seed di nessuno stream esistente, quindi realizzarlo
in seguito non romperà né salvataggi né mappe.

### Forme statistiche

**RND-6** — Il servizio **DEVE** esporre una sorgente **gaussiana** parametrica (media, deviazione
standard) con troncamento opzionale, per le grandezze che devono addensarsi attorno a un valore
centrale: variazione del danno, dispersione dei colpi, jitter delle attese, imprecisione dei PNG.

L'implementazione **DEVE** essere una **somma di uniformi** (Irwin–Hall: dodici estrazioni meno sei,
media 0 e σ 1 esatte), **non Box–Muller**, che usa `Math.log` e `Math.cos` e violerebbe RND-4. Il
prezzo è duplice e accettato: dodici estrazioni per campione, e code troncate a ±6σ. Nessuno degli
usi elencati sopra ha significato oltre 6σ, e RND-6 offre comunque il troncamento esplicito.

**RND-7** — Il servizio **DEVE** esporre **rumore coerente e continuo** (Perlin o simplex) in 2D,
con supporto a più ottave (fBm), per la generazione procedurale: altimetria, biomi, densità di
risorse, variazioni ambientali. Il rumore **DEVE** dipendere in modo deterministico da seed e
coordinate, non dall'ordine di campionamento. **PUÒ** offrire simplex in alternativa a Perlin.

Le ottave di fBm **NON DEVONO** usare `Math.pow` per la lacunarità (RND-4): la frequenza si ottiene
per moltiplicazione ripetuta. È un dettaglio d'implementazione, ma è quello da cui dipende se GEN-2
(«identica bit per bit dopo un aggiornamento del browser») è vero o falso.

**RND-8** — Il servizio **DEVE** esporre l'estrazione pesata (`weighted`) come primitiva: le loot
table e le scelte di IA non **DEVONO** reimplementarla.

### Casualità filtrata (casualità percepita)

**RND-9** — Il servizio **DEVE** offrire una modalità di estrazione **filtrata**, che per ogni
**canale** (loot di quel nemico, esito dei colpi di quell'arma, spawn di quell'area) mantiene i
**pesi correnti** dei suoi esiti: ciò che è appena uscito vede il proprio peso ridotto, e lo recupera
nel corso delle estrazioni successive.

Il meccanismo **DEVE** essere il riaggiustamento dei pesi, **non la riestrazione**, per due ragioni.
La riestrazione penalizza sistematicamente gli esiti frequenti — che sono quelli che si ripetono — e
sposta la distribuzione in modo non controllabile; e soprattutto crea un **pattern nuovo**: «mai due
volte di fila» è una regola che il giocatore impara e sfrutta, e sostituisce una sequenza che sembra
ingiusta con una che è prevedibile. Il riaggiustamento dei pesi non fa né l'una né l'altra cosa:
sette teste di fila restano possibili, ma la loro probabilità crolla di ordini di grandezza.

**RND-10** — **Fattore di riduzione** del peso e **velocità di recupero** **DEVONO** essere
data-driven (ARC-7.1) e organizzati in **profili**. Poiché i nomi dei canali sono inventati dal
chiamante a runtime (RND-15) e non possono essere elencati in un file, la risoluzione da canale a
profilo **DEVE** avvenire **per prefisso**, con un profilo di default obbligatorio:

```json
{
  "tettoCanali": 512,
  "default": "neutro",
  "profili": {
    "neutro":        { "riduzione": 0.60, "recupero": 2 },
    "scassinamento": { "riduzione": 0.25, "recupero": 5 }
  },
  "regole": [
    { "canale": "lockpick:*", "profilo": "scassinamento" }
  ]
}
```

La risoluzione **DEVE** avvenire una volta sola, alla nascita del canale, e restare memorizzata con
il suo stato: nessun costo per estrazione.

**RND-11** — *Ritirato.* Imponeva la terminazione del filtro entro un numero massimo di
riestrazioni. Con il riaggiustamento dei pesi (RND-9) non esiste alcun ciclo di riestrazione, quindi
non c'è terminazione da garantire, né il caso limite «un solo esito possibile». L'identificatore non
viene riusato (vedi `README.md`).

**RND-12** — *Ritirato.* Offriva il riaggiustamento dei pesi come alternativa **DOVREBBE** alla
riestrazione. È stato assorbito in RND-9, che ora *è* il riaggiustamento dei pesi. L'identificatore
non viene riusato.

**RND-13** — Lo stato dei canali **DEVE** essere serializzato: ricaricare un salvataggio **NON DEVE**
azzerare la memoria anti-ripetizione, altrimenti il salvataggio diventa un modo per manipolare gli
esiti.

**RND-14** — La documentazione di ogni canale **DEVE** dichiarare quale tecnica usa e perché: le
tecniche vanno applicate **dove servono**, non ovunque. Il danno critico di un boss e il colore di
un fiore non hanno gli stessi requisiti.

**RND-15** — La granularità del canale **DEVE** essere una **scelta del programmatore del gioco**,
non imposta dal servizio: è chi usa `filtered(channel, …)` a decidere quando una determinata entità
merita una sequenza filtrata propria e quando può condividerne una. Passando un `channel` più
specifico (`'lockpick:door:42'`, `'hits:enemyA'`) si ottiene una memoria anti-ripetizione dedicata a
quell'entità; passando un `channel` più generico (`'lockpick'`) le entità condividono la stessa
memoria. Il servizio **NON DEVE** desumere la granularità dal tipo di entità né imporre un canale
per-istanza di default: si limita a mantenere uno stato distinto per ogni `channel` distinto (RND-9)
e a serializzarlo (RND-13). La scelta della chiave — e quindi del confine tra le sequenze — resta
responsabilità del chiamante.

**RND-20** — Poiché RND-15 permette canali per-istanza e nessun requisito ne prevedeva la rimozione,
lo stato dei canali crescerebbe senza limite superiore: la porta scassinata una volta e il nemico
morto alla seconda ora resterebbero nel salvataggio fino alla fine della partita. Il servizio
**DEVE** quindi:

1. mantenere al massimo **N canali**, con N data-driven (RND-10), sfrattando il canale usato **meno
   di recente** quando il tetto viene superato;
2. esporre **`forget(channel)`** per il chiamante che *sa* che l'entità non esiste più.

L'ordine di sfratto **DEVE** essere deterministico: si usa il **contatore delle estrazioni** del
servizio, mai l'orologio di sistema (ARC-9.3), e i pari merito si rompono con il nome del canale, per
avere un ordine totale. Uno sfratto azzera la memoria di quel canale — ciò contro cui RND-13 mette in
guardia — ma la differenza è che qui è deterministico e non dipende dal salvare e ricaricare: non è
una leva nelle mani del giocatore.

**RND-21** — La configurazione **DEVE** essere **facoltativa**, e in sua assenza il filtro **DEVE**
essere inattivo: `filtered()` si comporta esattamente come `weighted()`. Non è un default di
bilanciamento mascherato — ARC-3.2 vieta a un servizio generico di contenerne — è l'assenza della
funzionalità, e serve al test di riusabilità (ARC-3.4), che non avrà nessun `random.json`.

Poiché un canale non configurato *sembra* filtrato senza esserlo, il servizio **DEVE** esporre
`channels()`, che elenca i canali vivi e il profilo risolto per ciascuno.

### Struttura

**RND-16** — Gaussiana, rumore coerente e filtro **DEVONO** derivare dal **seed radice**, non da
sorgenti indipendenti: garantisce che RND-1 valga per tutti. *Derivare* dal seed non significa
*consumare* lo stream — vedi RND-18, che distingue i due casi.

**RND-17** — L'impurità **DEVE** essere confinata a due sole operazioni: avanzare lo stato di uno
stream, e aggiornare i pesi di un canale. Ogni **trasformazione** (uniforme→intero,
uniforme→gaussiana, pesi→scelta, coordinate→rumore) **DEVE** essere una funzione pura dei propri
ingressi, collaudabile senza generatore. `noise2` e `fbm2` **DEVONO** essere pure per intero: non
leggono né scrivono stato.

**RND-18** — Quali primitive avanzano lo stato di uno stream **DEVE** essere parte del contratto,
non un dettaglio d'implementazione:

| Primitiva | Consuma lo stream | Perché |
|---|---|---|
| `next` `int` `bool` `pick` `weighted` `shuffle` | **sì** | *sono* la sequenza |
| `gaussian` | **sì** (12 estrazioni) | è una trasformazione di uniformi |
| `filtered` | **sì** (una) | estrae dai pesi correnti |
| `noise2` `fbm2` | **no** | funzioni pure di (seed dello stream, x, y) |

Il rumore ottiene la propria tabella di permutazione **una volta**, dallo stream, alla creazione
dello stream. Da lì in poi non avanza nulla. È questo che rende vero RND-7 («non dall'ordine di
campionamento») senza contraddire RND-16.

**RND-19** — Il seed di uno stream **DEVE** essere `hash(seed radice, id)`, oppure il seed esplicito
passato a `stream(id, seed)`. **NON DEVE** dipendere dall'ordine di creazione: con seed assegnati per
posizione, aggiungere una `stream('ambient')` per un effetto visivo rinumererebbe tutti gli stream
successivi e romperebbe ogni salvataggio e ogni mappa da seed esistenti.

`stream(id)` **DEVE** restituire sempre la **stessa istanza**: due oggetti distinti creati dallo
stesso id partirebbero dalla stessa posizione e produrrebbero gli stessi numeri, dando a due
chiamanti che si credono indipendenti tiri identici.

Un seed esplicito **DEVE** essere serializzato insieme allo stato dello stream (RND-22): il
ripristino non **DEVE** dipendere dal fatto che il gioco ripassi lo stesso numero.

**RND-22** — Il servizio **DEVE** esporre `serialize()` e una **fabbrica statica**
`deserialize(state): RandomService`. Il ripristino **NON DEVE** essere un metodo d'istanza: esisterebbe
un istante in cui il servizio è costruito ma contiene la casualità della partita sbagliata, e chi
tirasse un dado in quell'istante tirerebbe dalla partita nuova (CTX-9, CTX-10).

Si serializza solo ciò che non è ricostruibile dal seed:

| | Nel salvataggio | Perché |
|---|---|---|
| versione dello stato | **sì** | ARC-10.2 |
| seed radice | **sì** | tutto il resto ne discende |
| stato del PRNG di ogni stream **toccato** | **sì** | è la posizione nella sequenza |
| seed esplicito di uno stream, se passato | **sì** | RND-19 |
| pesi correnti, per canale vivo | **sì** | RND-13 |
| stream mai richiesti | no | il seed è `hash(seed radice, id)` |
| tabella di permutazione del rumore | no | ricostruita dal seed dello stream |

Il salvataggio di `RND` cresce quindi con gli stream usati e i canali vivi (limitati da RND-20), non
con il tempo di gioco.

## Criteri di test

- **Riproducibilità**: due istanze con lo stesso seed producono sequenze identiche su 10⁶ estrazioni.
- **Riproducibilità tra motori** (RND-4): **vettori d'oro** — una lista di valori attesi salvata nel
  repo per `next`, `int`, `gaussian`, `noise2` e `fbm2`, verificata su **chromium, firefox e webkit**
  con Playwright. Senza questo, RND-4 non è collaudato da niente: «due istanze con lo stesso seed»
  gira su un motore solo e passa sempre.
- **Indipendenza degli stream**: consumare 1000 valori da `ai` non altera la sequenza di `combat`.
- **Indipendenza dalla creazione** (RND-19): creare uno stream nuovo non altera la sequenza di
  nessun altro; `stream(id)` chiamato due volte restituisce la stessa istanza.
- **Uniformità**: test del χ² su bucket per `next()` e `int()`.
- **Gaussiana**: media e deviazione standard campionarie entro tolleranza su 10⁵ campioni; il
  troncamento non sposta la media oltre il limite dichiarato; nessun campione oltre ±6σ (RND-6).
- **Rumore**: continuità (differenza limitata tra campioni vicini), determinismo per coordinata,
  indipendenza dall'ordine di campionamento; campionare il rumore non altera la sequenza dello
  stream (RND-18).
- **Filtro**: su 10⁴ estrazioni le ripetizioni consecutive crollano rispetto all'estrazione pesata
  non filtrata; **monotonia** — se `w(a) > w(b)` allora `freq(a) ≥ freq(b)`; e **vettore d'oro della
  distribuzione**, confrontata con una distribuzione attesa salvata nel repo per una configurazione
  fissata. *Non* si asserisce che la distribuzione resti entro tolleranza dai **pesi nominali**: il
  filtro la sposta per costruzione, ed è il suo mestiere.
- **Sfratto** (RND-20): superato il tetto, viene sfrattato il canale usato meno di recente, in modo
  deterministico e indipendente dall'ordine di iterazione.
- **Serializzazione**: salvare, estrarre 100 valori, ricaricare, riestrarre → stessi 100 valori.
- **Riusabilità** (ARC-3.4): il servizio funziona con canali e distribuzioni inventati, estranei a
  questo gioco, e **senza alcun file di configurazione** (RND-21).

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-9 (determinismo)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-19 (formula del danno), GP-25 (loot table)
- [`adr/0001-riproducibilita-bit-per-bit.md`](../adr/0001-riproducibilita-bit-per-bit.md) ·
  [`adr/0002-riaggiustamento-dei-pesi.md`](../adr/0002-riaggiustamento-dei-pesi.md)
- [`loot.md`](./loot.md) · [`map-generation.md`](./map-generation.md) · [`combat.md`](./combat.md)

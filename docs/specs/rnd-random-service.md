# Spec — `RND`, servizio di casualità

**Servizio:** `RND` · **Priorità:** 1 · **Scheda:** [`services/random.md`](../services/random.md)
**ADR:** [`0001`](../adr/0001-riproducibilita-bit-per-bit.md) ·
[`0002`](../adr/0002-riaggiustamento-dei-pesi.md)

## Problem Statement

Il gioco non ha ancora una sorgente di casualità, e ogni sistema che verrà dopo — combattimento,
bottino, generazione delle mappe, IA — ne dipende. Se ognuno chiamasse `Math.random()` per conto
proprio nascerebbero quattro problemi che si scoprono tardi e si pagano con una riscrittura:

1. **Le partite non si possono riprodurre.** Un bug segnalato da un giocatore non è riproducibile,
   un salvataggio non riprende esattamente da dove si era interrotto, e una mappa generata da seed
   non è la stessa mappa dopo un aggiornamento del browser.
2. **I sistemi si contaminano a vicenda.** Aggiungere un effetto visivo casuale sposta la sequenza
   consumata dal combattimento, e l'esito di uno scontro cambia per una ragione che non c'entra
   nulla con il combattimento.
3. **Manca la forma statistica giusta.** La variazione del danno vuole addensarsi attorno a un
   valore centrale, non essere piatta; l'altimetria di una mappa vuole essere continua, non
   granulosa. Con la sola uniforme, ogni sistema improvvisa la propria approssimazione.
4. **La casualità corretta è percepita come rotta.** Sette teste di fila sono un risultato
   legittimo di una moneta equa, ma il giocatore che vede cadere lo stesso oggetto sette volte
   scrive che il gioco è bacato. Il problema non è il generatore: è che casualità matematicamente
   corretta e casualità *percepita come tale* sono cose diverse, e un gioco ha bisogno di entrambe.

Nessuno di questi si risolve dopo. Il determinismo e l'indipendenza degli stream sono proprietà
strutturali: aggiungerle a sistemi già scritti significa riscriverli.

## Solution

Un servizio `RND` — **generico**, senza alcuna conoscenza di questo gioco — che è l'unica sorgente di
casualità del progetto, e che offre quattro cose dietro un'API sola:

- **Stream indipendenti per dominio d'uso.** Il combattimento, il bottino, la generazione e l'IA
  consumano sequenze separate. Ognuna è seedata dal **seed radice** attraverso l'hash del proprio
  nome, quindi aggiungere uno stream nuovo non tocca gli altri e non invalida i salvataggi.
- **Riproducibilità bit-per-bit, anche tra motori JavaScript diversi.** Il generatore è congelato
  (`xoshiro128**`), e nessuna funzione trascendente di `Math` compare sul percorso che produce
  valori, perché ECMAScript non ne specifica il risultato esatto. Vedi ADR 0001.
- **Le forme statistiche che i sistemi chiedono**: gaussiana troncabile per le grandezze che si
  addensano attorno a un valore, rumore coerente 2D e fBm per la generazione procedurale, estrazione
  pesata come primitiva.
- **Casualità filtrata per canale.** Il chiamante dichiara un **canale**; il servizio ne tiene la
  **memoria di canale** — il peso corrente di ogni esito — e riduce il peso di ciò che è appena
  uscito, facendolo poi recuperare. Le sequenze che sembrano rotte diventano improbabili senza
  introdurre una regola che il giocatore possa imparare e sfruttare. Vedi ADR 0002.

Tutto lo stato dinamico è serializzabile e ripristinabile per costruzione, così che ricaricare una
partita riprenda le sequenze dal punto esatto e non azzeri la memoria anti-ripetizione.

Essendo il primo servizio del progetto, questo spec include anche l'impalcatura di test che ARC-11.1
richiede e che oggi non esiste.

## User Stories

### Riproducibilità

1. Come **programmatore del gioco**, voglio che due partite avviate con lo stesso seed radice e la
   stessa sequenza di input producano lo stesso risultato, così da poter riprodurre un bug da una
   segnalazione invece che da una descrizione.
2. Come **programmatore del gioco**, voglio che nessun punto del progetto possa chiamare
   `Math.random()`, così che il determinismo non dipenda dalla disciplina di chi scrive il codice.
3. Come **manutentore del motore**, voglio che l'algoritmo del generatore sia scelto, documentato e
   congelato, così che un aggiornamento del browser non cambi le partite dei giocatori.
4. Come **manutentore del motore**, voglio che le funzioni trascendenti di `Math` siano vietate sul
   percorso deterministico, così che la promessa di riproducibilità valga anche tra motori diversi e
   non solo sulla mia macchina.
5. Come **manutentore del motore**, voglio che il divieto sia imposto da un controllo automatico,
   così che non rientri da una modifica distratta mesi dopo.
6. Come **giocatore**, voglio che una mappa generata da un seed sia la stessa mappa domani, così da
   poter condividere un seed con un altro giocatore e parlare dello stesso mondo.

### Stream

7. Come **programmatore del gioco**, voglio ottenere uno stream per dominio d'uso, così che il
   combattimento e il bottino non consumino la stessa sequenza.
8. Come **programmatore del gioco**, voglio che consumare numeri in uno stream non alteri la
   sequenza degli altri, così da poter aggiungere un effetto visivo casuale senza cambiare l'esito
   di uno scontro.
9. Come **programmatore del gioco**, voglio che il seed di uno stream dipenda dal suo **nome** e non
   dall'ordine in cui gli stream vengono creati, così che introdurre uno stream nuovo non rinumeri
   tutti gli altri e non rompa i salvataggi esistenti.
10. Come **programmatore del gioco**, voglio che chiedere lo stesso stream due volte restituisca la
    stessa istanza, così che due parti del codice che si credono indipendenti non ricevano tiri
    identici.
11. Come **programmatore del gioco**, voglio poter fissare a mano il seed di uno stream quando ho
    una ragione per farlo, così da non dover accettare la derivazione automatica in ogni caso.
12. Come **programmatore del gioco**, voglio che un seed fissato a mano sopravviva al salvataggio,
    così che il ripristino non dipenda dal fatto che il codice ripassi lo stesso numero.

### Forme statistiche

13. Come **programmatore del combattimento**, voglio una sorgente gaussiana parametrica su media e
    deviazione standard, così che la variazione del danno si addensi attorno al valore nominale
    invece di essere piatta.
14. Come **programmatore del gioco**, voglio poter troncare la gaussiana a un intervallo, così che
    una variazione non possa mai produrre un danno negativo o assurdo.
15. Come **programmatore del gioco**, voglio la gaussiana su jitter delle attese e imprecisione dei
    PNG, così che i comportamenti sembrino umani invece che sorteggiati.
16. Come **programmatore della generazione**, voglio rumore coerente e continuo in 2D, così da poter
    produrre altimetrie e biomi che variano con gradualità invece che a caso da cella a cella.
17. Come **programmatore della generazione**, voglio poter sommare più ottave di rumore, così da
    ottenere terreno con dettaglio a più scale.
18. Come **programmatore della generazione**, voglio che il rumore dipenda solo da seed e coordinate
    e **non** dall'ordine di campionamento, così da poter campionare le celle in qualunque ordine e
    rigenerare una porzione senza che il risultato cambi.
19. Come **programmatore del gioco**, voglio l'estrazione pesata come primitiva del servizio, così
    che le loot table e le scelte di IA non la reimplementino ciascuna a modo proprio.
20. Come **programmatore del gioco**, voglio primitive di comodo (intero in intervallo, booleano con
    probabilità, scelta da elenco, mescolamento), così da non riscrivere ogni volta le stesse
    conversioni dalla uniforme.

### Casualità filtrata

21. Come **giocatore**, voglio non vedere cadere lo stesso oggetto sette volte di fila dallo stesso
    nemico, così da non concludere che il gioco sia bacato.
22. Come **giocatore**, voglio che l'anti-ripetizione non diventi una regola prevedibile, così da
    non poter sapere in anticipo che il prossimo colpo non sarà critico.
23. Come **programmatore del gioco**, voglio dichiarare un **canale** al momento dell'estrazione,
    così da decidere io quali sequenze sono separate e quali condivise.
24. Come **programmatore del gioco**, voglio che il servizio non deduca la granularità dal tipo di
    entità, così che sia il mio codice a stabilire se ogni porta ha la sua sequenza o se tutte le
    porte ne condividono una.
25. Come **game designer**, voglio poter regolare quanto si riduce il peso di un esito appena uscito
    e in quante estrazioni lo recupera, così da poter tarare la sensazione senza ricompilare.
26. Come **game designer**, voglio raggruppare quei parametri in **profili di filtro** e assegnarli
    per prefisso del nome di canale, così da poterli applicare a canali che nascono a runtime e non
    possono essere elencati in un file.
27. Come **game designer**, voglio un profilo di default obbligatorio, così che un canale che non
    corrisponde a nessuna regola abbia comunque un comportamento definito.
28. Come **giocatore**, voglio che salvare e ricaricare non azzeri la memoria anti-ripetizione, così
    che il salvataggio non sia un modo per manipolare gli esiti.
29. Come **programmatore del gioco**, voglio che la memoria dei canali non cresca senza limite, così
    che una partita da cinquanta ore non trascini nel salvataggio le sequenze di migliaia di entità
    che non esistono più.
30. Come **programmatore del gioco**, voglio poter dichiarare esplicitamente che un canale non serve
    più, così da liberarne la memoria quando so che l'entità è morta.
31. Come **manutentore del motore**, voglio che lo sfratto automatico sia deterministico e non
    dipenda dall'orologio di sistema, così che non introduca una divergenza tra due partite altrimenti
    identiche.
32. Come **programmatore del gioco**, voglio poter elencare i canali vivi e il profilo risolto per
    ciascuno, così da accorgermi che un canale che credevo filtrato non lo è.
33. Come **programmatore del gioco**, voglio che senza configurazione il filtro sia semplicemente
    inattivo, così che il servizio funzioni in un progetto che non lo usa e nei test di riusabilità.

### Salvataggio

34. Come **giocatore**, voglio che ricaricare una partita riprenda le sequenze casuali dal punto
    esatto, così da non poter rigiocare lo stesso momento con esiti diversi.
35. Come **programmatore del gioco**, voglio che il ripristino avvenga per **costruzione** e non con
    un metodo chiamato dopo, così che non esista un istante in cui il servizio è vivo ma contiene la
    casualità della partita sbagliata.
36. Come **programmatore del gioco**, voglio che lo stato serializzato abbia un proprio numero di
    versione, così da poterlo migrare senza toccare il formato degli altri servizi.
37. Come **programmatore del gioco**, voglio che si salvi solo ciò che non è ricostruibile dal seed,
    così che il salvataggio cresca con l'uso effettivo e non con il tempo di gioco.

### Struttura e prestazioni

38. Come **programmatore del gioco**, voglio che `RND` non importi né riceva altri servizi, così che
    resti collaudabile da solo e riusabile in un altro progetto.
39. Come **programmatore del gioco**, voglio che i parametri arrivino già validati nel costruttore e
    che il servizio non legga file, così che un contenuto non valido fallisca in caricamento e non a
    metà partita.
40. Come **programmatore del gioco**, voglio poter costruire due servizi indipendenti nello stesso
    processo, così che i test non condividano stato e che due partite possano coesistere.
41. Come **programmatore della generazione**, voglio poter campionare il rumore centinaia di
    migliaia di volte per mappa senza scatti, così che la generazione non blocchi il gioco.
42. Come **manutentore del motore**, voglio che l'impurità sia confinata a due sole operazioni —
    avanzare uno stream, aggiornare la memoria di un canale — così che il resto sia ragionabile come
    trasformazione pura.

### Collaudo

43. Come **manutentore del motore**, voglio un test runner headless separato da quello di
    integrazione, così da poter collaudare i servizi senza avviare un browser.
44. Come **manutentore del motore**, voglio che la promessa di riproducibilità tra motori sia
    verificata su più motori reali, così che non resti una dichiarazione d'intenti — oggi «due
    istanze con lo stesso seed» gira su un motore solo e passa sempre.
45. Come **manutentore del motore**, voglio che il servizio sia esercitato con canali e
    distribuzioni inventati, estranei a questo gioco, così da dimostrare che è davvero generico.

## Implementation Decisions

### Moduli

- **`RND`, servizio generico**, senza dipendenze da altri servizi e senza `excalibur`. Costruito una
  volta sola nel `GameContext` (CTX-1), riceve le proprie dipendenze e i propri parametri per
  costruttore (CTX-2).
- **Nessun servizio consumatore viene toccato.** `CBT`, `LOOT`, `GEN` e `AI` non esistono ancora;
  questo spec si ferma al contratto che consumeranno.
- **Impalcatura di test**, oggi assente: un test runner headless, e un progetto di test browser che
  riutilizza la configurazione Playwright esistente.

### Contratto pubblico

Il contratto è quello fissato nella scheda `random.md`, che resta la fonte autorevole:

```ts
interface RandomService {
  stream(id: StreamId, seed?: number): RandomStream;
  forget(channel: string): void;
  channels(): readonly { channel: string; profile: string }[];
  serialize(): RandomState;
}
// ripristino per costruzione, mai per metodo d'istanza
declare function deserialize(state: RandomState): RandomService;
```

### Decisioni tecniche

1. **Generatore: `xoshiro128**`**, stato in `Uint32Array`, moltiplicazioni con `Math.imul`. Non
   PCG32: richiederebbe aritmetica a 64 bit, cioè `BigInt`, che alloca a ogni operazione. Congelato:
   cambiarlo invalida ogni salvataggio e ogni mappa da seed (ADR 0001).
2. **Seed di stream = `hash(seed radice, id)`**, con una funzione di hash sulle stringhe scelta,
   nominata e congelata insieme al generatore. L'ordine di creazione degli stream è irrilevante per
   costruzione. Un seed esplicito passato dal chiamante ha la precedenza e viene serializzato.
3. **`stream(id)` è memoizzato**: la stessa `id` restituisce la stessa istanza per tutta la vita del
   servizio.
4. **Gaussiana per somma di uniformi** (dodici estrazioni meno sei: media 0 e σ 1 esatte), non
   Box–Muller, che userebbe `Math.log` e `Math.cos`. Code troncate a ±6σ, che è oltre il significato
   di ogni uso previsto (ADR 0001).
5. **Rumore coerente 2D con tabella di permutazione** costruita **una volta sola**, dallo stream,
   alla creazione dello stream. Da lì in poi `noise2` e `fbm2` sono funzioni pure di (seed, x, y) e
   **non avanzano lo stato dello stream**: è questa la proprietà che rende il campionamento
   indipendente dall'ordine. La lacunarità delle ottave si applica per moltiplicazione ripetuta, mai
   con `Math.pow`.
6. **Tabella di consumo come parte del contratto**: `next`, `int`, `bool`, `pick`, `weighted`,
   `shuffle`, `gaussian` e `filtered` avanzano lo stream; `noise2` e `fbm2` no.
7. **Casualità filtrata per riaggiustamento dei pesi**, mai per riestrazione: la memoria di canale
   contiene il peso corrente di ogni esito, ridotto all'uscita e recuperato nel corso delle
   estrazioni successive. Nessun ciclo di riestrazione, quindi nessuna terminazione da garantire
   (ADR 0002).
8. **Risoluzione canale → profilo per prefisso**, risolta **una volta** alla nascita del canale e
   memorizzata con il suo stato: nessun costo di matching per estrazione. Forma dei dati:

   ```json
   {
     "tettoCanali": 512,
     "default": "neutro",
     "profili": {
       "neutro":        { "riduzione": 0.60, "recupero": 2 },
       "scassinamento": { "riduzione": 0.25, "recupero": 5 }
     },
     "regole": [ { "canale": "lockpick:*", "profilo": "scassinamento" } ]
   }
   ```

9. **Configurazione facoltativa.** In sua assenza il filtro è inattivo e `filtered()` si comporta
   come `weighted()`. Non è un default di bilanciamento nascosto in un servizio generico: è
   l'assenza della funzionalità.
10. **Validazione dei parametri.** `RND` non legge file. Espone la **forma attesa** della propria
    configurazione perché il caricatore del gioco la validi prima della costruzione del contesto
    (ARC-7.2, CTX-10). Serve una libreria di validazione a schema, oggi non tra le dipendenze.
11. **Tetto ai canali con sfratto LRU deterministico**, più `forget(channel)` esplicito. La recenza
    si misura con il **contatore delle estrazioni** del servizio, mai con l'orologio di sistema
    (ARC-9.3); i pari merito si rompono con il nome del canale, per avere un ordine totale.
12. **Serializzazione**: versione, seed radice, stato dei soli stream toccati (con il seed esplicito
    se presente), pesi correnti dei canali vivi. Fuori: stream mai richiesti, tabelle di
    permutazione, qualunque valore ricostruibile dal seed. Ripristino tramite fabbrica statica.
13. **Nessun `derive()`.** L'unico richiedente è GEN-9, in un servizio di priorità 3 la cui API
    genera una mappa intera per chiamata, e la generazione a chunk non è nei piani. Il seeding per
    hash rende l'aggiunta futura additiva: non altererà il seed di nessuno stream esistente.
14. **Controllo automatico dei divieti.** Una regola di lint deve vietare `Math.random()` fuori da
    `RND` (ARC-9.2) e `Math.log`, `Math.cos`, `Math.sin`, `Math.exp`, `Math.pow` dentro `RND` e in
    ogni cammino deterministico. Senza, l'ADR 0001 è solo un proposito.

### Numeri deliberatamente non fissati

Il tetto dei canali e i parametri dei profili (riduzione, recupero) sono **dati**, non decisioni di
questo spec. I valori nell'esempio sono segnaposto plausibili, non tarati: si tarano osservando le
sequenze prodotte, non ragionandoci sopra.

## Testing Decisions

### Cosa rende buono un test qui

Un test deve esercitare **solo il comportamento esterno**: entra da `RND` costruito e ne osserva i
valori. Non deve conoscere la struttura interna del generatore, la forma della memoria di canale, né
il nome delle funzioni di trasformazione. Il criterio pratico: se il test si rompe quando
l'implementazione del rumore viene sostituita da simplex a parità di contratto, il test è sbagliato.

L'eccezione, deliberata, sono i **vettori d'oro**: lì l'esattezza dei valori *è* il contratto (ADR
0001), e un test che si rompe quando l'implementazione cambia sta facendo esattamente il suo mestiere.

### Seam

**Uno solo: la costruzione del servizio.** Ogni test costruisce un `RND` con un seed (e, dove
serve, una configurazione) e verifica proprietà osservabili dall'esterno. Non viene introdotto
nessun punto d'ingresso di livello più basso: né funzioni di trasformazione esportate, né sorgente
uniforme iniettabile.

La conseguenza va dichiarata: le proprietà che riguardano una singola trasformazione si possono
verificare **solo statisticamente**, con campioni grandi, e mai con asserzioni esatte su un ingresso
scelto. In particolare, la clausola di RND-17 sulla collaudabilità delle trasformazioni «senza
generatore» **non viene esercitata**: resta una regola di progetto, non un fatto verificato.

Un secondo punto d'ingresso resta inevitabile per RND-4: la riproducibilità **tra motori** non è
osservabile da un solo motore. I vettori d'oro vengono quindi eseguiti anche dentro i browser.

### Infrastruttura da introdurre

- **Test runner headless** (Vitest, coerente con Vite già in uso), separato dai test di integrazione
  — ARC-11.1 lo richiede e oggi non esiste.
- **Riabilitazione di firefox e webkit** nella configurazione Playwright: oggi sono commentati e
  gira il solo chromium, quindi qualunque test cross-engine passerebbe senza dimostrare nulla.
- **Una pagina di prova** che esegue i vettori d'oro nel browser e ne espone l'esito, raggiunta dal
  test Playwright.

### Cosa viene collaudato

| Proprietà | Come |
|---|---|
| Riproducibilità | due istanze con lo stesso seed, sequenze identiche su 10⁶ estrazioni |
| Riproducibilità tra motori (RND-4) | vettori d'oro versionati nel repo per `next`, `int`, `gaussian`, `noise2`, `fbm2`, eseguiti su chromium, firefox e webkit |
| Indipendenza degli stream | consumare 1000 valori da uno non altera la sequenza di un altro |
| Indipendenza dalla creazione (RND-19) | creare uno stream nuovo non altera nessun altro; `stream(id)` due volte → stessa istanza |
| Uniformità | χ² su bucket per `next` e `int` |
| Gaussiana | media e σ campionarie entro tolleranza su 10⁵ campioni; il troncamento non sposta la media oltre il limite dichiarato; nessun campione oltre ±6σ |
| Rumore | continuità tra campioni vicini, determinismo per coordinata, indipendenza dall'ordine; campionare non altera la sequenza dello stream |
| Filtro | le ripetizioni consecutive crollano rispetto all'estrazione pesata non filtrata; **monotonia** (`w(a) > w(b)` ⇒ `freq(a) ≥ freq(b)`); **vettore d'oro della distribuzione** misurata per una configurazione fissata |
| Sfratto | superato il tetto viene sfrattato il canale meno recente, in modo deterministico e indipendente dall'ordine di iterazione |
| Serializzazione | salvare, estrarre 100 valori, ricaricare, riestrarre → stessi 100 valori |
| Riusabilità (ARC-3.4) | canali e distribuzioni inventati, e **senza alcun file di configurazione** |

**Non** si asserisce che la distribuzione a lungo termine del filtro resti entro tolleranza dai pesi
nominali: il filtro la sposta per costruzione, ed è il suo mestiere. Una tolleranza abbastanza larga
da far passare quel test lo renderebbe privo di significato (ADR 0002).

### Prior art

Nessuna per i test unitari: `RND` è il primo servizio e il runner headless non esiste ancora, quindi
questo spec fissa anche la convenzione per chi verrà dopo. L'unico test esistente è uno snapshot
visivo Playwright sulla pagina principale, che è prior art solo per la parte browser: stessa
configurazione, stesso `webServer`, un progetto in più.

## Out of Scope

- **`derive()` e la generazione a chunk** (RND-5, GEN-9). Rimandati; l'aggiunta sarà additiva.
- **Rumore 3D**, e simplex come alternativa a Perlin: RND-7 lo consente (**PUÒ**), non lo richiede.
- **Il meccanismo di pietà**: è una regola di gioco del bottino (LOOT-6), non una tecnica di
  casualità. Vive in `LOOT` e non tocca `RND`.
- **I servizi consumatori.** `CBT`, `LOOT`, `GEN` e `AI` non vengono scritti né modificati.
- **Il formato del file di salvataggio.** `RND` produce e consuma la propria porzione di stato con
  la propria versione; comporla, scriverla e migrarla è di `SAVE`.
- **La taratura dei profili di filtro e del tetto dei canali.** Sono dati, e si tarano giocando.
- **Il caricamento e la validazione di `random.json`.** Il servizio riceve parametri già validati;
  caricare e validare è del gioco (`CFG`).
- **Qualunque integrazione con `excalibur`.**

## Further Notes

- **RND-17 non ha criterio di test.** La scheda elencava «Trasformazioni senza generatore:
  iniettando una sequenza uniforme finta…», criterio che il seam scelto non permette di soddisfare;
  è stato rimosso. RND-17 resta in vigore come **regola di progetto** — l'impurità è confinata,
  le trasformazioni sono pure — ma nessun test lo verifica: lo tiene in piedi la revisione del
  codice.
- **La regola di lint è la parte fragile.** Il divieto sui trascendenti non ha nessun effetto
  osservabile finché non lo si viola su un motore diverso da quello di sviluppo: è precisamente il
  tipo di errore che nessun test locale intercetta e che il controllo automatico deve prevenire.
- **La riabilitazione di firefox e webkit ha un costo**: il tempo di CI cresce, e i test di snapshot
  visivo esistenti potrebbero richiedere snapshot per motore. Se questo diventa un problema, i
  vettori d'oro possono girare in un progetto Playwright dedicato, con i tre motori, mentre lo
  snapshot visivo resta sul solo chromium.
- **Due dipendenze mancano** e vanno introdotte con questo lavoro: il runner headless e una libreria
  di validazione a schema.
- **`Math.sqrt` e `Math.imul` sono ammessi** e vanno esclusi esplicitamente dalla regola di lint:
  ECMAScript ne specifica il risultato esattamente. Il divieto riguarda solo le funzioni
  trascendenti.

# AI — Utility-AI

**Area:** Agenti · **Natura:** generico · **Priorità:** 3 · **Stato:** proposto
**Prefisso requisiti:** `AI-*`

## Scopo

Decidere **cosa un agente vuole fare**, dato uno snapshot del suo stato e del mondo. Ogni azione
possibile riceve un punteggio di utilità; viene scelta una tra quelle a punteggio più alto.

Il servizio è **logica pura**: non muove nessuno, non attacca nessuno, non conosce Excalibur. Riceve
dati, restituisce un'**intenzione**. Eseguirla spetta all'orchestrazione. Questa separazione è ciò
che rende l'intera IA testabile in un runner Node: si costruisce un contesto a mano, si chiede la
decisione, si verifica.

## Modello concettuale

Quattro mattoni, mantenuti separati anche nel codice:

| Mattone | Cos'è | Dove si tara |
|---|---|---|
| **Input / bisogni** | stato di agente e mondo come valori normalizzati `0..1` (salute, fame, distanza dal bersaglio, alleati vivi) | estrattori |
| **Consideration** | curva di risposta che trasforma un input in un contributo di utilità `0..1` | **dati**: è la superficie di tuning |
| **Azione** | un intento con la sua lista di consideration; il punteggio è la loro combinazione | dati: pesi, bucket |
| **Selector** | confronta i punteggi e sceglie | dati: soglia, inerzia, casualità |

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | uno stream `RND` (per la scelta pesata) |
| NON dipende da | `excalibur`, `ENT`, `BB`, `MAP`, `PATH`, altri servizi |
| Consumato da | orchestrazione, che costruisce il contesto ed esegue l'intento |
| Stato dinamico | ultima decisione e sua scadenza per agente (per l'inerzia) |
| Stato statico | definizioni di azioni, consideration, curve, profili di personalità |
| Dati esterni | `content/ai/actions.json`, `curves.json`, `personalities.json` |
| Eventi emessi | nessuno: restituisce un'intenzione |
| Ordine di grandezza | ~100 agenti attivi, rivalutati a intervalli discreti, entro ~2 ms/frame |

## API pubblica (indicativa)

```ts
/** Snapshot read-only: dati, mai riferimenti runtime (ARC-1.3). */
interface DecisionContext {
  readonly self: AgentSnapshot;              // valori normalizzati e stato
  readonly beliefs: BlackboardView;          // da BB, in sola lettura
  readonly candidates: readonly TargetSnapshot[];   // bersagli e affordance già filtrati
  readonly now: GameTimeMs;
}

interface Intent {
  readonly action: ActionId;
  readonly target?: EntityId | Cell;
  readonly score: number;
  readonly expiresAt: GameTimeMs;
}

interface Reasoner {
  readonly id: ReasonerId;
  decide(ctx: DecisionContext, profile: PersonalityId): Intent | undefined;
  /** Come `decide`, ma restituisce tutti i punteggi e i contributi: per il debug. */
  explain(ctx: DecisionContext, profile: PersonalityId): DecisionTrace;
}
```

## Requisiti

### Purezza e struttura

**AI-1** — Il ragionatore **DEVE** essere **puro**: nessun `import` da Excalibur, nessun accesso al
mondo, nessun effetto collaterale. Stesso contesto e stesso seed → stessa decisione.

**AI-2** — Il ragionatore **DEVE** restituire un'**intenzione**, non eseguire l'azione. L'esecuzione
(muovere, attaccare, parlare, sedersi) è dell'orchestrazione, che conosce i servizi coinvolti
(ARC-4.1).

**AI-3** — Il contesto **DEVE** essere uno **snapshot in sola lettura** di dati: nessun `Actor`,
nessun riferimento a componenti mutabili, nessuna funzione che interroga il mondo durante la
valutazione.

**AI-4** — I quattro mattoni (input, consideration, azione, selector) **DEVONO** essere moduli
distinti e testabili separatamente.

### Punteggio

**AI-5** — Tutti gli input **DEVONO** essere normalizzati in `0..1`, con la normalizzazione
dichiarata nei dati (intervallo di riferimento, saturazione).

**AI-6** — Le **curve di risposta DEVONO** essere data-driven e parametriche: lineare, polinomiale,
logistica, a gradino, esponenziale, con parametri tarabili senza ricompilare (ARC-7.1).

**AI-7** — Il punteggio di un'azione **DEVE** essere la combinazione delle sue consideration, con
proprietà di **veto**: una consideration a 0 azzera l'azione. Consente di esprimere "non posso
attaccare se non ho un bersaglio" senza codice condizionale.

**AI-8** — Il prodotto di molte consideration penalizza le azioni complesse; il servizio **DEVE**
applicare una **compensazione** (es. media geometrica o correzione per il numero di fattori), perché
le azioni non siano confrontate ingiustamente.

**AI-9** — Ogni azione **DEVE** poter avere un **peso** e un limite superiore di utilità, per
stabilire gerarchie tra categorie (sopravvivere batte curiosare).

### Selezione

**AI-10** — Il selector **DEVE** supportare la **scelta casuale pesata tra le migliori**: non sempre
l'azione con il punteggio massimo, ma un'estrazione tra quelle entro una soglia dal massimo. Un PNG
perfettamente ottimale è un PNG prevedibile.

**AI-11** — **DEVE** esistere un'**inerzia**: l'azione in corso riceve un bonus finché non è
conclusa o non decade, per evitare che l'agente oscilli tra due obiettivi quasi pari. L'entità
dell'inerzia è configurabile per azione.

**AI-12** — Il servizio **DEVE** supportare il **bucketing** delle azioni: le azioni sono raccolte
in gruppi (sopravvivenza, combattimento, bisogni, ozio) valutati per priorità, e i gruppi a priorità
inferiore **NON DEVONO** essere valutati se uno superiore ha già prodotto un punteggio sopra soglia.
È insieme un fatto di comportamento e di prestazioni.

**AI-13** — La casualità **DEVE** provenire da uno stream `RND` iniettato, mai da `Math.random()`
(ARC-9.2).

### Personalità e composizione

**AI-14** — **DEVONO** esistere **profili di personalità**: insiemi di curve, soglie e pesi che, a
parità di azioni disponibili, producono comportamenti diversi — un codardo, un fanatico, un
mercenario, un animale timido. La personalità è un **dato** applicato al ragionatore, non un
ragionatore diverso (GP-30).

**AI-15** — Il servizio **DEVE** supportare **più ragionatori indipendenti**, ciascuno con il
proprio insieme di azioni (es. *combattimento*, *bisogni*, *sociale*). Quando le opzioni si
moltiplicano, più ragionatori piccoli sono più tarabili di uno grande.

**AI-16** — Il servizio **DEVE** poter essere usato **come nodo dentro una struttura di livello
superiore** (behaviour tree o macchina a stati): un albero decide il contesto generale, e a un certo
livello delega a un ragionatore di utilità la valutazione fine della situazione. L'API **DEVE**
consentire di invocare un ragionatore su un sottoinsieme di azioni.

**AI-17** — Le azioni **DEVONO** poter dichiarare **precondizioni dure**, valutate prima del
punteggio, per escludere subito ciò che è impossibile.

### Prestazioni e diagnostica

**AI-18** — La valutazione **DEVE** essere **throttlata**: solo gli agenti entro un raggio di
attivazione, a intervalli discreti, con il carico distribuito tra i frame perché non si rivalutino
tutti nello stesso tick (ARC-13.2).

**AI-19** — L'insieme dei candidati **DEVE** essere fornito già filtrato dall'indice spaziale: il
ragionatore **NON DEVE** scandire il mondo (ARC-13.1).

**AI-20** — La valutazione **NON DEVE** allocare né produrre log negli hot path (ARC-13.3).

**AI-21** — `explain()` **DEVE** restituire i punteggi di tutte le azioni e i contributi di ogni
consideration. Senza questo strumento un'IA a utilità è impossibile da tarare, e la messa a punto
diventa tentativi al buio.

**AI-22** — L'ordine di valutazione delle azioni **NON DEVE** influenzare l'esito, a parità di
punteggio: i pareggi si risolvono con una regola deterministica dichiarata.

## Criteri di test

- Dato un contesto costruito a mano, la decisione è quella attesa; cambiando un solo input, cambia
  come previsto.
- La proprietà di veto azzera l'azione con una consideration a 0.
- Due profili di personalità diversi, sullo stesso contesto, producono decisioni diverse in modo
  coerente con i loro parametri.
- L'inerzia impedisce l'oscillazione tra due azioni con punteggi entro l'1%.
- Con lo stesso seed, la scelta pesata tra le migliori è riproducibile.
- Il bucketing evita la valutazione dei gruppi inferiori quando previsto (verificabile contando le
  valutazioni).
- `explain()` produce una traccia leggibile che giustifica la decisione.
- Il ragionatore funziona con azioni e input inventati, estranei a questo gioco (ARC-3.4).

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-1 (purezza), ARC-13 (throttling)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-29, GP-30, GP-31, GP-32
- [`blackboard.md`](./blackboard.md) · [`affordance.md`](./affordance.md) ·
  [`pathfinding.md`](./pathfinding.md) · [`spatial-index.md`](./spatial-index.md)

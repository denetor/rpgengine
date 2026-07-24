# QST — Quest

**Area:** Regole · **Natura:** generico · **Priorità:** 2 · **Stato:** proposto
**Prefisso requisiti:** `QST-*`

## Scopo

Tenere lo stato di avanzamento delle quest e valutare, a fronte di ciò che accade nel mondo, se un
obiettivo è compiuto, fallito o sbloccato.

Il servizio è un **interprete di macchine a stati definite nei dati**: non conosce nessuna quest in
particolare. «Trova la spada di Aramis» è un file, non una classe.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | l'**interprete di precondizioni/effetti** condiviso (ARC-7.3) |
| NON dipende da | `excalibur`, `INV`, `DLG`, `ENT`, altri servizi |
| Consumato da | orchestrazione, HUD (diario), `DLG` (tramite valutatore) |
| Stato dinamico | stato di ogni quest, obiettivi compiuti, contatori, marche temporali |
| Stato statico | definizioni delle quest |
| Dati esterni | `content/quests/*.json` |
| Eventi emessi | `quest-started`, `objective-completed`, `quest-advanced`, `quest-completed`, `quest-failed`, `quest-reward-granted` |

## API pubblica (indicativa)

```ts
interface QuestDefinition {
  id: QuestId;
  titleKey: TextKey;                      // chiave I18N, non testo (I18N-1)
  stages: readonly QuestStage[];
  prerequisites: readonly Condition[];
  failConditions?: readonly Condition[];
  repeatable: boolean;
}

interface QuestStage {
  id: StageId;
  objectives: readonly Objective[];       // union discriminata: kill, collect, reach, talk, escort…
  completion: 'all' | 'any' | { count: number };
  onEnter?: readonly Effect[];
  onComplete?: readonly Effect[];
  next?: StageId | readonly { to: StageId; when: Condition }[];   // rami
}

interface QuestService {
  start(id: QuestId, ctx: WorldFacts): CommandResult<StartOutcome>;
  /** Unico punto d'ingresso per i fatti del mondo: l'orchestrazione traduce gli eventi in fatti. */
  notify(fact: WorldFact, ctx: WorldFacts): CommandResult<readonly QuestChange[]>;
  fail(id: QuestId, reason: FailReason): CommandResult<void>;

  status(id: QuestId): QuestStatus;
  isObjectiveComplete(id: QuestId, obj: ObjectiveId): boolean;
  active(): readonly QuestId[];
  journal(): readonly JournalEntry[];      // per l'HUD: chiavi, non testo
}
```

## Requisiti

### Definizione come dato

**QST-1** — Le quest **DEVONO** essere definite in **file dati validati**, modificabili da un
narrative designer senza ricompilare (ARC-7.1, ARC-7.4, GP-33).

**QST-2** — Obiettivi, precondizioni ed effetti **DEVONO** essere **union discriminate tipizzate**,
valutate dall'interprete condiviso (ARC-7.3). Il servizio **NON DEVE** contenere un `switch` con la
logica di ogni tipo di quest.

**QST-3** — Ogni riferimento (oggetto, PNG, area, altra quest) **DEVE** essere verificato dal
controllo di integrità dei contenuti (ARC-7.5): una quest che cita un oggetto inesistente **DEVE**
essere rilevata prima di partire.

**QST-4** — Le quest **DEVONO** supportare **fasi** con obiettivi multipli e regole di completamento
(tutti, uno qualsiasi, N su M).

**QST-5** — Le quest **DEVONO** supportare **rami**: la fase successiva può dipendere da una
condizione, non essere solo la seguente in elenco.

### Avanzamento

**QST-6** — Il servizio **NON DEVE** sottoscrivere il bus (ARC-4.3): riceve **fatti del mondo**
tramite `notify`, tradotti dall'orchestrazione dagli eventi di dominio. Così resta interrogabile con
fatti sintetici in un test.

**QST-7** — La valutazione **DEVE** essere idempotente rispetto ai fatti ripetuti: lo stesso fatto
consegnato due volte **NON DEVE** far avanzare due volte un obiettivo.

**QST-8** — Il **fallimento DEVE** essere un esito di prima classe, con condizioni proprie e
conseguenze definite (rami alternativi o chiusura), non l'assenza di successo (GP-35).

**QST-9** — Il servizio **DEVE** dichiarare le **ricompense** come effetti, senza consegnarle:
consegnarle è dell'orchestrazione, che parla con `INV`, `STAT` e `ECO` (ARC-4.1).

**QST-10** — Lo stato di ogni quest **DEVE** essere interrogabile in modo economico da dialoghi,
IA e mondo (GP-34): è una lettura molto frequente, e **DEVE** essere O(1).

**QST-11** — Il servizio **DEVE** produrre il **diario** in forma di dati (chiavi di testo, stato,
obiettivi visibili e nascosti), mai testo formattato (I18N-8, GP-50).

**QST-12** — Gli obiettivi **DEVONO** poter essere nascosti finché non sono scoperti, senza che il
diario ne riveli l'esistenza.

**QST-13** — Le quest **DEVONO** poter essere ripetibili, con reimpostazione dello stato controllata
e contatore di completamenti.

**QST-14** — Lo stato **DEVE** essere serializzabile e riferirsi alle definizioni per **ID stabile**
(ARC-10.3).

**QST-15** — Il caricamento di un salvataggio con una definizione di quest **cambiata in modo
incompatibile** (una fase rimossa) **DEVE** essere rilevato e riportato, non ignorato (SAVE-15).

**QST-16** — Il servizio **DEVE** funzionare con quest inventate e tipi di obiettivo estranei a
questo gioco: i tipi di obiettivo sono un insieme estendibile, registrato dall'esterno (ARC-3.4).

## Criteri di test

- Una quest sintetica a tre fasi con rami avanza per il ramo giusto secondo i fatti forniti.
- Lo stesso fatto consegnato due volte non produce doppio avanzamento.
- Una condizione di fallimento chiude la quest con l'esito atteso e non consente più avanzamenti.
- Round-trip di serializzazione con quest a metà, contatori inclusi.
- Il diario espone chiavi, mai testo.
- Una definizione che cita un id inesistente è rifiutata in validazione.

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-20, GP-27, GP-33, GP-34, GP-35, GP-50
- [`dialog.md`](./dialog.md) · [`inventory.md`](./inventory.md) · [`faction.md`](./faction.md)

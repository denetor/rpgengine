# DLG — Dialoghi

**Area:** Regole · **Natura:** generico · **Priorità:** 2 · **Stato:** proposto
**Prefisso requisiti:** `DLG-*`

## Scopo

Condurre una conversazione: dato un nodo di dialogo e lo stato del mondo, stabilire quali opzioni
sono disponibili, quali sono visibili ma precluse, e dove porta ogni scelta.

Il servizio è un **interprete di grafi definiti nei dati**. Non contiene battute, non contiene testo:
contiene chiavi e condizioni. Le battute stanno nei file di contenuto, i testi nei cataloghi di
localizzazione.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | l'**interprete di precondizioni/effetti** condiviso (ARC-7.3) |
| NON dipende da | `excalibur`, `QST`, `FAC`, `STAT`, `INV`, altri servizi |
| Consumato da | orchestrazione, HUD |
| Stato dinamico | nodi già visitati per interlocutore, argomenti sbloccati, conversazione in corso |
| Stato statico | grafi di dialogo |
| Dati esterni | `content/dialogs/*.json` + cataloghi `I18N` |
| Eventi emessi | `dialog-started`, `dialog-node-entered`, `dialog-choice-made`, `dialog-ended`, `topic-unlocked` |

## API pubblica (indicativa)

```ts
interface DialogNode {
  id: NodeId;
  speaker: SpeakerRef;
  textKey: TextKey;                      // chiave, mai testo (I18N-1)
  choices: readonly DialogChoice[];
  onEnter?: readonly Effect[];
  once?: boolean;
}

interface DialogChoice {
  id: ChoiceId;
  textKey: TextKey;
  conditions: readonly Condition[];      // quest, reputazione, stat, oggetti, nodi visitati
  hiddenIfUnmet: boolean;                // false ⇒ mostrata ma disabilitata, con motivo
  effects: readonly Effect[];
  goto: NodeId | 'end';
}

interface DialogService {
  /** `facts` è una vista in sola lettura fornita dall'orchestrazione: il servizio non interroga nessuno. */
  start(dialog: DialogId, speaker: EntityId, facts: WorldFacts): CommandResult<DialogView>;
  choose(choice: ChoiceId, facts: WorldFacts): CommandResult<DialogView>;
  end(): CommandResult<void>;

  hasVisited(speaker: EntityId, node: NodeId): boolean;
  availableTopics(speaker: EntityId, facts: WorldFacts): readonly TopicId[];
}
```

## Requisiti

### Condizionamento

**DLG-1** — Le opzioni **DEVONO** poter dipendere dai **dialoghi precedenti** con quell'interlocutore
(nodi visitati, scelte compiute), memorizzati per coppia interlocutore-nodo (GP-36).

**DLG-2** — Le opzioni **DEVONO** poter dipendere dallo **stato delle quest** (GP-37).

**DLG-3** — Le opzioni **DEVONO** poter dipendere dalla **reputazione**, sia di fazione sia
individuale verso quell'interlocutore (GP-38).

**DLG-4** — Le opzioni **POSSONO** dipendere da caratteristiche, abilità, perk e oggetti posseduti
(GP-39), valutati tramite la stessa primitiva di requisito usata altrove (STAT-11).

**DLG-5** — Tutte le condizioni **DEVONO** essere valutate dall'**interprete condiviso** su una vista
di fatti fornita dal chiamante: il servizio **NON DEVE** interrogare `QST`, `FAC` o `STAT`
(ARC-4.1). È ciò che permette di testare un dialogo con fatti inventati.

**DLG-6** — Un'opzione non disponibile **DEVE** poter essere **nascosta** oppure **mostrata come
preclusa con il motivo** («serve Persuasione 40»), a scelta del designer per ogni opzione: sono due
esperienze di gioco diverse, entrambe legittime.

### Struttura

**DLG-7** — I dialoghi **DEVONO** essere dati validati, modificabili senza ricompilare (ARC-7.4).

**DLG-8** — Ogni riferimento (quest, oggetto, chiave di testo, nodo di destinazione) **DEVE** essere
verificato dal controllo di integrità: **nessun nodo irraggiungibile**, nessun `goto` verso un nodo
inesistente, nessuna chiave di testo mancante (ARC-7.5).

**DLG-9** — Il servizio **NON DEVE** contenere testo: solo chiavi. La risoluzione avviene nella
presentazione tramite `I18N` (I18N-8).

**DLG-10** — Gli **effetti** delle scelte **DEVONO** essere dichiarati come dati e **restituiti**,
non eseguiti: dare un oggetto, avviare una quest, cambiare reputazione, aprire il commercio sono
azioni dell'orchestrazione (ARC-4.2).

**DLG-11** — I dialoghi **DEVONO** supportare **argomenti** riusabili condivisi tra più
interlocutori (chiedere indicazioni, chiedere di una voce di corridoio), senza duplicare i grafi.

**DLG-12** — Il servizio **DEVE** supportare le **battute uniche** (`once`) e i nodi di ripiego
quando ogni contenuto è esaurito.

**DLG-13** — Lo stato **DEVE** essere serializzabile e compatto: memorizzare i nodi visitati per
interlocutore **NON DEVE** crescere senza limite con la durata della partita.

**DLG-14** — Il servizio **DEVE** gestire una sola conversazione attiva per volta, con chiusura
esplicita, e **DEVE** poterla interrompere in modo pulito (il PNG muore, il giocatore fugge) senza
lasciare stato pendente.

**DLG-15** — La valutazione delle opzioni disponibili **DEVE** essere sufficientemente economica da
poter avvenire a ogni apertura di nodo per tutte le opzioni.

**DLG-16** — Il servizio **DEVE** funzionare con grafi e tipi di condizione inventati (ARC-3.4).

**DLG-17** — I dialoghi **DOVREBBERO** poter essere generati o estesi da strumenti esterni: il
formato **DEVE** essere semplice da produrre a macchina, oltre che leggibile a mano.

## Criteri di test

- Un grafo sintetico offre le opzioni attese al variare dei fatti forniti.
- Un'opzione preclusa non nascosta riporta il motivo corretto.
- Le battute `once` non ricompaiono; il ripiego appare quando previsto.
- La validazione rileva nodi irraggiungibili, `goto` rotti e chiavi mancanti.
- Interrompere una conversazione a metà non lascia stato attivo.
- Round-trip di serializzazione con molti interlocutori e nodi visitati.

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-36, GP-37, GP-38, GP-39, GP-2
- [`quest.md`](./quest.md) · [`faction.md`](./faction.md) · [`localization.md`](./localization.md)

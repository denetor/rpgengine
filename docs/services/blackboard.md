# BB — Blackboard

**Area:** Agenti · **Natura:** generico · **Priorità:** 3 · **Stato:** proposto
**Prefisso requisiti:** `BB-*`

## Scopo

Fornire la **memoria** su cui gli agenti ragionano: cosa un PNG sa, cosa sa il suo gruppo, cosa è
noto a tutti. Serve a due cose insieme:

1. **condividere conoscenza** tra entità — se i miei compagni sono morti perdo coraggio e fuggo
   (GP-31); se una guardia ha visto il giocatore rubare, lo sanno tutte le guardie della città;
2. **calcolare una volta sola** ciò che serve a molti — la posizione nota del giocatore, il conteggio
   degli alleati vivi, il livello di allerta di un'area non vanno ricalcolati da ogni PNG a ogni
   valutazione.

La blackboard è **memoria, non verità**: contiene ciò che l'agente *crede*, che può essere
sbagliato o vecchio. È questa distinzione a rendere i PNG credibili — cercano il giocatore dove lo
hanno visto l'ultima volta, non dove è davvero.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, `ENT`, `AI`, altri servizi |
| Consumato da | `AI` (che la riceve come contesto in sola lettura), orchestrazione (che la scrive) |
| Stato dinamico | tutte le lavagne e i loro valori, con marca temporale e decadimento |
| Stato statico | schema delle chiavi: tipo, ambito, politica di decadimento |
| Dati esterni | `content/ai/blackboard-keys.json` |
| Eventi emessi | `belief-changed` (opzionale, per reazioni immediate) |
| Ordine di grandezza | ~10³ agenti × ~20 chiavi, letture ~10⁴/secondo |

## API pubblica (indicativa)

```ts
type Scope =
  | { kind: 'entity'; id: EntityId }     // privata dell'agente
  | { kind: 'group'; id: GroupId }       // squadra, fazione, branco
  | { kind: 'global' };                  // noto a tutti

interface Blackboard {
  set<K extends BbKey>(scope: Scope, key: K, value: BbValue<K>, at: GameTimeMs): void;
  get<K extends BbKey>(scope: Scope, key: K, now: GameTimeMs): BbEntry<BbValue<K>> | undefined;
  forget(scope: Scope, key: BbKey): void;

  /** Risoluzione a cascata: entità → gruppi di appartenenza → globale. */
  resolve<K extends BbKey>(id: EntityId, key: K, now: GameTimeMs): BbEntry<BbValue<K>> | undefined;

  /** Valore derivato calcolato al più una volta per tick e condiviso. */
  memo<T>(scope: Scope, key: DerivedKey, now: GameTimeMs, compute: () => T): T;

  joinGroup(id: EntityId, group: GroupId): void;
  leaveGroup(id: EntityId, group: GroupId): void;

  /** Vista in sola lettura passata al ragionatore (AI-3). */
  snapshot(id: EntityId, now: GameTimeMs): BlackboardView;
}

interface BbEntry<T> { value: T; writtenAt: GameTimeMs; confidence: number; }
```

## Requisiti

**BB-1** — **DEVONO** esistere tre ambiti: **entità** (privato), **gruppo** (squadra, fazione,
branco) e **globale**. Un'entità **DEVE** poter appartenere a più gruppi.

**BB-2** — La lettura **DEVE** risolvere a cascata — entità, poi gruppi, poi globale — con
precedenza al più specifico e ordine di consultazione dei gruppi deterministico (ARC-9.4).

**BB-3** — Ogni valore **DEVE** portare una **marca temporale** e una **confidenza**: chi legge deve
poter distinguere *"il giocatore è qui"* da *"il giocatore era qui trenta secondi fa"*.

**BB-4** — Le chiavi **DEVONO** supportare una politica di **decadimento** dichiarata nei dati:
scadenza netta, decadimento lineare della confidenza, o permanenza. Il decadimento **DEVE** essere
calcolato alla lettura, non con un passaggio periodico su tutte le voci.

**BB-5** — Le chiavi **DEVONO** essere tipizzate: leggere una chiave con il tipo sbagliato **DEVE**
essere un errore di compilazione. Nessuna lavagna `Record<string, any>`.

**BB-6** — La blackboard **DEVE** offrire una **memoizzazione per tick** (`memo`) per i valori
derivati costosi condivisi da più agenti: numero di alleati vivi, baricentro del gruppo, livello di
allerta dell'area. Il calcolo avviene **al più una volta per tick**, e il risultato **DEVE** essere
identico per tutti i lettori dello stesso tick.

**BB-7** — Il servizio **NON DEVE** contenere logica decisionale: non decide cosa fare con ciò che
sa. È memoria, non ragionamento (separazione da `AI`).

**BB-8** — Il servizio **NON DEVE** conoscere le entità: riceve `EntityId` e valori. Non interroga
`ENT`, non legge posizioni. È l'orchestrazione a scrivere ciò che gli agenti percepiscono.

**BB-9** — Al ragionatore **DEVE** essere passata una **vista in sola lettura**: l'IA legge, non
scrive. Scrivere durante la valutazione renderebbe l'esito dipendente dall'ordine degli agenti.

**BB-10** — Lo stato **DEVE** essere serializzabile: un PNG che ha visto il giocatore rubare **DEVE**
ricordarlo dopo il caricamento. Le sole voci escluse sono quelle marcate come effimere.

**BB-11** — La propagazione della conoscenza tra membri di un gruppo **NON DEVE** essere istantanea
per default: **DEVE** poter essere modellata come scrittura sull'ambito di gruppo con un ritardo o
un raggio di comunicazione configurabili, così che l'informazione si diffonda in modo plausibile.

**BB-12** — Le chiavi **DEVONO** essere dichiarate come dati (nome, tipo, ambito ammesso,
decadimento): l'insieme dei fatti che un PNG può ricordare è **contenuto**, non codice (ARC-7.1).

**BB-13** — La rimozione di un'entità **DEVE** ripulire la sua lavagna privata e le sue
appartenenze, senza lasciare voci pendenti.

**BB-14** — In sviluppo **DOVREBBE** essere possibile ispezionare la lavagna di un agente per
capire perché ha preso una decisione: è lo strumento primario di debug dell'IA.

## Criteri di test

- La risoluzione a cascata restituisce il valore più specifico, con ordine deterministico dei gruppi.
- La confidenza decade come dichiarato; una voce scaduta non è più restituita.
- `memo` calcola una sola volta per tick e restituisce lo stesso valore a 100 lettori.
- Round-trip di serializzazione con voci effimere correttamente escluse.
- Rimuovendo un'entità non restano voci né appartenenze.
- Il servizio funziona con chiavi e ambiti inventati (ARC-3.4).

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-29, GP-31
- [`utility-ai.md`](./utility-ai.md) · [`affordance.md`](./affordance.md) · [`time.md`](./time.md)

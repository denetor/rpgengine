# CRM — Crimine e notorietà

**Area:** Regole · **Natura:** di dominio · **Priorità:** 4 · **Stato:** proposto
**Prefisso requisiti:** `CRM-*`

## Scopo

Stabilire quando un'azione del giocatore è un crimine, chi se ne accorge, e quali conseguenze ne
derivano in termini di taglia e notorietà presso le fazioni.

Il principio che regge tutto il servizio: **un crimine esiste solo se qualcuno lo vede.** Rubare in
una stanza vuota non è un reato; rubare davanti a una guardia lo è. Questo rende il sistema una
questione di *percezione* prima che di regole.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | una **porta di percezione** (implementata su `SPX`/`AFF`) |
| NON dipende da | `excalibur`, `FAC`, `ENT`, altri servizi |
| Consumato da | orchestrazione |
| Stato dinamico | taglie per fazione, crimini noti, testimoni, stato di ricerca |
| Stato statico | catalogo dei reati, gravità, prescrizione, regole di giurisdizione |
| Dati esterni | `content/crime/offenses.json`, `jurisdictions.json` |
| Eventi emessi | `crime-witnessed`, `bounty-changed`, `crime-reported`, `bounty-cleared`, `arrest-demanded` |

## API pubblica (indicativa)

```ts
interface CrimeReport {
  readonly offense: OffenseId;              // furto, aggressione, omicidio, scasso, sconfinamento
  readonly perpetrator: EntityId;
  readonly victim?: EntityId;
  readonly at: Cell;
  readonly jurisdiction: FactionId;
  readonly severity: number;
}

interface CrimeService {
  /** L'orchestrazione dichiara il fatto; il servizio stabilisce se e da chi è percepito. */
  report(crime: CrimeReport, witnesses: readonly WitnessSnapshot[], now: GameTimeMs)
    : CommandResult<CrimeOutcome>;

  bounty(faction: FactionId, who: EntityId): number;
  isWanted(faction: FactionId, who: EntityId): boolean;
  payBounty(faction: FactionId, who: EntityId, amount: number): CommandResult<void>;
  serveSentence(faction: FactionId, who: EntityId): CommandResult<void>;

  /** Prescrizione e oblio: i crimini invecchiano. */
  tick(now: GameTimeMs): CommandResult<void>;
}
```

## Requisiti

**CRM-1** — Un'azione **DEVE** produrre conseguenze solo se **osservata** da un testimone in grado di
percepirla: distanza, campo visivo, ostruzione, illuminazione, rumore (GP-47). La valutazione passa
da una porta di percezione, non da `SPX` importato (ARC-4.1).

**CRM-2** — Il catalogo dei reati, la loro gravità e la giurisdizione competente **DEVONO** essere
dati (ARC-7.1). Cosa sia un reato dipende dal luogo: cacciare è lecito nei boschi, non nella riserva
del barone.

**CRM-3** — Un testimone **DEVE** dover **segnalare** il crimine perché produca una taglia: la
segnalazione richiede tempo, un tragitto verso un'autorità, e può essere impedita (fuga o
eliminazione del testimone). L'assenza di questo passaggio rende il sistema una punizione istantanea
e poco credibile.

**CRM-4** — La taglia **DEVE** essere **per fazione e per giurisdizione**: essere ricercati in una
città **NON DEVE** implicare esserlo ovunque (GP-48).

**CRM-5** — La notorietà **DEVE** avere conseguenze osservabili tramite eventi: guardie ostili,
prezzi peggiori, opzioni di dialogo precluse, arresto. Le conseguenze sono **applicate
dall'orchestrazione**, non da questo servizio (ARC-4.1).

**CRM-6** — Il servizio **DEVE** distinguere **crimine noto** (una taglia esiste) da **crimine
sospetto** (un testimone ha visto ma non ha segnalato): sono stati diversi con conseguenze diverse.

**CRM-7** — La conoscenza del crimine **DEVE** propagarsi tramite la blackboard di gruppo (BB-1,
BB-11), con ritardo: le guardie della città lo apprendono in tempi plausibili, non istantaneamente.
Il collegamento è dell'orchestrazione.

**CRM-8** — I crimini **DEVONO** avere **prescrizione**: gravità e taglia decadono nel tempo secondo
regole dichiarate, tramite `TIME`.

**CRM-9** — **DEVONO** esistere modi di estinguere la taglia: pagamento, pena detentiva, intercessione
di una fazione, corruzione. Ognuno con conseguenze proprie (denaro, tempo, reputazione).

**CRM-10** — Gli oggetti sottratti **DEVONO** poter essere marcati come **rubati**, con conseguenze
sulla vendita (ECO-7). La marcatura decade o si rimuove secondo regola.

**CRM-11** — Il servizio **DEVE** essere applicabile anche ai PNG, non solo al giocatore: un PNG che
uccide un altro PNG davanti a una guardia **DEVE** essere trattato con le stesse regole. È il test
che dimostra che il sistema è generale e non un caso particolare cucito addosso al giocatore.

**CRM-12** — Il servizio **NON DEVE** decidere l'esito degli scontri né muovere guardie: emette
eventi e richieste (`arrest-demanded`), che l'IA e l'orchestrazione traducono in comportamento.

**CRM-13** — Lo stato **DEVE** essere serializzabile: taglie, crimini noti e testimoni in cammino.

## Criteri di test

- Un crimine senza testimoni non produce taglia; con testimone e segnalazione riuscita, sì.
- Eliminare l'unico testimone prima della segnalazione impedisce la taglia — ed è a sua volta un
  crimine se osservato.
- La taglia resta circoscritta alla giurisdizione competente.
- La prescrizione riduce la taglia come dichiarato.
- Le stesse regole applicate a un PNG producono lo stesso trattamento (CRM-11).
- Round-trip di serializzazione con crimini e testimoni pendenti.

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-47, GP-48
- [`faction.md`](./faction.md) · [`affordance.md`](./affordance.md) ·
  [`spatial-index.md`](./spatial-index.md) · [`economy.md`](./economy.md)

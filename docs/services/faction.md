# FAC — Fazioni e reputazione

**Area:** Regole · **Natura:** generico · **Priorità:** 3 · **Stato:** proposto
**Prefisso requisiti:** `FAC-*`

## Scopo

Tenere l'appartenenza alle fazioni, la reputazione del giocatore verso ciascuna, il rapporto
individuale con i singoli PNG e le relazioni tra fazioni.

Una fazione, qui, è qualunque gruppo con un'identità collettiva: i cittadini di una città, una
corporazione di mercanti, una gilda di ladri, un ordine religioso, un branco di lupi. Il servizio
non distingue: sono tutte fazioni con livelli, reputazione e relazioni.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, `ENT`, `DLG`, altri servizi |
| Consumato da | orchestrazione; `DLG` e `ECO` ricevono i **valori** tramite la vista dei fatti |
| Stato dinamico | reputazione per fazione, modificatori individuali, rango di appartenenza |
| Stato statico | definizioni delle fazioni, ranghi, relazioni, soglie di atteggiamento |
| Dati esterni | `content/factions/*.json` |
| Eventi emessi | `reputation-changed`, `standing-changed`, `rank-changed`, `faction-joined`, `faction-left`, `became-hostile` |

## API pubblica (indicativa)

```ts
interface FactionDefinition {
  id: FactionId;
  ranks: readonly { id: RankId; threshold: number; benefits: readonly Benefit[] }[];
  relations: Readonly<Record<FactionId, number>>;    // -1..1: alleata … nemica
  propagation: number;                               // quanto le variazioni si propagano agli alleati
  thresholds: readonly { at: number; standing: Standing }[];   // ostile, diffidente, neutrale, amico
}

interface FactionService {
  reputation(faction: FactionId): number;
  /** Reputazione effettiva verso un singolo PNG: fazione + modificatore individuale. */
  standingWith(npc: EntityId, npcFactions: readonly FactionId[]): { value: number; standing: Standing };

  applyDelta(source: ReputationSource, delta: FactionDelta): CommandResult<readonly ReputationChange[]>;
  applyPersonalDelta(npc: EntityId, delta: number): CommandResult<void>;

  rank(faction: FactionId): RankId | undefined;
  hasBenefit(faction: FactionId, benefit: BenefitId): boolean;
  areHostile(a: FactionId, b: FactionId): boolean;
}
```

## Requisiti

**FAC-1** — Il servizio **DEVE** trattare in modo uniforme fazioni di natura diversa — geografiche,
professionali, criminali, religiose — senza tipi distinti (GP-40).

**FAC-2** — Ogni fazione **DEVE** avere **N ranghi** con soglie e benefici dichiarati nei dati, che
sbloccano vantaggi e opzioni di dialogo (GP-41).

**FAC-3** — **DEVE** esistere una reputazione del giocatore verso ciascuna fazione, su una scala
dichiarata e limitata agli estremi (GP-42).

**FAC-4** — **DEVE** esistere un **modificatore individuale** per singolo PNG, che si combina con
quello di fazione secondo una regola dichiarata (GP-43). Un PNG **DEVE** poter essere amico del
giocatore pur appartenendo a una fazione ostile.

**FAC-5** — Un PNG **DEVE** poter appartenere a **più fazioni**; la reputazione effettiva verso di
lui è una combinazione deterministica e documentata delle fazioni di appartenenza più il
modificatore individuale.

**FAC-6** — Le **relazioni tra fazioni DEVONO** propagare parzialmente le variazioni: aiutare la
guardia cittadina peggiora la reputazione con i ladri (GP-44). La propagazione **DEVE** essere
limitata a un passo, o comunque non ricorsiva, per evitare cascate incontrollabili.

**FAC-7** — Il servizio **DEVE** restituire un **atteggiamento** discreto (ostile, diffidente,
neutrale, amichevole, devoto) derivato dal valore continuo tramite soglie con **isteresi**: senza
isteresi un PNG oscilla tra ostile e neutrale attorno alla soglia.

**FAC-8** — Le variazioni **DEVONO** emettere eventi solo quando cambia qualcosa di osservabile
(superamento di soglia, cambio di rango), non a ogni incremento di un punto.

**FAC-9** — Il servizio **NON DEVE** decidere le conseguenze: non attacca, non cambia prezzi, non
apre dialoghi. Fornisce valori e atteggiamenti; le conseguenze sono dell'orchestrazione (ARC-4.1).

**FAC-10** — Le fazioni **DEVONO** essere definite come dati, incluse relazioni, ranghi e soglie
(ARC-7.1). Aggiungere una fazione **NON DEVE** richiedere modifiche al codice.

**FAC-11** — Il servizio **DEVE** supportare reputazioni **non simmetriche** e valori iniziali per
fazione, incluse fazioni ostili in partenza.

**FAC-12** — Le fazioni **DEVONO** poter essere usate come **gruppi** per la blackboard (BB-1): la
guardia cittadina è insieme una fazione e un gruppo che condivide conoscenza. Il collegamento è
dell'orchestrazione, non un'importazione tra servizi.

**FAC-13** — Il servizio **DEVE** essere interrogabile in modo economico: `standingWith` è valutata
di continuo dall'IA e a ogni apertura di dialogo.

**FAC-14** — Lo stato **DEVE** essere serializzabile, con i modificatori individuali indicizzati per
`EntityId` stabile.

**FAC-15** — Il servizio **DEVE** funzionare con fazioni inventate, comprese strutture non
gerarchiche (ARC-3.4).

## Criteri di test

- La propagazione tra fazioni alleate e nemiche produce le variazioni attese, senza cascate.
- L'isteresi impedisce l'oscillazione dell'atteggiamento attorno alla soglia.
- Il rango cambia esattamente al superamento della soglia, con un solo evento.
- La combinazione di più fazioni e del modificatore individuale è deterministica e documentata.
- Round-trip di serializzazione con centinaia di modificatori individuali.

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-40…GP-44, GP-38, GP-45, GP-48
- [`dialog.md`](./dialog.md) · [`economy.md`](./economy.md) · [`crime.md`](./crime.md) ·
  [`blackboard.md`](./blackboard.md)

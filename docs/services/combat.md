# CBT — Combattimento

**Area:** Regole · **Natura:** di dominio · **Priorità:** 2 · **Stato:** proposto
**Prefisso requisiti:** `CBT-*`

## Scopo

Essere l'**unico punto** in cui si calcola un danno e si applica un effetto di stato. Riceve una
richiesta di colpo con tutti i dati necessari, restituisce l'esito e gli eventi prodotti.

Il difetto che questo servizio esiste per prevenire è documentato in
[`previous-version/REPORT-VALUTAZIONE.md`](../previous-version/REPORT-VALUTAZIONE.md): più
implementazioni indipendenti di `takeHit`, ciascuna con le proprie regole, che accedono allo stato
altrui con `(other as any).model`. Una sola formula, un solo contratto tipizzato.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | uno stream `RND` |
| NON dipende da | `excalibur`, `ENT`, `STAT`, altri servizi |
| Consumato da | orchestrazione |
| Stato dinamico | vita corrente, status effect attivi, tempi di recupero, minacce |
| Stato statico | tipi di danno, tabelle di resistenza, definizioni degli status, formule |
| Dati esterni | `content/combat/damage-types.json`, `status-effects.json`, `formulas.json` |
| Eventi emessi | `damage-dealt`, `damage-blocked`, `status-applied`, `status-expired`, `entity-died`, `knockback-applied` |

## API pubblica (indicativa)

```ts
interface DamageInfo {
  readonly source: EntityId | 'environment';
  readonly amount: number;
  readonly type: DamageTypeId;
  readonly knockback?: { direction: Vector2; force: number };
  readonly statuses?: readonly StatusApplication[];
  readonly canCrit: boolean;
  readonly tags: readonly DamageTag[];          // 'melee' | 'ranged' | 'magic' | 'trap' | …
}

interface CombatSnapshot {                       // fornito dal chiamante: il servizio non lo cerca
  readonly resistances: Readonly<Record<DamageTypeId, number>>;
  readonly defense: number;
  readonly currentHealth: number;
  readonly maxHealth: number;
  readonly guardState: GuardState;               // parata, schivata, i-frame
  readonly immunities: readonly DamageTypeId[];
}

interface CombatService {
  resolve(target: EntityId, snap: CombatSnapshot, dmg: DamageInfo, now: GameTimeMs)
    : CommandResult<DamageOutcome>;
  applyStatus(target: EntityId, status: StatusApplication, now: GameTimeMs): CommandResult<void>;
  tickStatuses(now: GameTimeMs): CommandResult<void>;
  heal(target: EntityId, amount: number, source: EntityId | 'item'): CommandResult<HealOutcome>;
}
```

## Requisiti

### Unicità della formula

**CBT-1** — **DEVE** esistere **un solo punto** di calcolo del danno. Nessun'altra parte del codice
**DEVE** poter ridurre la vita di un'entità (GP-19).

**CBT-2** — Il danno **DEVE** passare per la struttura tipizzata `DamageInfo`. Nessun accesso a
proprietà altrui tramite cast: il chiamante fornisce uno `CombatSnapshot` esplicito.

**CBT-3** — La formula **DEVE** essere dichiarata nei dati e documentata, con l'ordine di
applicazione dei fattori esplicito (base → variazione → resistenza → difesa → critico → riduzioni →
minimo).

**CBT-4** — Il calcolo **DEVE** essere deterministico dato lo stream `RND`: nessun `Math.random()`
(ARC-9.2). La variazione del danno **DOVREBBE** usare la sorgente gaussiana (RND-6), non uniforme:
i colpi si addensano attorno al valore nominale, con code rare.

**CBT-5** — Il servizio **NON DEVE** leggere lo stato di altri servizi: riceve tutto ciò che serve.
È ciò che lo rende testabile con dati inventati.

### Regole di gioco

**CBT-6** — **DEVONO** esistere **tipi di danno** con resistenze e vulnerabilità per entità (GP-14).
L'insieme dei tipi è **dato**: aggiungerne uno non tocca il codice.

**CBT-7** — **DEVONO** esistere **status effect a tempo** — veleno, sanguinamento, stordimento,
rallentamento, buff e debuff — con durata, periodicità, intensità e regole di **cumulo** dichiarate
(sostituisce, si somma, rinnova la durata, ha un massimo di applicazioni) (GP-15).

**CBT-8** — Gli status **DEVONO** scadere tramite `TIME` (TIME-7), non con contatori privati, così
da sopravvivere correttamente a salvataggio e pausa.

**CBT-9** — Un colpo **DEVE** poter produrre **knockback** e **hitstun** parametrizzati dall'arma
(GP-16). Il servizio ne calcola l'entità e la direzione; ad applicarli al movimento è la
presentazione, reagendo all'evento.

**CBT-10** — **DEVONO** essere supportati **parata, schivata e finestre di invulnerabilità**: lo
stato di guardia entra nello snapshot, e l'esito distingue colpo pieno, parato, schivato e
completamente evitato (GP-17).

**CBT-11** — Il servizio **DEVE** trattare allo stesso modo attacchi in mischia, a distanza e magici,
per il giocatore e per i PNG (GP-18): differiscono nei dati, non nel percorso di codice.

**CBT-12** — Il danno **DEVE** poter provenire dall'ambiente (trappole, fuoco, caduta) senza
un'entità sorgente.

**CBT-13** — Un'entità marcata come **non uccidibile** (quest NPC, GP-27) **NON DEVE** poter morire:
il danno viene applicato fino a una soglia minima e l'esito lo dichiara esplicitamente. La regola
**DEVE** vivere qui, non essere ricordata in ogni punto che infligge danno.

**CBT-14** — La morte **DEVE** essere un esito calcolato dal servizio, che emette `entity-died` una
sola volta. Un'entità già morta **NON DEVE** poter morire di nuovo, né subire danni.

**CBT-15** — Il servizio **DOVREBBE** tenere una **tabella delle minacce** per bersaglio (chi mi ha
colpito, quanto, quando): è ciò che permette all'IA di reagire in modo credibile (GP-29) senza
ricostruirla da sé.

**CBT-16** — Le entità **DEVONO** poter essere immuni a tipi di danno e a status specifici.

**CBT-17** — Il risultato **DEVE** essere una struttura ricca (danno inflitto, danno assorbito,
critico, uccisione, status applicati e rifiutati), non un numero: è ciò che alimenta HUD, numeri
fluttuanti, suoni e IA.

**CBT-18** — Il servizio **NON DEVE** muovere entità, riprodurre animazioni o suoni: emette eventi.

## Criteri di test

- La formula produce i valori attesi su una tabella di casi noti, inclusi immunità, resistenza
  totale, vulnerabilità e danno minimo.
- Stesso seed → stessa sequenza di colpi, critici e variazioni.
- Le regole di cumulo degli status si comportano come dichiarato per ciascuna politica.
- Un quest NPC portato sotto zero sopravvive, con esito esplicito.
- Un'entità morta non riceve ulteriori danni né emette un secondo `entity-died`.
- Gli status sopravvivono a un ciclo di salvataggio con la durata residua corretta.
- Il servizio funziona con tipi di danno e status inventati (ARC-3.4).

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-14…GP-19, GP-27
- [`stats.md`](./stats.md) · [`random.md`](./random.md) · [`time.md`](./time.md) ·
  [`loot.md`](./loot.md)

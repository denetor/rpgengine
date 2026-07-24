# STAT — Caratteristiche e progressione

**Area:** Regole · **Natura:** di dominio · **Priorità:** 2 · **Stato:** proposto
**Prefisso requisiti:** `STAT-*`

## Scopo

Tenere le **caratteristiche**, le **abilità** e i **perk** delle entità, calcolare i valori derivati
(vita, energia, portata, difese) e gestire la progressione.

Il modello di progressione di questo gioco è deliberatamente diverso da quello classico: **non
esistono livelli**. Non c'è un numero che riassume la potenza del personaggio, non ci sono punti
esperienza da spendere. Le singole caratteristiche crescono per **formazione presso maestri**, le
abilità anche **con l'uso**, e alcuni **perk** arrivano al superamento di soglie o col passare del
tempo. Il servizio deve rendere naturale questo modello, non emularlo sopra un sistema a livelli.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, altri servizi |
| Consumato da | orchestrazione; `CBT`, `INV`, `DLG`, `ECO` ricevono i **valori**, non il servizio |
| Stato dinamico | valori base, esperienza per abilità, perk sbloccati, modificatori attivi |
| Stato statico | definizioni di caratteristiche, abilità, perk, formule dei derivati |
| Dati esterni | `content/stats/attributes.json`, `skills.json`, `perks.json`, `derived.json` |
| Eventi emessi | `attribute-raised`, `skill-improved`, `perk-unlocked`, `derived-changed`, `training-completed` |

## API pubblica (indicativa)

```ts
interface StatBlock {
  base(attr: AttributeId): number;
  effective(attr: AttributeId): number;        // base + modificatori, con cap
  skill(skill: SkillId): number;
  hasPerk(perk: PerkId): boolean;
  derived(stat: DerivedId): number;            // vita, energia, portata, difesa…
}

interface StatsService {
  train(id: EntityId, attr: AttributeId, quality: number): CommandResult<TrainingOutcome>;
  useSkill(id: EntityId, skill: SkillId, difficulty: number): CommandResult<SkillCheck>;

  addModifier(id: EntityId, m: StatModifier): CommandResult<ModifierId>;   // equip, buff, sovraccarico
  removeModifier(id: EntityId, m: ModifierId): CommandResult<void>;

  meets(id: EntityId, req: readonly Requirement[]): boolean;   // requisiti di equip e dialogo
  evaluate(id: EntityId): StatBlock;
}
```

## Requisiti

### Modello

**STAT-1** — **NON DEVE** esistere alcun livello di personaggio né un contatore globale di
esperienza: la progressione avviene per **caratteristica singola** (GP-1).

**STAT-2** — Le caratteristiche **DEVONO** migliorare tramite **formazione presso maestri**, con
costo, tempo e limite dipendenti dal maestro e dal valore attuale (GP-2). Un maestro **DEVE** poter
insegnare fino a un massimo proprio: oltre, serve un maestro migliore.

**STAT-3** — Le **abilità** (scasso, alchimia, persuasione, mercanteggiare) **DEVONO** essere
distinte dalle caratteristiche e migliorare **con l'uso**, con rendimenti decrescenti, e/o con la
formazione (GP-4).

**STAT-4** — I **perk DEVONO** sbloccarsi al superamento di soglie su una o più caratteristiche
o al trascorrere del tempo, non per spesa di punti (GP-3). Le condizioni sono dati.

**STAT-5** — I **valori derivati** (vita, energia, mana, portata, difese) **DEVONO** essere calcolati
da formule dichiarate nei dati, mai memorizzati come valori indipendenti che possono divergere
(GP-6). Fanno eccezione i **valori correnti** — la vita attuale — che sono stato, mentre il massimo
è derivato.

**STAT-6** — Le formule dei derivati **DEVONO** essere data-driven ed espresse con l'interprete di
espressioni condiviso (ARC-7.3), non come funzioni TypeScript per ogni statistica.

### Modificatori

**STAT-7** — I modificatori (equipaggiamento, buff, debuff, sovraccarico, ferite) **DEVONO** essere
**tracciati per origine** e rimovibili individualmente: togliere l'armatura toglie esattamente il suo
contributo.

**STAT-8** — L'ordine di applicazione dei modificatori (additivi, moltiplicativi, cap) **DEVE**
essere dichiarato e deterministico: due modificatori applicati in ordine diverso **DEVONO** dare lo
stesso risultato (ARC-9.4).

**STAT-9** — Il valore efficace **DEVE** essere calcolabile senza effetti collaterali e
**DOVREBBE** essere memoizzato con invalidazione a ogni cambio di modificatore: è letto molte volte
per frame.

**STAT-10** — Ogni caratteristica e abilità **DEVE** avere minimo, massimo e cap dichiarati; nessun
percorso di codice **DEVE** poter portare un valore fuori intervallo.

### Interoperabilità

**STAT-11** — Il servizio **DEVE** esporre `meets(requirements)` come primitiva unica per i requisiti
di equipaggiamento, dialogo e interazione (GP-5, GP-39): un solo punto di valutazione, riusato da
tutti.

**STAT-12** — Le prove di abilità (scasso, persuasione) **DEVONO** essere risolte da questo servizio
con un unico meccanismo, usando lo stream `RND` del caso, e restituire un esito strutturato (successo,
margine, critico) invece di un booleano.

**STAT-13** — Il servizio **NON DEVE** conoscere combattimento, inventario o dialoghi: fornisce
valori e verdetti. Chi decide cosa farne è l'orchestrazione (ARC-4.1).

**STAT-14** — Ogni variazione permanente **DEVE** emettere l'evento corrispondente, perché HUD,
audio e diario reagiscano senza sondare lo stato.

**STAT-15** — L'insieme delle caratteristiche, delle abilità e dei perk **DEVE** essere definito
come **dato**: aggiungere una caratteristica **NON DEVE** richiedere modifiche al codice. È anche
ciò che rende il servizio riusabile in un gioco con un modello di personaggio diverso.

## Criteri di test

- Il valore efficace è indipendente dall'ordine di applicazione dei modificatori.
- Rimuovere l'equipaggiamento riporta esattamente ai valori precedenti, senza deriva su 10³ cicli.
- L'uso ripetuto di un'abilità la migliora con la curva a rendimenti decrescenti attesa.
- Un perk si sblocca esattamente al superamento della soglia, una sola volta.
- I derivati cambiano coerentemente al variare delle caratteristiche di base.
- Il servizio funziona con un insieme di caratteristiche inventato (ARC-3.4).

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-1, GP-2, GP-3, GP-4, GP-5, GP-6, GP-21, GP-22
- [`combat.md`](./combat.md) · [`inventory.md`](./inventory.md) · [`dialog.md`](./dialog.md)

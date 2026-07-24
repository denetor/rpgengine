# INV — Inventario ed equipaggiamento

**Area:** Regole · **Natura:** generico · **Priorità:** 2 · **Stato:** proposto
**Prefisso requisiti:** `INV-*`

## Scopo

Gestire i contenitori di oggetti — zaino del giocatore, borsa di un PNG, forziere, banco di un
mercante, mucchio di bottino a terra — con peso, impilamento, slot di equipaggiamento e vincoli di
trasferimento.

Un solo servizio per tutti i contenitori: uno scambio con un mercante e il saccheggio di un cadavere
sono lo stesso trasferimento con regole diverse.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, `STAT`, `QST`, `ECO`, altri servizi |
| Consumato da | orchestrazione |
| Stato dinamico | contenuto dei contenitori, oggetti equipaggiati, stato degli oggetti (usura, cariche) |
| Stato statico | definizioni degli oggetti, slot, regole di impilamento |
| Dati esterni | `content/items/*.json`, `content/items/slots.json` |
| Eventi emessi | `item-added`, `item-removed`, `item-moved`, `item-equipped`, `item-unequipped`, `container-full`, `item-consumed` |

## API pubblica (indicativa)

```ts
interface ItemDefinition {
  id: ItemId;
  weight: number;
  maxStack: number;                       // 1 = non impilabile
  slots: readonly SlotId[];               // dove può essere equipaggiato
  requirements: readonly Requirement[];   // valutati da STAT (STAT-11)
  modifiers: readonly StatModifier[];
  tags: readonly ItemTag[];               // 'weapon' | 'consumable' | 'key' | 'quest' | …
  unique: boolean;
}

interface ItemInstance {
  instanceId: InstanceId;                 // stabile: serve a quest e tracciamento
  def: ItemId;
  quantity: number;
  durability?: number;
  charges?: number;
  flags: ItemFlags;                       // questItem, stolen, equipped…
}

interface InventoryService {
  add(container: ContainerId, item: ItemInstance): CommandResult<AddOutcome>;
  remove(container: ContainerId, instance: InstanceId, quantity?: number): CommandResult<ItemInstance>;
  transfer(from: ContainerId, to: ContainerId, instance: InstanceId,
           quantity: number, rules: TransferRules): CommandResult<TransferOutcome>;

  equip(owner: ContainerId, instance: InstanceId, slot: SlotId,
        check: RequirementChecker): CommandResult<EquipOutcome>;
  unequip(owner: ContainerId, slot: SlotId): CommandResult<void>;

  totalWeight(container: ContainerId): number;
  canAccept(container: ContainerId, item: ItemInstance): AcceptVerdict;
  contents(container: ContainerId): readonly ItemInstance[];
}
```

## Requisiti

### Modello

**INV-1** — **DEVE** esistere un solo modello di contenitore per zaino, forziere, cadavere, banco del
mercante e mucchio a terra: differiscono per **capacità e regole**, non per tipo.

**INV-2** — Gli oggetti **DEVONO** distinguere **definizione** (statica, condivisa, per `ItemId`) e
**istanza** (dinamica, con `InstanceId` stabile, quantità, usura, cariche) (ARC-10.3).

**INV-3** — Gli oggetti identici e privi di stato individuale **DEVONO** impilarsi fino a un massimo
dichiarato; quelli con stato proprio (usura diversa, incantesimi) **NON DEVONO** impilarsi (GP-24).

**INV-4** — Ogni contenitore **DEVE** poter avere un limite di **peso**, di **numero di slot**, o
entrambi. Il superamento **DEVE** essere segnalato con un esito esplicito, mai con una perdita
silenziosa di oggetti.

**INV-5** — Il **sovraccarico** (GP-21) **DEVE** essere calcolato qui come stato osservabile
(percentuale di carico, soglie superate); le sue **conseguenze** sulle statistiche sono modificatori
applicati da `STAT` (STAT-7), non regole di questo servizio.

### Quest item

**INV-6** — Un oggetto **DEVE** poter essere marcato come **quest item**: peso 0, non droppabile,
non vendibile, non distruggibile finché il flag è attivo (GP-20).

**INV-7** — Il servizio **NON DEVE** conoscere le quest: applica il flag, non decide quando
attivarlo o rimuoverlo. È l'orchestrazione, reagendo agli eventi di `QST`, a marcare e smarcare
(ARC-4.1).

### Equipaggiamento

**INV-8** — **DEVONO** esistere **slot di equipaggiamento** definiti nei dati (arma, arma secondaria,
elmo, corpo, accessori), con regole di occupazione: un'arma a due mani occupa due slot (GP-22).

**INV-9** — I **requisiti** per equipaggiare **DEVONO** essere verificati tramite una porta
(`RequirementChecker`) implementata su `STAT`, non importando `STAT` (ARC-4.1, STAT-11).

**INV-10** — Equipaggiare **DEVE** produrre gli eventi che consentono a `STAT` di applicare i
modificatori: il servizio inventario **NON DEVE** modificare statistiche.

**INV-11** — Un oggetto equipaggiato **DEVE** restare nell'inventario ed essere marcato, non
spostato in un contenitore separato: evita la classe di bug in cui un oggetto esiste due volte o
sparisce togliendolo.

### Consumo e trasferimento

**INV-12** — I consumabili **DEVONO** essere supportati con cariche ed effetti dichiarati nei dati;
il consumo emette l'evento, mentre l'**effetto** è applicato dall'orchestrazione tramite `CBT` o
`STAT` (GP-23).

**INV-13** — Il trasferimento tra contenitori **DEVE** essere **atomico**: o l'oggetto è tolto da uno
e messo nell'altro, o nulla cambia. Nessuno stato in cui l'oggetto esiste in entrambi o in nessuno.

**INV-14** — Le regole di trasferimento (furto, saccheggio, commercio, dono) **DEVONO** essere
parametri della chiamata, non contenitori diversi: chi trasferisce dichiara il contesto, il servizio
applica i vincoli.

**INV-15** — Gli oggetti **unici DEVONO** essere garantiti tali: il servizio **NON DEVE** permettere
la duplicazione di un `InstanceId`. Il round-trip di serializzazione **DEVE** verificarlo.

**INV-16** — L'ordinamento del contenuto restituito **DEVE** essere deterministico (ARC-9.4).

**INV-17** — Il servizio **DEVE** funzionare con un catalogo di oggetti inventato: non conosce le
spade, conosce oggetti con peso, tag e slot (ARC-3.4).

**INV-18** — Il crafting e la riparazione (GP-26), se realizzati, **DEVONO** essere un servizio o un
modulo distinto che **usa** l'inventario tramite l'orchestrazione, non regole interne a questo.

## Criteri di test

- Un trasferimento interrotto a metà lascia lo stato invariato.
- L'impilamento rispetta il massimo e non fonde oggetti con stato individuale diverso.
- Il peso totale è coerente dopo 10³ operazioni casuali di aggiunta, rimozione e trasferimento.
- Un quest item non può essere venduto né lasciato cadere; smarcato, sì.
- Nessuna operazione può duplicare un `InstanceId`.
- Round-trip di serializzazione su un inventario complesso, equipaggiamento incluso.

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-20, GP-21, GP-22, GP-23, GP-24, GP-26
- [`stats.md`](./stats.md) · [`loot.md`](./loot.md) · [`economy.md`](./economy.md) ·
  [`quest.md`](./quest.md)

# INV — Inventory and equipment

**Area:** Game rules · **Nature:** generic · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `INV-*`

## Purpose

Manage the item containers — the player's backpack, an NPC's bag, a chest, a merchant's counter, a
pile of loot on the ground — with weight, stacking, equipment slots and transfer constraints.

A single service for all containers: trading with a merchant and looting a corpse are the same
transfer with different rules.

## Contract

| Item | Value |
|---|---|
| Depends on | — |
| Does NOT depend on | `excalibur`, `STAT`, `QST`, `ECO`, other services |
| Consumed by | orchestration |
| Dynamic state | container contents, equipped items, item state (wear, charges) |
| Static state | item definitions, slots, stacking rules |
| External data | `content/items/*.json`, `content/items/slots.json` |
| Events emitted | `item-added`, `item-removed`, `item-moved`, `item-equipped`, `item-unequipped`, `container-full`, `item-consumed` |

## Public API (indicative)

```ts
interface ItemDefinition {
  id: ItemId;
  weight: number;
  maxStack: number;                       // 1 = not stackable
  slots: readonly SlotId[];               // where it can be equipped
  requirements: readonly Requirement[];   // evaluated by STAT (STAT-11)
  modifiers: readonly StatModifier[];
  tags: readonly ItemTag[];               // 'weapon' | 'consumable' | 'key' | 'quest' | …
  unique: boolean;
}

interface ItemInstance {
  instanceId: InstanceId;                 // stable: needed by quests and tracking
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

## Requirements

### Model

**INV-1** — There **MUST** be a single container model for backpack, chest, corpse, merchant's
counter and pile on the ground: they differ in **capacity and rules**, not in type.

**INV-2** — Items **MUST** distinguish **definition** (static, shared, keyed by `ItemId`) from
**instance** (dynamic, with a stable `InstanceId`, quantity, wear, charges) (ARC-10.3).

**INV-3** — Identical items with no individual state **MUST** stack up to a declared maximum; those
with state of their own (different wear, enchantments) **MUST NOT** stack (GP-24).

**INV-4** — Every container **MUST** be able to have a **weight** limit, a **slot count** limit, or
both. Exceeding it **MUST** be reported with an explicit outcome, never with a silent loss of items.

**INV-5** — **Encumbrance** (GP-21) **MUST** be computed here as observable state (load percentage,
thresholds crossed); its **consequences** on attributes are modifiers applied by `STAT` (STAT-7),
not rules of this service.

### Quest items

**INV-6** — An item **MUST** be markable as a **quest item**: weight 0, not droppable, not sellable,
not destructible while the flag is set (GP-20).

**INV-7** — The service **MUST NOT** know about quests: it applies the flag, it does not decide when
to set or clear it. It is the orchestration, reacting to `QST`'s events, that marks and unmarks
(ARC-4.1).

### Equipment

**INV-8** — There **MUST** be **equipment slots** defined in data (weapon, secondary weapon, helmet,
body, accessories), with occupancy rules: a two-handed weapon occupies two slots (GP-22).

**INV-9** — The **requirements** for equipping **MUST** be checked through a port
(`RequirementChecker`) implemented on top of `STAT`, not by importing `STAT` (ARC-4.1, STAT-11).

**INV-10** — Equipping **MUST** produce the events that allow `STAT` to apply the modifiers: the
inventory service **MUST NOT** modify attributes.

**INV-11** — An equipped item **MUST** stay in the inventory and be flagged, not moved into a
separate container: this avoids the class of bugs where an item exists twice or disappears when
unequipped.

### Consumption and transfer

**INV-12** — Consumables **MUST** be supported with charges and effects declared in data; consuming
emits the event, while the **effect** is applied by the orchestration through `CBT` or `STAT`
(GP-23).

**INV-13** — Transfer between containers **MUST** be **atomic**: either the item is removed from one
and put in the other, or nothing changes. No state in which the item exists in both or in neither.

**INV-14** — The transfer rules (theft, looting, trade, gift) **MUST** be parameters of the call, not
different containers: whoever transfers declares the context, the service applies the constraints.

**INV-15** — **Unique** items **MUST** be guaranteed to be so: the service **MUST NOT** allow an
`InstanceId` to be duplicated. The serialization round trip **MUST** verify it.

**INV-16** — The ordering of the returned contents **MUST** be deterministic (ARC-9.4).

**INV-17** — The service **MUST** work with a made-up item catalogue: it does not know about swords,
it knows about items with weight, tags and slots (ARC-3.4).

**INV-18** — Crafting and repair (GP-26), if implemented, **MUST** be a distinct service or module
that **uses** the inventory through the orchestration, not rules internal to this one.

## Test criteria

- A transfer interrupted halfway leaves the state unchanged.
- Stacking respects the maximum and does not merge items with different individual state.
- The total weight is consistent after 10³ random add, remove and transfer operations.
- A quest item cannot be sold or dropped; once unmarked, it can.
- No operation can duplicate an `InstanceId`.
- Serialization round trip on a complex inventory, equipment included.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-20, GP-21, GP-22, GP-23, GP-24, GP-26
- [`stats.md`](./stats.md) · [`loot.md`](./loot.md) · [`economy.md`](./economy.md) ·
  [`quest.md`](./quest.md)

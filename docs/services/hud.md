# HUD — Interface and screens

**Area:** Presentation · **Nature:** domain · **Priority:** 3 · **Status:** proposed
**Requirement prefix:** `HUD-*`

## Purpose

Show the player the state of the game and let them act on it: health and energy bars, quest log,
inventory, map, pause menu, dialogue and trading screens, contextual interaction.

The HUD **reads** the domain and **sends actions**; it contains no rules. If a screen has to decide
whether an item is equippable, the answer comes from `STAT`, not from a condition written in the
panel.

## Contract

| Item | Value |
|---|---|
| Depends on | `excalibur` (or a DOM layer), `I18N`, `INP`; observes the bus |
| Does NOT depend on | the domain services for **writing**: it sends intents |
| Consumed by | the player |
| Dynamic state | active screen, selection, scrolling, queued notifications |
| Static state | layouts, themes, screen definitions |
| External data | `content/ui/*.json` + `I18N` catalogues |
| Events emitted | none — it **MUST NOT** publish (BUS-3). Intents go through the orchestration's command API |

## Requirements

**HUD-1** — The HUD **MUST** show health and energy bars, active statuses and the selected weapon or
skill (GP-49).

**HUD-2** — There **MUST** be a **quest log** built from `QST`'s data (QST-11), with objectives,
status and a distinction between active, completed and failed (GP-50).

**HUD-3** — There **MUST** be an **inventory and equipment** screen that shows weight, encumbrance,
slots and unmet requirements together with the reason (GP-51, INV-9).

**HUD-4** — There **SHOULD** be a **minimap** and/or a world map, built from `MAP`'s data grid and
from the exploration state (GP-52).

**HUD-5** — There **MUST** be a **pause menu** with options, save and load; opening it **MUST**
pause game time (TIME-2) and switch the input context (INP-3) (GP-53).

**HUD-6** — **Contextual interaction MUST** present the actions available on the selected target —
attack, talk, use, rob, pick a lock — built from the entity's affordances and capabilities, not from
a hardwired list (GP-54, AFF-15, ARC-6.2).

**HUD-7** — Contextual interaction **MUST** show the correct control for the device in use, by
querying `INP` (INP-12).

**HUD-8** — Every text **MUST** come from `I18N`: no strings in the interface code (I18N-1). The
layout **MUST** cope with texts of very different lengths across languages.

**HUD-9** — The HUD **MUST NOT** contain game rules: it asks the domain and shows the result. No
price, damage or requirement computation in the interface code.

**HUD-10** — The HUD **MUST** update by reacting to **domain events**, not by querying the state
every frame.

**HUD-11** — Screens **MUST** stack consistently with the input context stack (inventory above pause
above game), and closing **MUST** restore exactly the previous state (INP-3).

**HUD-12** — Notifications (quest advanced, item received, reputation changed) **MUST** be queued
and shown without overlapping or getting lost in case of a burst.

**HUD-13** — The HUD **MUST** support the **accessibility** options: text size, effect reduction,
contrast (GP-66).

**HUD-14** — The HUD **MUST** be navigable with pointer as well as with keyboard and gamepad,
according to the current bindings.

**HUD-15** — The interface **MUST** be able to be absent: a headless game runs without a HUD
(ARC-1.4).

**HUD-16** — The HUD **MUST NOT** publish on the bus (BUS-3, BUS-16). It sends its intents through a
**named, typed command API exposed by the orchestration** — `equip(itemId, slot)`,
`requestTrade(merchantId)` — injected into the panels, which **enqueues**; the orchestration drains
the queue at a fixed point in the tick, beside `INP`'s. A click handler that reached the domain
directly would mutate it mid-frame, possibly during a `flush()`, at a moment chosen by the browser.

A named API rather than a union of intent events: the arguments are typed, a typo is a compile
error, it is discoverable from the call site, and it cannot be mistaken for the bus by a later
reader. `INP`'s abstract actions cannot carry these — they are a closed set with no payload,
deliberately generic (ARC-3.2), and `ui-equip-requested` names an item, a slot and a target.

## Test criteria

- The quest log reflects the state of the quests after a sequence of advancements, without periodic
  polling.
- An unmet requirement is shown with the correct reason coming from `STAT`.
- Opening and closing stacked screens restores the exact input context.
- Ten notifications in one frame are all shown, in order.
- With texts three times as long, no element overflows its own bounds.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-49…GP-54, GP-66
- [`input.md`](./input.md) · [`localization.md`](./localization.md) · [`quest.md`](./quest.md) ·
  [`inventory.md`](./inventory.md) · [`affordance.md`](./affordance.md)

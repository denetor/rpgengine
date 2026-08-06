# Game requirements

**Sibling document of** [`REQUIREMENTS.md`](./REQUIREMENTS.md)
**Status:** proposed

This document describes **what the game must do from the player's point of view**. It does not
describe how it is built: every requirement points to the services that implement it, whose sheets
live in [`services/`](./services/).

Requirement language: **MUST** = mandatory, **SHOULD** = recommended, **MAY** = optional. The `GP-n`
IDs are stable and are not reused; a new requirement takes the next free number, regardless of
section.

**Marking:** *(essential)* = needed for the game to be playable end to end · *(depth)* = adds
action-RPG substance · *(polish)* = refinement.

---

## 1. Player character

**GP-1** *(essential)* — The character **MUST NOT** have a level structure: progression **MUST**
happen on independent **individual attributes**. → `STAT`

**GP-2** *(essential)* — Attributes **MUST** improve through **training with masters**, not through
experience points spent at will. → `STAT` `DLG`

**GP-3** *(depth)* — The game **MUST** provide **perks**, unlocked by elapsed time or by reaching
thresholds on one or more attributes. → `STAT`

**GP-4** *(depth)* — There must be **skills** distinct from the base attributes (e.g. lockpicking,
alchemy, persuasion, bargaining), which improve **with use** and/or with training. → `STAT`

**GP-5** *(depth)* — Equippable items and dialogue options **MAY** have minimum requirements on
attributes or skills. → `STAT` `INV` `DLG`

**GP-6** *(essential)* — Hit points, energy and any mana **MUST** be **derived** from the attributes
according to declared formulas, not independent values. → `STAT`

---

## 2. Map and world

**GP-7** *(essential)* — The game **MUST** contain areas with a **hand-drawn map** made with Tiled.
→ `MAP`

**GP-8** *(depth)* — The game **MUST** contain areas with a **randomly generated map**. → `GEN`

**GP-9** *(depth)* — The game **MUST** contain areas generated randomly by **composing
rooms/sectors** taken from a pool and connected together. → `GEN`

**GP-10** *(depth)* — Items and enemies **MUST** respawn after a time depending on the area type:
**short** in random areas, **infinite** (no respawn) in fixed areas. → `TIME` `ENT` orchestration

**GP-11** *(depth)* — The world **MUST** contain interactive objects: doors, levers, locked chests
(openable by lockpicking or with a key), traps. → `ENT` `INV` `STAT`

**GP-12** *(depth)* — The game **MUST** have a **day/night cycle**, with a game clock that influences
NPCs, lighting and spawning. → `TIME`

**GP-13** *(depth)* — NPCs **SHOULD** have **daily routines** (home, work, tavern) tied to the time of
day. → `TIME` `AI` `PATH`

> The internal structure of the map (layers, Dual Grid System, Y-ordering, overhead, collision) is
> specified in [`MAP-REQUIREMENTS.md`](./MAP-REQUIREMENTS.md).

---

## 3. Combat

**GP-14** *(essential)* — Combat **MUST** have **damage types** (slashing, piercing, blunt, fire,
poison…) with per-entity resistances and vulnerabilities. → `CBT`

**GP-15** *(depth)* — There **MUST** be timed status effects: poisoning, bleeding, stun, slow, buffs
and debuffs. → `CBT` `TIME`

**GP-16** *(depth)* — Hits **MUST** produce knockback and a hit reaction (hitstun), parameterized by
the weapon. → `CBT`

**GP-17** *(depth)* — The player **SHOULD** have blocking/parrying and/or dodging with a temporal
invulnerability window. → `CBT` `INP`

**GP-18** *(depth)* — The player **MUST** be able to use ranged attacks and magic, not just the
enemies. → `CBT`

**GP-19** *(essential)* — The damage formula **MUST** be single, formalized and deterministic given a
seed. → `CBT` `RND`

---

## 4. Inventory, items, loot

**GP-20** *(essential)* — Items **MAY** have the **quest item** status: weight 0 and neither
droppable nor sellable until the relevant quest is closed. → `INV` `QST`

**GP-21** *(depth)* — There **MUST** be a maximum carryable weight, with encumbrance effects.
→ `INV` `STAT`

**GP-22** *(essential)* — There **MUST** be equipment slots (weapon, armour, accessories) whose
contents modify the attributes. → `INV` `STAT`

**GP-23** *(depth)* — There **MUST** be consumables (potions, food) with immediate or timed effects.
→ `INV` `CBT`

**GP-24** *(polish)* — Identical items **MUST** stack; unique or legendary non-stackable items
**MAY** exist. → `INV`

**GP-25** *(depth)* — Enemies, crates and chests **MUST** release loot according to **weighted loot
tables**. → `LOOT` `RND`

**GP-26** *(depth)* — The game **MAY** provide crafting and repair. → `INV`

---

## 5. NPCs and artificial intelligence

**GP-27** *(essential)* — Some NPCs **MAY** have the **quest NPC** status, which prevents them being
killed. → `ENT` `QST` `CBT`

**GP-28** *(depth)* — Merchants **MUST** have **finite** money and stock, which regenerate after a
timeout. → `ECO` `INV` `TIME`

**GP-29** *(essential)* — NPCs **MUST** react to world conditions and to the player's behaviour: if
wounded, an NPC may flee or counterattack depending on temperament, health and allies present.
→ `AI` `BB`

**GP-30** *(depth)* — NPCs **SHOULD** have **different personalities** with the same decision logic
(a coward, a fanatic, a mercenary), obtained by varying curves and thresholds, not by writing
different AIs. → `AI`

**GP-31** *(depth)* — NPC decisions **SHOULD** take **shared group knowledge** into account: if the
squad mates are dead, courage drops and fleeing becomes likely. → `BB` `AI`

**GP-32** *(depth)* — Scenery elements **SHOULD** be able to **advertise their own use** so that NPCs
consider them in their choices: a fresh water source reduces thirst, a rabbit is food for a
carnivore strong enough, a chair allows sitting down. → `AFF` `AI`

---

## 6. Quests

**GP-33** *(essential)* — The game **MUST** offer predetermined quests, with objectives, progress
conditions and rewards defined as data. → `QST`

**GP-34** *(essential)* — The state of every quest **MUST** be observable by dialogues, NPCs and the
world (an active quest can change what can be said or done). → `QST` `DLG`

**GP-35** *(depth)* — **Failing** a quest **MUST** be a foreseen outcome, with alternative branches or
definitive closure. → `QST`

---

## 7. Dialogues

**GP-36** *(essential)* — Dialogue options **MUST** vary based on the **previous dialogues** already
had with that NPC. → `DLG`

**GP-37** *(essential)* — Dialogue options **MUST** vary based on the **state of the quests**.
→ `DLG` `QST`

**GP-38** *(essential)* — Dialogue options **MUST** vary based on the **reputation** between the
player and the speaker (personal and faction-wide). → `DLG` `FAC`

**GP-39** *(depth)* — Dialogue options **MAY** be conditioned by attributes, skills and items held.
→ `DLG` `STAT` `INV`

---

## 8. Factions and reputation

**GP-40** *(depth)* — There **MUST** be factions of different natures: citizens of a locality,
corporations, criminal groups, religious orders. → `FAC`

**GP-41** *(depth)* — Every faction **MUST** have **N membership levels**, which unlock advantages and
dialogue options. → `FAC` `DLG`

**GP-42** *(depth)* — There **MUST** be a player reputation with each faction. → `FAC`

**GP-43** *(depth)* — There **MUST** be an **individual** reputation modifier between the player and a
single NPC, which adds to the faction one. → `FAC`

**GP-44** *(depth)* — The relations **between factions** (alliance, hostility) **SHOULD** partially
propagate reputation changes. → `FAC`

---

## 9. Economy

**GP-45** *(depth)* — Buying and selling prices **MUST** be modulated by reputation, faction and
bargaining skill. → `ECO` `FAC` `STAT`

**GP-46** *(depth)* — Money **MUST** be a finite resource for merchants too: they cannot buy beyond
their own liquidity. → `ECO`

---

## 10. Crime and notoriety

**GP-47** *(depth)* — Illegal actions (theft, assault, murder) **MUST** have effect only if
**observed** by an NPC able to perceive them. → `CRM` `AFF` `SPX`

**GP-48** *(depth)* — There **MUST** be a per-faction bounty/notoriety, with consequences: hostile
guards, worse prices, foreclosed dialogues. → `CRM` `FAC` `ECO`

---

## 11. Interface and feedback

**GP-49** *(essential)* — There **MUST** be a HUD with health and energy bars, active statuses, and
the selected weapon or skill. → `HUD`

**GP-50** *(essential)* — There **MUST** be a **quest log** with objectives and status.
→ `HUD` `QST`

**GP-51** *(essential)* — There **MUST** be an inventory and equipment screen. → `HUD` `INV`

**GP-52** *(polish)* — There **SHOULD** be a minimap and/or a world map. → `HUD` `MAP`

**GP-53** *(essential)* — There **MUST** be a pause menu with options, saving and loading.
→ `HUD` `SAVE`

**GP-54** *(essential)* — Interaction **MUST** be contextual with respect to the selected target:
attack, talk, use, rob. → `INP` `HUD` `AFF`

---

## 12. Audio

**GP-55** *(essential to the experience)* — There **MUST** be background music per area and situation
(exploration, combat), with non-abrupt transitions. → `AUD`

**GP-56** *(essential to the experience)* — There **MUST** be sound effects for actions, hits,
interface and environment. → `AUD`

**GP-57** *(polish)* — The volume **MUST** be adjustable separately for master, music and effects.
→ `AUD` `CFG`

---

## 13. Death, saving, continuity

**GP-58** *(essential)* — The player's death **MUST** be handled explicitly: game over, respawn or
loading the last save, according to a declared rule. → `SAVE` `STAT`

**GP-59** *(essential)* — The game **MUST** be savable and reloadable, restoring player state,
quests, dialogues, inventory and world. → `SAVE`

**GP-60** *(essential)* — There **MUST** be multiple save slots and an autosave. → `SAVE`

**GP-61** *(polish)* — A save created by a previous version of the game **MUST** be either loadable or
rejected with a clear message, never loaded in a corrupted way. → `SAVE`

---

## 14. Controls and accessibility

**GP-62** *(essential)* — Controls **MUST** go through a layer of **abstract actions**: no physical
key hardwired into the game logic. → `INP`

**GP-63** *(polish)* — Controls **MUST** be remappable, with gamepad support. → `INP`

**GP-64** *(essential)* — There **MUST** be input buffering: an attack issued during an animation is
queued and executed as soon as possible. → `INP`

**GP-65** *(polish)* — All texts **MUST** be externalized and localizable. → `I18N`

**GP-66** *(polish)* — There **SHOULD** be accessibility options: text size, reduction of screen shake
and effects. → `HUD` `CFG`

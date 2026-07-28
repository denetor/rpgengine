# TRPG — Technical documentation of the prototype

> Role-playing game prototype (top-down/action RPG) in which a character moves
> on a map made with **Tiled** and interacts with objects, friendly NPCs and
> enemies driven by non-trivial artificial intelligence.

This document describes:

1. The **features** currently implemented (and those sketched out).
2. The **technologies** applied.
3. The architectural **methodologies and structures** that make the features possible.

---

## 1. Features

### 1.1 Game world and character movement

- The world is a **Tiled** map (`res/test-level.tmx`, 64×64 tiles of 16px) made up of several
  layers: `terrain`, `terrain2`, `solid` (collisions) and an object layer `objects`.
- The **player** (`PlayerActor`) moves in the 4 directions with the arrow keys, with *idle* and
  *walk* animations for each direction (N/E/S/W). Speed depends on the character's statistics
  (agility → easing function).
- The **camera follows the player elastically** (`elasticToActor`).
- Display is full screen, in *pixel art* mode.

### 1.2 Objects in the world

Objects are instantiated automatically from the Tiled map based on their *type*, through registered
factories (see §3.2). Present are:

- **Fixed / decorative objects**: crates, chests, signs, statues, mushrooms, books, potions,
  skeletons, etc. (defined as Tiled objects; only some have a dedicated actor).
- **Movable and destructible objects**: the **wooden crates** (`CrateActor` + `Crate` model). They
  have hit points and armour, can take damage and be destroyed; on destruction a transient "dust"
  animation appears (`ItemDestroyedActor`).

### 1.3 Combat

- The player owns a **sword** (`SwordActor`), a child actor of the player, activated with the
  spacebar. The attack is handled as a state machine (`ContactAttackStatus`:
  `None → Init → Active → End`): during the *swing* a circular collider is temporarily enabled and
  the directional animation is played.
- The collision of the sword with an entity that has a `model` sends damage through the `Hittable`
  interface's `takeHit()`. Damage shows a **floating damage label** (`DamageLabel`) and an impact
  animation (`SwordHitActor`).
- **Damage is computed by the weapon's model** (e.g. the sword: the sum of two pseudo-random rolls,
  "dice" style), and attenuated by the target's **armour**.
- Ranged enemies fire **projectiles** (`MissileActor`, e.g. the slime's "splat",
  `SlimeSplatActor`) which, on hitting the player, reduce their hit points.
- When the player takes significant damage, the camera **shakes** (`camera.shake`) in proportion to
  the relative damage.

### 1.4 NPCs and AI (enemies and non-hostile characters)

NPCs derive from a common base class `NpcActor` and are driven by a **finite state machine** (FSM).
Available states (`States`): `IDLE`, `TALK`, `WANDER`, `PATROL`, `FIGHT_PLAYER`, `CHASE_PLAYER`,
`FLEE_PLAYER`. Each NPC type declares only the **subset** of states it can assume.

Implemented behaviours:

- **Slime (hostile enemy)** — states: `IDLE`, `WANDER`, `CHASE_PLAYER`, `FIGHT_PLAYER`,
  `FLEE_PLAYER`. The non-trivial behaviour required:
  - it **chases** the player when nearby (`CHASE_PLAYER`);
  - it **fights** when the player is in range (`FIGHT_PLAYER`, fires *splat*);
  - it **flees** when too wounded (`FLEE_PLAYER`, when `health < FLEE_HEALTH`);
  - it **wanders** randomly around its initial position when calm (`WANDER`).
- **Merchant (non-hostile NPC)** — states: `IDLE`, `WANDER`, `FLEE_PLAYER`. It does not attack; it
  greets the player when they approach.
- **Proximity detection**: every NPC may have a child "detector" actor (circular collider) that
  raises events when the player enters the radius.
- **Optimization**: the AI routine only runs if the player is within `runAiRadius` and at discrete
  intervals (`aiInterval`, e.g. 100–250 ms), not every frame.

### 1.5 Dialogues and interaction

- **Ephemeral messages** above the actor's head (`EphemeralMessage` + `Talkable` interface): used to
  make NPCs and the player "speak" (e.g. the slime says "Hi, player", the merchant "Hi, need to buy
  something?"). AI state changes can also be announced on screen.
- **Full-width on-screen messages** (`ScreenMessage`), with a semi-transparent background,
  multi-line and self-hiding.
- **Actor context menu** (`ActorMenu`): clicking an NPC highlighted by the pointer brings up a small
  menu (currently a graphical placeholder) with auto-hide after 3 seconds.
- The real dialogue system (dialogue tree, conditions, state) is **designed but not yet
  implemented**: only the `DialogsRepository` skeleton exists. The design is described in the
  `README.md`.

### 1.6 Quests

Quest system **structured but partially implemented**:

- An **inventory of quests** available in the world (`QuestsRepository`), each with `stages`
  (progressive phases), `preconditions` (to start it) and, for every stage, `preconditions` and
  `onComplete` (actions on progress). Two example quests on the theme of "find your ancestors" are
  already defined.
- A **state of the quests started** by the player (`QuestsStatusRepository` + `QuestStatus`, with
  `currentStage`).
- A **manager** (`QuestManagerService`) that knows how to: start a quest (`startQuest`), retrieve
  the active quest (`activeQuest`), determine the next stage (`nextStage`). The `testPreconditions()`
  and `onComplete()` functions are present as **placeholders** (logic still to be implemented, as
  the `TODO`s indicate).

---

## 2. Technologies applied

| Area | Technology | Notes |
|---|---|---|
| Language | **TypeScript 5.7** | All source code in `src/`, strong typing. |
| Game engine | **Excalibur.js 0.30.2** | 2D engine for the web: Engine, Scene, Actor, Collider, Animation, SpriteSheet, camera, input, clock/timer. |
| Maps | **Tiled** + **@excaliburjs/plugin-tiled 0.30.1** | Loading of `.tmx`/`.tsx`; object instantiation through `entityClassNameFactories`. |
| Bundling | **Webpack 5** + **ts-loader** | `webpack-dev-server` for development (port 9000, HMR), `asset/resource` for images/audio. |
| Asset copying | **copy-webpack-plugin** | Copies `index.html`, `res/`, `img/` into `dist/`. |
| Static serving | **http-server** | To serve the build. |
| Rendering | **HTML5 Canvas** | A single `<canvas id="game">` in `index.html`. |

Main scripts (`package.json`): `start` (dev-server), `build` / `build:prod` / `build:dev`, `serve`.

---

## 3. Architectural methodologies and structures

The architecture clearly separates the **runtime presentation/behaviour** (Excalibur's *Actors*, in
`src/actors/`) from the **domain logic and data** (the *models* in `src/models/`), with
**factories**, **repositories** and **services** acting as glue. This allows the game rules to
evolve without touching the graphics code.

### 3.1 Actor / Model separation

- An **Actor** (e.g. `PlayerActor`, `SlimeActor`, `CrateActor`) handles sprites, animations,
  collisions, input and lifecycle in the engine.
- Every Actor delegates the logic to a **Model** (`Player`, `Slime`, `Crate`, …) that holds
  statistics and domain state (health, armour, strength/agility/intelligence, AI state…).
- The link is bidirectional where needed: the `Character` knows its own `actor` in order to read its
  position or call `say()`.

Model hierarchies (inheritance):

```
Item (Hittable)                Character (Hittable)
 ├─ Crate                       ├─ Player (has mainWeapon)
 └─ Weapon (abstract)           └─ Slime
     └─ Sword
```

### 3.2 Factory + declarative loading from the map

The Tiled plugin is configured (in `src/resources.ts`) with a *Tiled type → factory* map:

```ts
entityClassNameFactories: {
    playeractor: PlayerActorFactory.create,
    crate:       CrateActorFactory.create,
    pngSlime:    SlimeActorFactory.create,
    npcMerchant: MerchantActorFactory.create,
}
```

This way **placing an enemy or an object in the world is done in the Tiled editor**, with no code:
when the scene loads (`Resources.TiledMap.addToScene`) every object with that `type` is instantiated
by the corresponding factory at its position. The factories (`src/factories/`) are small and
uniform: they build the actor and set its *z-order*.

### 3.3 Finite state machine for the AI (State + Strategy pattern)

The NPC AI is the most elaborate structure. It is split into two responsibilities:

- **`StateManager`** (`src/models/state-manager.model.ts`) — the **transition logic**: static
  `updateXxxState()` methods, one per state, deciding whether and to which state to transition,
  based on conditions (player near/attackable, health, state availability, probabilistic rolls).
  Each state can transition only to a subset of states.
- **`NpcActor.doAction()`** — the **execution of the current state's action** (`doChasePlayer`,
  `doFleeFromPlayer`, `doFightPlayer`, `doWander`).

Update cycle (in `NpcActor.onPreUpdate`):

```
every aiInterval ms:
   model.updateState(engine)     // 1. update variables (distance, proximity…)
                                  // 2. if within runAiRadius → StateManager.updateState()
   doAction(engine, elapsed)     // executes the current state's action
```

Advantages of this structure:

- The required **"non-trivial" behaviours** (chase, then flee if too wounded) emerge naturally from
  the transition rules, with no ad-hoc code per enemy.
- An **NPC's personality** is defined declaratively through the list of `availableStates` (a slime
  can fight, a merchant cannot).
- Common behaviour lives in `NpcActor`; specialization (sprites, projectile type, reactions to
  detection) happens by **override** in the subclasses (`getMissileActor`, `onDetector`, `say`).

### 3.4 Contract interfaces

Small interfaces define cross-cutting capabilities, decoupling users from implementors:

- **`Hittable`** — `takeHit(impact): number`: anything that can take damage (characters and
  objects). It lets the sword/projectile generically damage `other.owner.model`.
- **`Talkable`** — `say(message)`: any actor that can show ephemeral text.

### 3.5 Repository and Service (data / operations separation)

Inspired by a layered organization:

- **Repositories** (`QuestsRepository`, `QuestsStatusRepository`, `DialogsRepository`): they hold and
  query collections of data (the quests available in the world vs. the quests started by the player,
  whose state will need to be savable).
- **Services** (`QuestManagerService`): orchestrate operations on the repositories (starting a
  quest, advancing a stage, checking preconditions). The scene (`DevScene`) instantiates and wires
  repositories and services together through constructor **dependency injection**.

### 3.6 Animation and easing factories (reusable utilities)

- **`AnimationFactory.createScaled()`** centralizes the creation of animations scaled from a sprite
  sheet to a target size: it removes duplication across the many animated Actors.
- **`EasingsService`** provides mathematical functions (e.g. `easeInOutQuad`) used, for example, to
  map agility onto walking speed non-linearly.

### 3.7 Centralized configuration

`src/config.ts` gathers the **balancing parameters** (engagement radii, proximity/attack distances,
wandering/flight probabilities, message fonts). Concentrating the constants here allows the game to
be *tuned* without hunting for values scattered through the code.

### 3.8 Actor lifecycle and composition

The prototype makes full use of Excalibur's conventions:

- **Parent/child composition**: the sword is a child of the player; the proximity detectors are
  children of the NPC; labels are children of on-screen messages.
- **Lifecycle hooks**: `onInitialize` (sprite/animation setup), `onPreUpdate` (input, AI, health
  check), `onCollisionStart` (damage), `onPostKill` (destruction effects).
- **Events**: pointer input (`pointerenter`/`pointerleave`/`down`) for selection and menus;
  collision events for detectors and weapons; animation-end events to close the attack.
- The engine's **Clock/Timer** for timings (attack cooldown, message auto-hide, projectile
  lifetime).

---

## 4. Progress status (summary)

| Area | Status |
|---|---|
| Movement, camera, Tiled map | ✅ Working |
| Destructible objects (crates) | ✅ Working |
| Melee combat (sword) | ✅ Working |
| Enemies with AI (chase/fight/flee/wander) | ✅ Working |
| Enemy projectiles | ✅ Working |
| Ephemeral / on-screen messages | ✅ Working |
| Actor context menu | 🟡 Placeholder graphics |
| Quest system | 🟡 Structures ready, precondition/completion logic to be implemented (`TODO`) |
| Dialogue system | 🔴 Only designed (`README.md`) and the `DialogsRepository` skeleton |
| Click interaction (attack/talk/use) | 🔴 Planned (`TODO` in `DevScene`) |
| Saving/persistence | 🔴 Not implemented (planned for quest and dialogue state) |

---

## 5. Folder structure (reference)

```
src/
├─ main.ts                 Bootstrap of the Engine and the scenes
├─ config.ts               Game parameters and styles
├─ resources.ts            Assets, Tiled map and factory registration
├─ scenes/
│   └─ dev.scene.ts        Development scene (world + input + quest manager)
├─ actors/                 Runtime behaviour (Excalibur Actor)
│   ├─ player.actor.ts, sword.actor.ts, crate.actor.ts
│   ├─ npc/                npc.actor (base), slime, merchant
│   ├─ weapons/            missile, slime-splat
│   ├─ ui/                 actor-menu, screen-message
│   ├─ misc/               ephemeral messages, damage labels, effects
│   └─ *.interface / *.enum  Talkable, ContactAttackStatus
├─ models/                 Domain logic and data
│   ├─ character.model, player.model, item.model, weapon.model
│   ├─ state-manager.model, states.enum, hittable.interface
│   ├─ npcs/, items/, weapons/
│   ├─ quest*.model
│   └─ repositories/       quests, quests-status, dialogs
├─ services/               quest-manager, easings
└─ factories/              player/crate/slime/merchant + animation.factory
```

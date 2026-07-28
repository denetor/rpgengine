# Architectural assessment report — TRPG

> A critical assessment of the prototype in the light of common practice in 2D action-RPG
> development and, above all, of **future scalability**: completing the sketched features
> (quests, dialogues, interaction) and adding new ones.
>
> The tone is deliberately critical: the strengths are acknowledged, but the value of this report
> lies in the risks. Every judgement is anchored to real code.

---

## 0. Summary judgement

The prototype is **well set up as a prototype**: the high-level choices (Actor/Model separation,
data-driven loading from Tiled, centralized config, repository/service layering) are sound and show
an author who knows the problems of the domain. **It is not, however, set up to become a real game
as it stands**: the techniques that work today on 4 entity types degenerate quickly as variety
grows. The three risks that, if not tackled soon, will make development ever more expensive are:

1. **Inheritance instead of composition/ECS** → combinatorial explosion of subclasses.
2. **Global state + coupling through direct references and magic strings** → rigid, untestable code
   with circular dependencies.
3. **Game data encoded in TypeScript** (quests, and tomorrow dialogues/items/enemies) instead of in
   data files → content does not scale and requires a programmer for every change.

Verdict: **keep the conceptual framework, rebuild the implementation mechanisms** before adding a
critical mass of content. The right window to do it is **now**, while the code is small.

---

## 1. Strengths (with caveats)

| # | Strength | Why it is good | Caveat |
|---|---|---|---|
| P1 | **Actor / Model separation** | The domain logic (health, stats, AI state) is isolated from rendering: it is the premise for testability and for evolving the rules without touching the graphics. | It is realized through **inheritance**, not composition: the strength turns against itself (see D1). |
| P2 | **Data-driven loading from Tiled** (`entityClassNameFactories`) | Industry standard: placing entities is the level designer's job in the editor, not the programmer's. An excellent base for scaling *spatial* content. | *Non-spatial* data (quests, stats, dialogues) does not follow the same principle: it is hardcoded. |
| P3 | **AI FSM split into transition/execution** (`StateManager` vs `doAction`) | Separating "when to change state" from "what to do in the state" is the right choice. | A flat FSM with hand-written transitions does not scale (see D4). |
| P4 | **Capability interfaces** (`Hittable`, `Talkable`) | They decouple whoever deals damage from whoever takes it. It is already a step towards components. | Little used and bypassed with `as any`; they should be promoted to real components. |
| P5 | **Centralized config** (`config.ts`) | Balance tuning in a single place: healthy practice. | It covers only part of it; many magic numbers (z-order, sprite grids) remain scattered. |
| P6 | **Awareness of AI performance** (`runAiRadius`, `aiInterval`) | Not running the AI every frame for every NPC is a mature choice, rare in prototypes. | The optimization is undone by the O(n) scan of the scene on every tick (see D3). |
| P7 | **Repository/Service layering + DI** for quests | Clean and familiar structure; the scene injects the dependencies. | 60% of the service logic is `TODO`/placeholder, and buggy (see §3.3). |

A cross-cutting note: the **inline documentation** (JSDoc) and the `README` with the dialogue/quest
design are above average for a prototype. Good hygiene.

---

## 2. Architectural defects and risks (ordered by impact on scalability)

### D1 — Deep inheritance where composition is needed (risk #1)

The `NpcActor → SlimeActor/MerchantActor` and `Item → Weapon → Sword` hierarchies are the classic
anti-pattern of action RPGs. Excalibur itself is **entity-component** under the hood: the project is
rowing against the current.

Symptoms already present:

- `NpcActor` is a **God class**: it assumes that *every* NPC has throwing weapons
  (`hasMissileWeapon()` always returns `true`), contact weapons, detectors, and knows how to
  chase/flee/wander/fight. It is the "fragile base class problem" in embryo.
- An immediate scalability question: *"a merchant who can also fight"* or *"a friendly slime"*
  (already present in the map as `slimeFriendly`!). With single inheritance you have to pick a
  branch and **duplicate** the rest. With components you add/remove behaviours.

**Correct direction:** model the entities as a **composition of components/behaviours**
(`HealthComponent`, `CombatComponent`, `AIComponent`, `DialogComponent`, `LootComponent`, …),
leveraging Excalibur's ECS instead of fighting it. The `Hittable`/`Talkable` interfaces are already
the right seed: they should become components, not inherited methods.

### D2 — Global state and circular dependencies

`main.ts` exports the mutable singletons `game` and `status`, imported directly deep down:
`npc.actor.ts` does `import { status } from '../../main'`. This creates the cycle
`main → DevScene → *Actor → main` and couples every actor to the application bootstrap.

Consequences: impossible to test an actor in isolation, impossible to have several independent
scenes/saves, risky refactorings. `status.selectedActor` is moreover **untyped** (`actor: null` +
`as any` everywhere).

**Correct direction:** an injected `GameContext`/service (or an `EventBus`) instead of the global
imports. The UI selection state belongs to the scene or to an input controller, not to a module
singleton.

### D3 — Communication through direct references and magic strings (no event bus)

There is no messaging system. Entities are found by scanning the scene by **string name**:

```ts
engine.currentScene.actors.find(a => a.name === 'player')  // on every AI tick, for every NPC
```

and logic everywhere depends on strings (`name === 'missile'`, `'sword'`, `'crate'`; player state
`'idle'/'walk'/'swordAttack'`; directions `'N'/'E'/'S'/'W'`; animation keys).

Problems: O(n) cost per NPC per tick; a typo in a string = a silent bug; no autocompletion or
compiler checking; strong coupling.

**Correct direction:**
- an **EventBus** for game events (damage dealt, entity died, quest advanced, dialogue opened): it
  decouples sender and receiver;
- Excalibur's **collision groups** instead of name checks in the colliders (there is already a
  defence with `other.owner.id !== this.parent.id`, a workaround);
- **enums/constants** for states, directions and tags; a reference to the player held by the scene,
  not searched for every time.

### D4 — The AI FSM does not scale; duplicated transition logic

`StateManager` has an `updateXxxState` method per state, but the **same conditions** (flee if
wounded, chase if far, fight if in range) are **copied and pasted** into `updateIdleState`,
`updateChasePlayerState`, `updateWanderState`, `updateFightPlayerState`. Adding a state or a
condition means changing N methods: combinatorial growth and a source of inconsistencies.

The `README` already asks for more (transition priorities, modifiers such as "aggressiveness"): a
flat hand-written FSM will not get there. On top of that there is a `console.log('updateState()')`
on a **hot path**.

**Correct direction:** move to a **data-driven FSM** (a state→transition table with conditions and
priorities) or, better for rich behaviours, to a **Behaviour Tree** or **Utility AI**. The
conditions should be extracted as reusable predicates and evaluated in a single place.

### D5 — Game data encoded in TypeScript

`QuestsRepository` holds the quests as **TS literals in the class body**. Tomorrow the dialogues
(the tree), the items, the enemy definitions will follow the same road. It is the main brake on
*content* growth: every quest/dialogue requires a programmer, a rebuild, and cannot be edited by a
game/narrative designer.

Moreover, preconditions and actions are typed `any[]` (`{type: 'player-in-area', value: …}`): no
type safety, no mechanism that **interprets** them (the "effect interpreter" is missing).

**Correct direction:** externalize the content into **data files (JSON/YAML)** loaded as resources;
define a schema with **discriminated unions** for preconditions/effects and an **interpreter** that
executes them (Command/Effect pattern). The repository reads data, it does not contain it.

### D6 — No persistence strategy, even though the design calls for one

The `README` explicitly says that quest state and dialogue state "will need to be saved". Today the
repositories are in-memory arrays and there is no serialization. Persistence is not a detail to be
added at the end: **it conditions how state is modelled** (what is savable, stable IDs, separation
of static data from dynamic state). Adding it late forces a global refactoring.

**Correct direction:** introduce a `SaveService` early (serialization to `localStorage`/file) and
design the dynamic models as **serializable** (no references to `Actor`s inside the savable state —
today `Character.actor` mixes the two things).

### D7 — Thin and coupled combat system

- Damage goes through `(other.owner as any).model.takeHit(...)`: whoever has no `model` is silently
  ignored; there is no notion of damage types, resistances, status effects, knockback.
- `takeHit` is **triplicated** across `Character`, `Item` and `Player` with slightly different
  logic.
- The sword damage `Math.random()*6 + Math.random()*6` produces a triangular distribution in [0,12)
  with a mean of ~6: almost certainly **not** the intent (a "2d6" would be
  `2 + floor(rand*6) + floor(rand*6)`). A symptom of unformalized combat rules.

**Correct direction:** a single `CombatComponent`/service handling a `DamageInfo` (amount, type,
source, knockback) and a single point where damage is computed.

### D8 — Input not centralized

`PlayerActor.onPreUpdate` mixes input, physics, animation, the attack machine and debug messages in
a 100+ line method (the code itself admits: *"temporary: to be centralized"*). There is no input
mapping layer → no rebinding, no gamepad, no **input buffering** (essential in an action RPG for
queueing an attack during an animation).

**Correct direction:** an `InputController`/abstract-action mapping, and a player state handled as a
reusable FSM component (as for the NPCs).

### D9 — Eroded type safety and project quality

- `as any` and `undefined as any` are pervasive: they cancel out the benefit of TypeScript, which is
  exactly what growing code needs.
- **No tests** (no test script, no framework): and yet the Model layer is perfectly testable and
  hosts the most delicate logic (combat mathematics, FSM transitions, quest progression).
- **`dist/` committed** to git (dozens of `*.hot-update.*` files): build artefacts in the
  repository; it belongs in `.gitignore`.
- Minor inconsistencies: factory naming (`crateActorFactory.ts` vs `animation.factory.ts`);
  `ActiveQuest` is sometimes a class and sometimes a literal; a `States` enum for NPCs but strings
  for the player.

---

## 3. Notes on bugs/logic already present (not just style)

Useful because they reveal structural fragility, not just slips:

- **`QuestManagerService.testPreconditions`** returns `false` for any quest with preconditions (the
  loop does nothing and falls through to `return false`): in practice it **blocks** the progress of
  every non-trivial quest. A symptom of §D5 (the interpreter is missing).
- **`nextStage`** returns the first stage with `id >= currentStage`: it can return the **current
  stage** instead of the next one, and it assumes the stages are ordered. Progression needs a better
  model.
- **`Character.actor` inside the model**: it mixes savable dynamic data with a runtime reference; it
  gets in the way of persistence (§D6).
- **Detector as a child Actor with physical collision** rather than a sensor: risk of unwanted
  physical collisions; better a sensor collider + collision group.

---

## 4. What to keep and what to change

### ✅ Keep (good foundations)

- The **Actor/Model separation** as a principle (evolving it into Actor + components).
- The **data-driven loading from Tiled** with factories: extend it, do not replace it.
- The **centralized config**: broaden it by absorbing the remaining magic numbers.
- The `Hittable`/`Talkable` **capability interfaces**: promote them to components.
- The **repository/service layering** for quests and dialogues: correct, it just needs completing
  and making data-driven.
- The idea of **AI throttling**.

### 🔄 Change (before the content grows)

| From | To | Priority |
|---|---|---|
| `NpcActor`/`Item` inheritance | **Component composition** (Excalibur's ECS) | High |
| Global `game`/`status` imports, circular dependencies | **DI / GameContext + EventBus** | High |
| Lookup by string name + magic strings | **Stable references, enums, collision groups, events** | High |
| Flat FSM with duplicated transitions | **Data-driven FSM** or **Behaviour Tree/Utility AI** with reusable predicates | High |
| Quests (and future dialogues/items) in TS code | **External JSON/YAML data + effect interpreter** with discriminated unions | High |
| No persistence | **SaveService + serializable models** (separate state from runtime references) | Medium/High |
| Triplicated `takeHit`, ad-hoc damage | **A single CombatComponent**, `DamageInfo`, formalized rules | Medium |
| Input inline in the player | **InputController + input buffering** | Medium |
| `as any`, zero tests, `dist/` in git | **Type rigour, unit tests on the Model layer, `.gitignore`** | Medium (cross-cutting) |

---

## 5. Recommended roadmap (order of intervention)

Before adding content, consolidate the foundations in the order that maximizes the return and
minimizes future refactorings:

1. **Hygiene and a safety net** (low cost, enables everything else): remove `dist/` from git;
   introduce a test runner; write the first unit tests on the Model layer (damage, FSM transitions,
   quest progression) to freeze the behaviour before refactoring.
2. **Decoupling**: EventBus + removal of the global singletons and of the circular dependencies;
   enums/constants instead of magic strings; collision groups.
3. **Composition**: migrate NPCs and objects from inheritance to components (Health, Combat, AI,
   Dialog, Loot). It is the intervention that unlocks the variety of entities that growth requires.
4. **External data + interpreter**: move quests (and design dialogues/items) into data files with a
   typed schema and a precondition/effect interpreter. Complete the quest logic that is `TODO`
   today, here.
5. **Persistence**: SaveService and separation of dynamic/serializable state from runtime
   references.
6. **Evolved AI**: Behaviour Tree/Utility AI with priorities and modifiers (as per the `README`).
7. **Input and combat**: InputController with buffering; CombatComponent with `DamageInfo`, damage
   types and status effects.

In short: **the ideas are right, the mechanisms need rebuilding on composition, event-based
decoupling and external data**. Doing it now, with ~40 files, costs little; doing it later, with
hundreds of entities and content, will cost a lot.

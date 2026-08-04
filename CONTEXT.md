# RPG engine

An RPG engine, with its test bed and its tools.

## Requirements

The requirements live in `docs/REQUIREMENTS.md`; one sheet per service in `docs/services/`.

## Language

### Architecture

**Service**:
A unit of functionality with a single public surface (`index.ts`), state of its own and no
dependency on the other services. It is the unit of isolation, of testing and of reuse: a service
without a sheet does not exist.
_Avoid_: module, manager, system, component

**Engine**:
The set of generic services, reusable in another 2D game (`engine/`). The engine does not know the
game: it does not know that Aramis's sword exists, it knows how to handle items defined elsewhere as
data.
_Avoid_: framework, core, library

**Game**:
Content, balancing and orchestration specific to this project (`game/`).

**Presentation**:
The layer that owns Excalibur — scenes, `Actor`s, drawing, audio, camera, physical input. It observes
the domain and reacts to its events; the domain does not know it exists.
_Avoid_: view, UI, front-end

**Orchestration**:
The layer that connects the services to each other by reacting to domain events and invoking their
APIs. It encodes the rules of *this* game, which no service knows.
_Avoid_: coordinator, mediator, glue, controller

**Nature**:
The declaration, in every sheet, of whether a service is *generic* (no knowledge of this game) or
*domain* (accepts this project's domain model).

**Domain event**:
An immutable, serializable notification of a fact that has **already happened** (`entity-died`,
`item-picked`), always in the past tense. It is not a command, has no return value and waits for no
answer.
_Avoid_: message, signal, notification

**Command**:
A direct call to a service that returns the outcome **and** the domain events produced, without
publishing them: publishing is the caller's responsibility.
_Avoid_: action, request, operation

**Port**:
A minimal interface declared by a consumer to express what it needs (navigability, perception,
storage, loading). It is the only way a service reaches what it does not own.
_Avoid_: adapter, driver, interface

**Sheet**:
A service's document in `docs/services/`: contract, public API, numbered requirements with a prefix
of its own, test criteria. It says *what*; the ADR says *why not the other way*.
_Avoid_: documentation, specification

**Content**:
The data that describes **things that exist** — this quest, this sword, this archetype — in
schema-validated files, editable by a designer without recompiling.
_Avoid_: assets (those are the binary files), resources

**Configuration**:
The parameters that describe **how the system behaves** — how much a point of Strength weighs, how
often the AI re-evaluates. **Fixed for the run**: composed and validated before the world exists, and
handed to each service as construction parameters (`CFG`). There is no object in which they live
afterwards. Distinct from content, which describes the things that exist, and from preferences, which
the player changes while playing.
_Avoid_: settings, constants, magic parameters

**Preference**:
A value the **player** changes from a menu — volume, language, bindings, accessibility — held by
`SET` and persisted outside the save file, because it belongs to the person and not to the
playthrough. A value is either a configuration parameter or a preference, never both: one with two
homes has two answers.
_Avoid_: user setting, option, config

**Static state**:
Definitions loaded from the content files, immutable at runtime and never serialized: in the save
file they are referenced by stable ID.

**Dynamic state**:
The state that changes during a game; it is the only state that gets serialized, by each service for
its own portion only and with a version number of its own.

**Headless**:
Runnable and testable without a graphics engine, canvas, assets or other services. The same game must
be able to run with no renderer at all: it is the condition that makes system tests possible.

**Reusability proof**:
The test that exercises a generic service with a **made-up** domain, foreign to this game. It is the
executable verification of its nature: without it, "generic" is just a claim.

### World and map

**Data grid**:
The logical integer grid in which every cell contains a single terrain identifier. It is the single
source for gameplay, collision and rendering: nobody keeps a copy of their own.
_Avoid_: tilemap, map, collision layer

**Drawing grid**:
The rendering grid offset by half a tile with respect to the data grid; each of its squares has 4
data cells for corners. It exists only in the presentation.
_Avoid_: display grid

**Dual Grid System (DGS)**:
The autotiling in which every drawing tile is chosen based on its 4 corners, for a total of 16 cases
(2⁴) — the corner method, also known as *marching squares*. Transitions between terrains are
obtained by stacking passes, never with tile sets dedicated to each pair of terrains.
_Avoid_: 47-tile autotile

**Terrain**:
The identifier held in a data cell. Its value is also its **priority**: the terrain with the higher
priority is drawn on top of the lower one.

**Cell**:
The position in integer coordinates on the data grid. **World** coordinates (pixels) are a distinct
type: confusing them is the most common mistake in this domain.
_Avoid_: tile (that is the drawn square), point, position

**Area**:
A named portion of a map with boundaries, properties and a kind — hand-drawn or generated. It is the
unit that respawn, music, spawning and crime jurisdiction hook onto. The `Area:` field at the head of
a sheet is a different thing: it is the service's area of responsibility.
_Avoid_: zone, region, level, map

**z-band**:
A range of `z` values reserved for a category of elements, which does not overlap the other bands and
never intersects the range used by Y-ordering.

**Base**:
The point of a sprite used as the reference for ordering — the object's "feet". Sortable elements
have a `z` equal to the Y of their own base.
_Avoid_: anchor, pivot, origin

**Overhead**:
The layer drawn above all entities regardless of position (canopies, arches, roofs). A tall object is
split: the trunk is Y-sortable, the canopy is overhead.

**Footprint**:
The blocking area of an object, generally smaller than its sprite and independent of drawing order.
You visually pass under the canopy, you are blocked by the trunk's footprint.
_Avoid_: hitbox, collider, bounding box

**Recipe**:
The set of parameters declared in data from which the generator produces a map, given a seed. Two
families: free generation from noise, or composition of sectors taken from a pool.
_Avoid_: preset, generation template

**Point of interest**:
A typed position produced by the generator (entrance, exit, treasure room, water source). The
generator places it; populating it with enemies, items and quests is the orchestration's job.

### Entities

**Entity**:
What exists in the game world, identified by an opaque, stable and never reused `EntityId`. It is not
an `Actor` and has no class: it is an identity plus the components it owns.
_Avoid_: actor, game object, instance

**Component**:
A piece of domain data that an entity owns (`Health`, `Combat`, `Inventory`, `Faction`). Entities are
composed of components; there are no class hierarchies.

**Capability**:
An entity's participation in a given interaction, declared by **owning** a marker component
(`Targetable`, `Lockable`, `Sittable`). An explosive barrel is targetable because it has the
component, not because it belongs to a class. It is queried by bitmask.
_Avoid_: type, class, role, flag

**Archetype**:
An entity definition as a set of components with initial values, composable and overridable
(`guard` = `humanoid` + `fighter` + `faction: guards`). It is data, not a subclass.
_Avoid_: prefab, template, blueprint

**Actor**:
The Excalibur representation of an entity. It lives only in the presentation, created and destroyed
in reaction to spawn events, and tied to the domain solely by the `EntityId → Actor` map.

### Agents

**Agent**:
An entity whose behaviour the game decides — typically an NPC. It is not a registry capability: it is
the role it takes on when a reasoner decides for it.

**Blackboard**:
The memory on which agents reason, with three **scopes**: entity (private), group (squad, faction,
pack) and global. It is memory, not truth: it holds what the agent *believes*, which may be stale or
wrong — and that is what makes NPCs believable.
_Avoid_: board, shared memory, context

**Belief**:
A blackboard entry: a value with a timestamp and a **confidence**, which decays according to a
declared policy. It distinguishes "the player is here" from "the player was here thirty seconds ago".
_Avoid_: fact, knowledge, perception

**Consideration**:
The response curve that turns a normalized input `0..1` into a utility contribution `0..1`. It is the
AI's tuning surface, and it lives in the data. A consideration at 0 places a **veto** on the action.
_Avoid_: criterion, factor, weight

**Reasoner**:
The pure decider: given a read-only context and a personality, it returns an intent. It moves nobody
and knows nothing of the world. There can be more than one per agent.
_Avoid_: AI, brain, controller, behaviour

**Intent**:
The action chosen by a reasoner, with a target, a score and an expiry. Executing it is up to the
orchestration, which knows the services involved.
_Avoid_: command, order, task

**Personality**:
The set of curves, thresholds and weights that, with the same actions available, produces different
behaviours — a coward, a fanatic, a mercenary. It is **data** applied to the reasoner, never a
different reasoner.
_Avoid_: temperament, NPC type, behavioural archetype

**Affordance**:
The declaration by which an element of the world advertises what it offers, which **needs** it
satisfies and to what degree, under what requirements and at what cost. The provider does not know
the seeker: the connection is made by kind, never by identity.
_Avoid_: interaction, use, opportunity

**Need**:
A normalized `0..1` quantity of an agent (thirst, hunger, tiredness) that affordances reduce, on a
scale comparable with the AI's inputs.

**Perception**:
The condition for an offer or a crime to exist for someone: distance, viewing angle, occlusion,
lighting, noise, or the memory of having seen it. No NPC magically knows every water source on the
map.

**Agent profile**:
The data with which an agent reads the grid in pathfinding: an aquatic one, a flying one and a ground
one see different costs on the same cells.

### Game rules

**Attribute**:
A character's base value, which grows through **training with masters**. There are no character
levels and no experience points to spend: it is the design choice from which the whole progression
model follows.
_Avoid_: statistic, stat, level

**Skill**:
A competence distinct from the attributes (lockpicking, alchemy, persuasion, bargaining), which
improves **with use** at diminishing returns and/or with training.
_Avoid_: ability, talent, profession

**Perk**:
An advantage unlocked when thresholds on one or more attributes are crossed, or as time passes. Never
by spending points.

**Derived value**:
A value computed from a formula declared in data (maximum health, energy, carrying capacity,
defences), never stored as an independent value. The **current value** — current health — is state
instead.

**Modifier**:
A contribution to an attribute, tracked **by origin** and individually removable: equipment, buffs,
debuffs, encumbrance, wounds. Taking off the armour removes exactly its contribution.

**Status effect**:
A timed effect on an entity — poison, bleeding, stun, slow — with declared duration, periodicity,
intensity and **stacking** rules. It expires through the Time service, never with private counters.
_Avoid_: state, alteration, condition

**Container**:
The single model for a backpack, a chest, a corpse, a merchant's counter and a pile on the ground:
they differ in capacity and rules, not in type. A trade and a looting are the same transfer with
different rules.
_Avoid_: inventory (that is the service), bag, crate

**Definition / Instance**:
The definition is the catalogue item, static and shared (`ItemId`); the instance is the copy owned
(stable `InstanceId`, quantity, wear, charges). Unique items are guaranteed to be so by the
impossibility of duplicating an `InstanceId`.

**Quest item**:
An item marked by a flag: weight 0, not droppable, not sellable, not destructible while the flag is
set. The inventory service applies the flag, it does not decide when to set it.

**Quest NPC**:
An NPC marked as unkillable: damage is applied down to a minimum threshold and the outcome declares
this explicitly. The rule lives in combat, not at every point that deals damage.

**Loot table**:
A table of weighted entries, nestable, with **guaranteed** entries and a variable number of draws,
from which what drops is decided. It is validated data, never code.
_Avoid_: drop table, drops table, spoils table

**Stage**:
A quest's step, with multiple objectives and a completion rule (all, any, N out of M). The next stage
may depend on a condition: it is a **branch**, not simply the next one in the list.
_Avoid_: step, phase, leg

**World fact**:
What the orchestration delivers to the quest service, translated from the domain events. The rules
services do not subscribe to the bus: they receive facts, and stay queryable with synthetic facts.
_Avoid_: event, trigger

**Topic**:
A reusable portion of dialogue, shared among several speakers (asking for directions, asking about a
rumour), without duplicating the graphs.
_Avoid_: subject, theme

**Speaker**:
The NPC one is talking to. The visited nodes and the choices made are stored **per speaker**: it is
what makes the options vary based on previous dialogues.
_Avoid_: interlocutor, dialogue NPC

**Faction**:
Any group with a collective identity: the citizens of a city, a corporation, a thieves' guild, a
religious order, a wolf pack. The service does not distinguish them by type, and the same faction can
serve as a group for the blackboard.

**Rank**:
The membership level in a faction, with a declared threshold and benefits, which unlocks advantages
and dialogue options.
_Avoid_: grade, faction level

**Reputation**:
The player's continuous value towards a faction, to which an **individual modifier** towards a single
NPC is added: one can be someone's friend while being an enemy of their faction.

**Attitude**:
The discrete translation of reputation (hostile, wary, neutral, friendly, devoted), obtained through
thresholds with **hysteresis** — without it, an NPC would oscillate around the threshold.
_Avoid_: standing, disposition, relation

**Witness**:
Whoever perceives a crime. A crime exists only if someone sees it, and produces a bounty only if the
witness manages to **report** it: reporting takes time, a journey, and can be prevented.

**Bounty**:
The consequence of a known crime, **per faction and per jurisdiction**: being wanted in one city does
not imply being wanted everywhere. It decays by statute of limitations, and is cleared by payment, a
sentence, intercession or bribery.
_Avoid_: notoriety, wanted level

**Known / suspected crime**:
Known is the crime for which a bounty exists; suspected is the one a witness has seen but has not yet
reported. They are two states with different consequences.

**Liquidity**:
A merchant's finite money: they cannot buy beyond what they hold, and the outcome must say so
explicitly.

**Stock**:
A merchant's finite goods, which regenerate after a timeout. **Restocking** is computed lazily, on
first interaction, as a function of the elapsed time.

### Time

**Game time**:
The domain's only source of time: scalable, pausable at `scale = 0`, distinct from real time and from
**interface time**, which keeps running while the game is paused. The domain receives time, it does
not read it.
_Avoid_: delta, real time, tick

**World time**:
The conversion of game time into day, hour, minute and **phase**, according to a configurable day
length. It is what governs lighting, spawning and NPC routines.

**Timer**:
A deadline registered in the scheduler with an **opaque and serializable** `payload`: the service does
not know what it means, and pending timers resume from the exact remainder after a load.
_Avoid_: cooldown, setTimeout, deferred callback

### Interface and input

**Abstract action**:
The unit of input that the domain knows (`attack`, `interact`, `move`). No physical key appears in
the game logic: the domain does not know that a spacebar exists.
_Avoid_: key, command, binding, input

**Input context**:
The stack that suspends and restores sets of actions (exploration, dialogue, menu, inventory):
opening a dialogue suspends movement without the dialogue having to disable anything.

**Contextual interaction**:
The actions offered on the selected target — attack, talk, use, rob, pick the lock — built from the
entity's affordances and capabilities, never from a hardwired list.

**Text key**:
The reference with which the domain names a text without containing it. The domain produces keys and
parameters; resolving them in the active language is the presentation's job.
_Avoid_: string, caption, label

### Randomness

**Root seed**:
The single number from which every random value of a game derives. Two games with the same root seed
and the same sequence of inputs are indistinguishable.

**Stream**:
An independent sequence of random numbers, dedicated to a usage domain (combat, loot, generation,
AI). Consuming from one stream does not alter the others.
_Avoid_: generator, RNG, source

**Draw**:
A single value taken from a stream, and the act of taking it — *to draw*, *a draw*, *ten draws*. The
`-ing` form belongs to rendering (see **Drawing grid**), so a draw is never called "a drawing" and
the weighted primitive is *the weighted draw*, never *weighted drawing*.
_Avoid_: drawing, extraction, roll, pull

**Channel**:
The textual key with which the caller identifies a filtered sequence (`'hits:enemyA'`, `'lockpick'`).
The namespace is **global to the Random service**: the same channel used by two different streams
shares a single memory. Granularity is the caller's choice, never inferred by the service. The audio
channel (music, effects) is a different thing, and must always be qualified.
_Avoid_: category, tag, bucket

**Channel memory**:
The current weight of each outcome of a channel: whatever has just come up has its weight reduced,
and recovers it over the following draws. It belongs to the Random service, which is the only one to
own it and to serialize it.
_Avoid_: anti-repetition queue, history, buffer, cache

**Filter profile**:
The set of parameters that govern a channel memory — how much the weight of an outcome that has just
come up is reduced, and over how many draws it recovers. It lives in the data; a channel reaches it
by the prefix of its own name.

**Filtered randomness**:
A draw that consults its own channel's memory in order to make improbable the sequences that the
player would read as not random. It stands opposed to uniform randomness, which is mathematically
correct but perceived as faulty. It shifts the distribution away from the nominal weights: that is
its purpose, not a defect.
_Avoid_: weighted randomness, correct randomness

**Pity**:
A game rule that guarantees an outcome after a number of unsuccessful attempts. It is a loot domain
rule, not a randomness technique: it does not live in the Random service.
_Avoid_: pity timer, compensation, bad luck protection

**Bit-for-bit reproducibility**:
The promise that the same game and the same map from a seed stay identical **even after a browser
update**. It holds only if the PRNG, the hash function that derives the stream seeds, and the
prohibition on transcendental functions on the deterministic path all stay frozen.

**Golden vector**:
A list of expected values stored in the repo and verified on several JavaScript engines. It does not
prove that a result is right: it catches every unintended change to what has been frozen.
_Avoid_: snapshot, baseline, fixture

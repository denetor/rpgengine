# 05 — The `entities` scene: a capability changing under your eyes

**What to build:** the testbed scene that closes step 4. Open `?scene=entities` and things exist:
entities are spawned from archetypes and appear, components are added and removed while you watch,
and what each entity is *capable of* changes with them. It is ARC-6.4 made visible — *"a merchant who
can fight", "a friendly slime"* obtained by adding and removing components, with no new class branch
anywhere — and it is the step's definition of done.

The scene **observes**: it spawns and it changes components through the context's registry, and it
reacts to what the bus delivers in the presentation phase. It does not publish, and it does not
reimplement the fixed point built for step 3 — it pumps it, the way the `clock` scene already does.
`Actor`s are created and destroyed **in reaction to** `entity-spawned` and `entity-despawned`, never
on the scene's own initiative (ENT-13, REN-21): a visual element with no `EntityId` behind it is
purely decorative.

**Four things to show, because each demonstrates a decision that is otherwise invisible:**

- **spawn from an archetype** — several entities from the same archetype and from different ones, so
  that an archetype is visibly a set of components with initial values and not a class;
- **add and remove a component live** — the same entity gains and loses a capability while it is on
  screen, and the list of what it can take part in changes with it. This is the whole of ARC-6.2:
  participation follows the component, not the type;
- **the capability read-out** — for the selected entity, what it owns and what it is therefore capable
  of, so that the mask is a thing a person can see agreeing with the components;
- **despawn** — the entity goes, and its `Actor` goes with it, with nothing left behind after many
  cycles.

**The one thing the scene must not do** is invent a second way to ask. Queries by capability go
through the registry's mask, never through Excalibur's `world.query([...])` or `entity.tags`
(REN-20): an Excalibur query's iteration order follows insertion and would break determinism, and it
would not exist at all in a headless run.

The scene is registered in the **explicit registry** — a file that can be read and diffed, not a
bundler glob — and it **ships in the production build**, like every other testbed scene: a scene that
exists in only one of the two build modes is worse than a broken one.

Assertions stay at the level a person could reach by looking at the page, the way
`tests/testbed.spec.ts` already does: entered by URL, against the built page. Anything deeper is
already proved at the service's own door in tickets 02 and 03, and a browser-level seam onto it would
be testing the overlay.

The sheet is [`entity-registry.md`](../../../docs/services/entity-registry.md) (ENT-6, ENT-13) with
[`rendering.md`](../../../docs/services/rendering.md) (REN-20, REN-21); step 4 is defined in §7.2 of
[`REQUIREMENTS.md`](../../../docs/REQUIREMENTS.md).

**Blocked by:** 04 — this game's vocabulary and the registry in the `GameContext` (the scene receives
the context, and there are no kinds to add or remove without it).

**Status:** ready-for-agent

- [ ] `?scene=entities` opens the scene, and the scene appears in the explicit registry
- [ ] Spawning from an archetype makes an entity appear, and several from the same archetype are
      independent of one another
- [ ] Entities from two different archetypes are visibly different in what they own
- [ ] Adding a component to a live entity changes what it is capable of, on screen, without a reload
- [ ] Removing a component takes the capability away again
- [ ] The capability read-out for the selected entity agrees with the components it owns, before and
      after each change
- [ ] Despawning removes the entity and its `Actor`, with no leak after many spawn-despawn cycles
- [ ] Every `Actor` is created in reaction to `entity-spawned` and destroyed in reaction to
      `entity-despawned`; the scene never creates one on its own initiative
- [ ] No query by capability goes through `world.query` or `entity.tags`
- [ ] The scene pumps the orchestration's fixed point and publishes nothing
- [ ] The scene ships in the production build, like the others
- [ ] A Playwright test drives the built page by URL and asserts what a person would see
- [ ] The integration lane is green: build, boundaries and the Playwright suite, snapshots included

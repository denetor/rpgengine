# INP — Input

**Area:** Core · **Nature:** generic · **Priority:** 2 · **Status:** proposed
**Requirement prefix:** `INP-*`

## Purpose

Translate physical inputs (keyboard, mouse, gamepad, touch) into abstract game **actions**, and
deliver them to the orchestration as intents. It handles contexts (exploration, dialogue, menus),
remapping and buffering.

The domain does not know that a spacebar exists: it knows that the `attack` action has arrived.

## Contract

| Item | Value |
|---|---|
| Depends on | an **input port** implemented by the presentation (the only one that touches the DOM) |
| Does NOT depend on | `excalibur`, DOM, other services |
| Consumed by | `presentation` (collection), orchestration (consumption of the actions) |
| Dynamic state | active context, action buffer, axis state |
| Static state | default mappings, action definitions |
| External data | `bindings.json` (defaults, through `CFG`) + the player's rebinding (through `SET`) |
| Events emitted | none — it **returns** intents from `consume()`; the orchestration publishes what it decides to (BUS-3) |

## Public API (indicative)

```ts
type Action = 'move' | 'attack' | 'interact' | 'block' | 'use-item' | 'open-inventory' | …;
type InputContext = 'exploration' | 'dialog' | 'menu' | 'inventory';

interface InputService {
  /** The presentation injects the raw events; it is the only entry point. */
  feed(raw: RawInputEvent): void;

  pushContext(ctx: InputContext): void;   // dialogue suspends the movement controls
  popContext(): void;

  /** Actions that came due this frame, in order. Empties the consumed buffer. */
  consume(now: GameTimeMs): readonly ActionIntent[];

  axis(action: Action): Vector2;          // stick and WASD, normalized
  isHeld(action: Action): boolean;

  rebind(action: Action, binding: Binding): Result<void, BindingConflict>;
}
```

## Requirements

**INP-1** — No physical key **MUST** appear in the game logic: the logic only reacts to abstract
actions (GP-62).

**INP-2** — Every action **MUST** be remappable on keyboard, mouse and gamepad; conflicts **MUST**
be detected and reported, not resolved silently (GP-63).

**INP-3** — The service **MUST** manage a **context stack**: opening a dialogue or a menu suspends
the exploration actions without the dialogue code having to disable anything. Closing restores
exactly the previous context.

**INP-4** — There **MUST** be **input buffering** with a configurable window: an action issued during
an animation is queued and executed as soon as the window opens (GP-64).

**INP-5** — Buffered actions **MUST** expire after a configurable duration: an attack pressed two
seconds earlier **MUST NOT** fire.

**INP-6** — The buffer **MUST** distinguish **instantaneous** actions (attack, interact) from
**held** actions (movement, block): only the former get queued.

**INP-7** — Analogue axes and keyboard directional combinations **MUST** be normalized to the same
representation: the domain does not distinguish stick from WASD. A configurable dead zone **MUST**
be provided.

**INP-8** — The service **MUST** be **headless testable**: the input port allows a sequence of
synthetic, timestamped inputs to be injected, with no browser.

**INP-9** — A **scripted sequence of actions**, fed into two games with the same seed, **MUST**
produce the same result (ARC-9.1): it is the basis for gameplay regression tests. This is why
`consume()` is given the current time rather than reading a clock, and why the orchestration pulls
the intents at a fixed point in the tick: an intent delivered when a DOM event happens to fire would
take its position in the order from the browser's scheduler.

**INP-10** — Remapping **MUST** be persisted as a **player preference**, not in the game save
(SET-1): a binding holds for the player, not for the playthrough.

**INP-11** — The service **MUST NOT** execute actions nor know their meaning: it produces intents.
Deciding whether the attack is possible is up to the orchestration and the rules services.

**INP-12** — The service **SHOULD** expose the current bindings in readable form, so that the HUD
can show contextual hints with the right key for the device in use.

## Test criteria

- A synthetic sequence produces the expected actions, in the expected order and with the expected
  timings.
- An attack issued 80 ms before the end of an animation with a 150 ms window is executed; at 400 ms
  with a 150 ms window it expires.
- Opening and closing a dialogue restores the previous context, including held actions.
- A remapping conflict is reported with both actions involved.
- Stick and WASD produce the same normalized vector for the same direction.

## Links

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-1 (separation), ARC-9 (determinism)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-54, GP-62, GP-63, GP-64
- [`settings.md`](./settings.md) · [`config.md`](./config.md) · [`hud.md`](./hud.md)

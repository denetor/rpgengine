# CAM — Camera

**Area:** Presentation · **Nature:** generic · **Priority:** 3 · **Status:** proposed
**Requirement prefix:** `CAM-*`

## Purpose

Decide which portion of the world is framed: follow the player, stay within the area's bounds, move
onto a point of interest during a scene, shake at an explosion.

A small service, but one that weighs heavily on how the game feels — and also one of the most
annoying to fix later, because it tends to spread across scenes, actors and effects.

## Contract

| Item | Value |
|---|---|
| Depends on | `CFG`; the result is applied by Excalibur's camera |
| Does NOT depend on | the domain services |
| Consumed by | `REN` |
| Dynamic state | position, zoom, target, active effects |
| Static state | follow parameters, limits, curves |
| External data | parameters in configuration |
| Events emitted | `camera-focus-reached` |

## Public API (indicative)

```ts
interface CameraService {
  follow(target: EntityId, style: FollowStyle): void;
  focusOn(point: Vector2, durationMs: number): void;   // scenes, dialogues, reveals
  release(): void;

  setBounds(bounds: Rect | undefined): void;           // bounds of the current area
  setZoom(zoom: number, durationMs?: number): void;
  shake(intensity: number, durationMs: number): void;

  /** Computes the frame's position. Pure logic: testable without a renderer. */
  update(dt: number, targetPos: Vector2): CameraState;
}
```

## Requirements

**CAM-1** — The camera logic **MUST** be **pure and testable**: `update` is a function of state and
target, verifiable without a renderer. Only applying the result touches Excalibur.

**CAM-2** — Following **MUST** be damped and configurable, with a **dead zone** inside which the
camera does not move: following the player pixel by pixel produces a jittery image.

**CAM-3** — The camera **MUST** respect the **area's bounds**: it **MUST NOT** show empty space
beyond the edge of the map, unless the area is smaller than the screen, in which case it **MUST**
centre it.

**CAM-4** — The camera **MUST** be able to be taken off following in order to frame a point (scenes,
revealing a door that opens) and handed back afterwards, without jumps.

**CAM-5** — **Shake MUST** be parametric and use noise, not pure random oscillations, for a
continuous rather than grainy effect (RND-7).

**CAM-6** — Shake **MUST** respect the accessibility settings, down to being cancelled entirely
(GP-66).

**CAM-7** — Zoom **MUST** be animatable with a duration and a curve; the camera **MUST** stay
consistent with the bounds at variable zoom too.

**CAM-8** — The camera **MUST** be steerable towards a point and report arrival, so that a narrative
sequence can proceed.

**CAM-9** — The camera's position **MUST NOT** influence the game logic: no rule **MUST** depend on
what is framed. Whatever triggers based on proximity uses domain distances, not the screen.

**CAM-10** — The camera's state **MUST NOT** be serialized: it is rebuilt from the target and the
bounds on load (ARC-10.4).

**CAM-11** — When moving between areas the camera **MUST** relocate without interpolating through
the space in between.

## Test criteria

- Following with a dead zone does not move the camera for sub-threshold displacements.
- At the map's edges the camera stops exactly on the boundary.
- An area smaller than the screen is centred.
- Shake with the same intensity and the same seed is reproducible and is cancelled with
  accessibility enabled.
- `focusOn` followed by `release` resumes following without discontinuity.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-66
- [`rendering.md`](./rendering.md) · [`config.md`](./config.md) · [`random.md`](./random.md)

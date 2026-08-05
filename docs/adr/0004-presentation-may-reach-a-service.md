---
status: accepted
---

# The presentation reaches a service directly, without passing through `game/`

ARC-1.1 states the layers as **presentation → game → engine**, and everyone who reads that sentence
reads it as strict layering: the presentation talks to the game, the game talks to the engine, and a
scene that wants a service asks the game for it. Rule 4 of ARC-14.2 forbids the arrow pointing back
up; it says nothing about an arrow that skips a layer, and silence reads as prohibition.

We decided the other way. **A file under `presentation/` may import a service in `engine/` directly,
through its public surface.** The boundary check permits it deliberately, and the fixture that proves
it stays lawful sits beside the ones that prove the five rules bite.

## Why not strict layering

The cost is not theoretical, and it is not paid once. §7.2 of the requirements ends every step from
here on with a **testbed scene that drives the new service through the presentation**. Under strict
layering each of those scenes needs a module in `game/` that exists for no purpose but to forward
calls — code belonging to *this game*, written to satisfy a linter, in the layer that is supposed to
hold the rules of the game and nothing else. Fifteen steps, fifteen pass-through modules, each one a
small lie about what `game/` is for.

Worse, it inverts what the testbed is for. A step is done when a scene demonstrates that **the
presentation** can drive the service. A scene that can only reach the service through a bespoke
adapter demonstrates that the adapter works.

## What strict layering appeared to protect

That this game's rules do not end up written inside scenes. That is a real risk and worth guarding —
but it is not an import rule, and an import rule is a poor proxy for it. Nothing stops a scene from
holding a combat formula while dutifully calling `game/` for its dice. What actually guards it is
point 3 of the definition of done in §7.2, read by a person: the rules live in `game/`, the scene
shows them running.

## What this costs

- **The layer diagram is no longer literally true.** Someone will read "presentation → game →
  engine", find a scene importing `engine/core/random`, and take it for an oversight. That is the
  reason this file exists, and the reason ARC-14.2 carries a note pointing at it.
- **It is hard to reverse.** Once fifteen scenes rely on the permission, closing it means writing the
  fifteen pass-through modules that were avoided. The decision is cheap today and expensive on day
  100 — which is why it is taken explicitly rather than discovered.
- **The permission is narrow, and stays narrow.** It reaches a service's **public surface** only.
  Rule 2 still refuses a scene the service's internals, and ARC-2.1 is untouched: what a scene may
  see is exactly what every other caller may see.

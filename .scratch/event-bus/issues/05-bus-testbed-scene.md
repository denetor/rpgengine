# 05 — The `bus` testbed scene

**What to build:** step 2's definition of done — a testbed scene, reachable at `?scene=bus`, in which
a person can see the bus behave. Until this exists the service is verified but not *integrated*: the
scene is what proves the presentation can drive it without violating ARC-1.

The scene publishes a cascade on demand — a button, a key, whatever the sandbox already does — and
**traces it on screen** through an `onAny` registered in the **presentation** phase. That placement
is the demonstration, not an implementation detail: the trace appears once the world is quiescent,
showing the whole tick's chain in causal order, each event once. A trace registered in the
orchestration phase would show the same events interleaved with the rules still running, and the
difference between the two is the thing worth looking at.

The scene also carries `CFG`'s half of the step, per the reworded step-2 row: an `RND` built from
**composed parameters** stands beside the trace, so the two services that make up step 2 are both
visible in one place.

The events the scene publishes are invented for the scene. Step 2 has no domain facts yet — the
game's event union grows one type per service from step 3 onward — so the scene declares its own
small union, in the prefixed form BUS-14 fixes (`demo/…`), which is also the first place that
convention is seen in code.

The scene registers in the explicit registry from step 1 (a file that can be read and diffed, not a
bundler glob), and ships in the production build like every other testbed scene.

**What the scene invents, and why a pond:** a pebble goes in, rings spread out, the last one reaches
the shore. A cascade is what the bus is *for*, and a pond is a cascade everybody already has a
picture of, so the trace reads as a chain of consequences rather than as five strings. The cycle is a
second invention beside it — two banks echoing each other, both halves reasonable on their own, which
is exactly how a real cycle gets written. Every type carries the `demo/` producer prefix, which is
the first appearance of BUS-14 in code.

**The trace is drawn in the DOM, not on the canvas**, for the reason `scene-error.ts` already is: it
is text somebody reads and copies, and drawing it into a canvas buys nothing but a font to argue
with. The scene's canvas stays empty, which is honest — this testbed has nothing to render.

**The scene owns its bus and its `RND`, and takes the context as a parameter anyway.** They cannot
come from the `GameContext`: it is empty until step 3 fills it with CTX-1's fields and with the game
loop that will own the `flush()` call site. Taking the context regardless — as every scene does — is
what lets step 3 change where this scene gets a bus without changing its shape. Nothing is reached
for: the directory holds no module-level state.

**The orchestration rules live under `presentation/`,** which is not where the game's rules will
live — step 3 puts them in `game/`, in the explicit wiring list BUS-7 asks for. Here it is the point:
with both phases in one file a reader can see the trace appear *after* every rule has run instead of
interleaved with them, and that difference is the whole demonstration.

**What the integration test asserts, and what it deliberately does not.** The spec's testing section
calls this scene *not a seam* — everything it displays is proved at the bus's own surface, and
asserting the delivery order again through a browser would be testing the overlay. So the tests check
that the scene is wired to a real bus and shows what came back (the fact published and the fact at
the far end of its cascade), that the composed profile resolved, and that a cycle produces the
diagnostic. That last one is the test that would **hang** rather than fail if the rail were not
there, which is why it is worth having at this level at all.

**Blocked by:** 01 — the delivery contract; 03 — misbehaving handlers and teardown. Ticket 02 is not
a gate, but if it is done the scene should offer a way to trigger a cycle and show the diagnostic,
since a rail nobody has watched trip is a rail nobody trusts.

**Status:** done

- [x] `?scene=bus` opens the scene; the name appears in the explicit scene registry
- [x] The scene publishes a cascade on demand and shows the resulting events on screen
- [x] The trace comes from an `onAny` registered in the **presentation** phase, and the scene says so
      on screen or in a comment a reader will find
- [x] Each event appears once, in causal order, after the rules have finished
- [x] An `RND` built from composed parameters is visible in the same scene
- [x] The scene declares its own event union, prefixed per BUS-14, with no type from the game's
      domain
- [x] The scene receives what it needs as a parameter and reaches for no global state
- [x] The scene ships in the production build
- [x] If ticket 02 is done: a control triggers a cycle and the diagnostic is shown rather than the
      tab freezing
- [x] The integration lane is green, snapshots included

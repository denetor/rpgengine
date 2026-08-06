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

**Blocked by:** 01 — the delivery contract; 03 — misbehaving handlers and teardown. Ticket 02 is not
a gate, but if it is done the scene should offer a way to trigger a cycle and show the diagnostic,
since a rail nobody has watched trip is a rail nobody trusts.

**Status:** ready-for-agent

- [ ] `?scene=bus` opens the scene; the name appears in the explicit scene registry
- [ ] The scene publishes a cascade on demand and shows the resulting events on screen
- [ ] The trace comes from an `onAny` registered in the **presentation** phase, and the scene says so
      on screen or in a comment a reader will find
- [ ] Each event appears once, in causal order, after the rules have finished
- [ ] An `RND` built from composed parameters is visible in the same scene
- [ ] The scene declares its own event union, prefixed per BUS-14, with no type from the game's
      domain
- [ ] The scene receives what it needs as a parameter and reaches for no global state
- [ ] The scene ships in the production build
- [ ] If ticket 02 is done: a control triggers a cycle and the diagnostic is shown rather than the
      tab freezing
- [ ] The integration lane is green, snapshots included

# 05 — The `clock` scene: the presentation drives the domain

**What to build:** the testbed scene that closes step 3. Open `?scene=clock` and the world runs: game
time advances, the world clock says which day, hour and phase it is, and timers come due where a
person can watch them. It is the first scene that drives the domain rather than being it, and it is
the step's definition of done.

The scene **pumps the fixed point** built in ticket 04 — one call per Excalibur update — and reads
`now()` and `worldTime()` while drawing. It does not call `advance()` and it does not publish: it
observes what the bus delivers in the presentation phase, which is exactly the discipline every later
scene will follow.

**The driver is configured here, and the two settings are load-bearing:**

- **an integer `fixedUpdateTimestep`**, so the domain only ever receives a whole number of
  milliseconds and the leftover fraction is carried by Excalibur's own accumulator, on the real-time
  side where real time is;
- **`timescale` left at 1**, because Excalibur scales `elapsed` before handing it to the update and a
  second scaling in the domain would apply it twice.

Excalibur's existing clamp on an anomalous delta is the project's cap, and it works by being left
alone: nothing in the domain caps anything.

**Three controls, because each demonstrates a decision that is otherwise invisible:**

- **pause** — the world clock freezes while the page stays alive and responsive, which is the whole
  argument for pause being *not advancing* rather than a state of the clock;
- **advance by a large amount** — a single jump of several game hours, showing a batch arriving at
  once: the repeating timer coming due many times, the hour and phase transitions in the same ordered
  sequence. This is the combat turn, rehearsed before combat exists;
- **schedule a timer** — one-shot and repeating, so that coming due, repeating and cancelling are
  visible rather than asserted.

The scene is registered in the **explicit registry** — a file that can be read and diffed, not a
bundler glob — and it **ships in the production build**, like every other testbed scene: a scene that
exists in only one of the two build modes is worse than a broken one.

Assertions stay at the level a person could reach by looking at the page, the way
`tests/testbed.spec.ts` already does: entered by URL, against the built page. Anything deeper is
already proved at the service's own door, and a browser-level seam onto it would be testing the
overlay.

**Blocked by:** 02 — the calendar (there is no world clock to display without it); 04 — the fixed
point (the scene pumps it, and must not reimplement it).

**Status:** ready-for-agent

- [ ] `?scene=clock` opens the scene, and the scene appears in the explicit registry
- [ ] The page shows game time and world time, and both advance while the page is open
- [ ] A one-shot timer scheduled from the scene comes due visibly, once
- [ ] A repeating timer comes due repeatedly, and cancelling it stops it
- [ ] The pause control freezes game time and the world clock; the page stays responsive and the
      interface keeps animating
- [ ] Resuming continues from where it stopped: no time is lost and none is invented
- [ ] The large-jump control produces a batch — many repetitions and the hour/phase transitions
      arriving together, in one ordered sequence
- [ ] The scene pumps the orchestration's fixed point; it never calls `advance()` and never publishes
- [ ] The driver is configured with an integer fixed step, and `timescale` is left at 1
- [ ] The scene ships in the production build, like the others
- [ ] A Playwright test drives the built page by URL and asserts what a person would see
- [ ] The integration lane is green: build, boundaries and the Playwright suite, snapshots included

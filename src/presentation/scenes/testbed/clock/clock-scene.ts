import { Scene } from "excalibur";
import { GAME_CALENDAR } from "../../../../game/calendar";
import { createFixedPoint } from "../../../../game/orchestration/fixed-point";
import { openClockPanel } from "./clock-panel";
import type { Engine } from "excalibur";
import type { GameContext } from "../../../../game/bootstrap";
import type { GameEvent } from "../../../../game/events";

/**
 * A minute of **world** time, in game milliseconds.
 *
 * Derived from the calendar rather than written down, because the two are not
 * the same number and nothing on screen would say which one a constant meant:
 * on this game's calendar a world minute is a second of real time, and on a
 * calendar with a longer day it is more. Every duration below is a duration a
 * person reads off the world clock, so every one of them is counted in these.
 */
const A_WORLD_MINUTE_MS = Math.round(GAME_CALENDAR.dayLengthMs / (24 * 60));

/** How far the jump control moves the world: six hours of it. */
const JUMP_MS = 6 * 60 * A_WORLD_MINUTE_MS;

/** The one-shot's delay: five minutes on the world clock. */
const ONCE_AFTER_MS = 5 * A_WORLD_MINUTE_MS;

/** The repeater's period: a minute on the world clock. */
const EVERY_MS = A_WORLD_MINUTE_MS;

/** The names the two bells ring under, which is how the trace tells them apart. */
const ONE_SHOT = "once";
const REPEATER = "every minute";

/** The pause control, under both of the names it answers to. */
const PAUSE = "Pause the world";
const RESUME = "Resume the world";

/** The repeater's control, likewise. */
const START_RINGING = "Ring the bell every minute";
const STOP_RINGING = "Stop the bell";

/** One event as a line of the trace: the fact, and what it was about. */
function describeEvent(event: GameEvent): string {
  switch (event.type) {
    case "time/hour-changed":
      return `${event.type} — day ${event.day}, ${String(event.hour).padStart(2, "0")}:00`;
    case "time/day-changed":
      return `${event.type} — day ${event.day}`;
    case "time/day-phase-changed":
      return `${event.type} — ${event.phase}, day ${event.day}`;
    case "testbed/bell-rung":
      return `${event.type} — ${event.bell}`;
  }
}

/**
 * Game time as it is: milliseconds since the game began, unrounded.
 *
 * Unrounded on purpose — this is the reading that has to show that a pause
 * costs *nothing*, and a number rounded to the second would hide a beat's worth
 * of drift for a whole second at a time.
 */
function describeGameTime(nowMs: number): string {
  return `${nowMs} ms`;
}

/** World time as a clock face, with the phase beside it. */
function describeWorldTime(world: {
  day: number;
  hour: number;
  minute: number;
  phase: string;
}): string {
  const hour = String(world.hour).padStart(2, "0");
  const minute = String(world.minute).padStart(2, "0");

  return `day ${world.day}, ${hour}:${minute} — ${world.phase}`;
}

/**
 * Builds the testbed over a game that already exists, and returns the two
 * functions the scene's lifetime is made of: one beat, and the teardown.
 *
 * A plain function rather than the scene's own body, because none of it needs a
 * renderer: it is a context, a fixed point and some DOM. The scene below is the
 * adapter that gives it a lifetime and a heartbeat.
 */
function openClockTestbed(context: GameContext): {
  beat: (realDeltaMs: number) => void;
  release: () => void;
} {
  const panel = openClockPanel();

  // The fixed point of ticket 04, not a loop of this scene's own. The scene
  // never calls `advance()` and never publishes: it pumps the beat and reads
  // what the bus delivers, which is the discipline every later scene follows.
  const fixedPoint = createFixedPoint(context);

  /** What the current beat has delivered, in the order the clock returned it. */
  let arriving: string[] = [];

  /** How many of each fact have arrived since the scene opened. */
  const rung = new Map<string, number>([
    [ONE_SHOT, 0],
    [REPEATER, 0],
  ]);

  /** The repeater's handle, while it is running — what `cancel` needs (TIME-9). */
  let repeaterId: ReturnType<typeof context.clock.scheduleRepeating> | undefined;

  // **Presentation**, deliberately: every line below is written once the world
  // has stopped moving, in one go, in the order the facts happened. The same
  // subscription in the orchestration phase would print a batch interleaved
  // with the rules still producing it.
  const unsubscribe = context.bus.onAny("presentation", (event) => {
    arriving.push(describeEvent(event));

    if (event.type === "testbed/bell-rung") {
      rung.set(event.bell, (rung.get(event.bell) ?? 0) + 1);
    }
  });

  function describeTally(): string {
    return [...rung].map(([bell, count]) => `${bell} ×${count}`).join(", ");
  }

  /** One beat, and then everything a person reads off the page. */
  function beat(realDeltaMs: number): void {
    arriving = [];

    fixedPoint.tick(realDeltaMs);

    if (arriving.length > 0) {
      // Only when something arrived, so that the last batch stays on screen to
      // be read instead of being cleared by the next sixty empty beats.
      panel.batch(arriving);
      panel.tally(describeTally());
    }

    // Read while drawing, which is what the presentation is allowed to do: a
    // clock widget updates every frame off a read, and there is deliberately no
    // `minute-changed` event to save it the trouble (TIME-11).
    panel.readings(describeGameTime(context.clock.now()), describeWorldTime(context.clock.worldTime()));
    panel.running(fixedPoint.isPaused());
  }

  const pausing = panel.control(PAUSE, () => {
    if (fixedPoint.isPaused()) {
      fixedPoint.resume();
      pausing.rename(PAUSE);
      return;
    }

    fixedPoint.pause();
    pausing.rename(RESUME);
  });

  panel.control("Jump six hours", () => {
    // One beat worth six hours, which is the only thing a combat turn will ever
    // be: the driver's delta is the caller's business, and the clock cannot
    // tell this from a frame (TIME-3).
    beat(JUMP_MS);
  });

  panel.control("Ring the bell once", () => {
    context.clock.schedule(ONCE_AFTER_MS, { type: "testbed/bell-rung", bell: ONE_SHOT });
  });

  const ringing = panel.control(START_RINGING, () => {
    if (repeaterId !== undefined) {
      // Cancelling is what `cancel` is really for: a one-shot nobody cancels
      // fires once and finds nothing to do, while a repeater nobody cancels
      // stays in the queue for the rest of the game (TIME-9).
      context.clock.cancel(repeaterId);
      repeaterId = undefined;
      ringing.rename(START_RINGING);
      return;
    }

    repeaterId = context.clock.scheduleRepeating(EVERY_MS, {
      type: "testbed/bell-rung",
      bell: REPEATER,
    });
    ringing.rename(STOP_RINGING);
  });

  panel.tally(describeTally());

  return {
    beat,

    release(): void {
      // The scene's own subscription goes; the context outlives the scene and
      // is disposed by whoever built it (CTX-6). A scene that disposed the
      // game's bus on its way out would take the game with it.
      unsubscribe();
      panel.close();
    },
  };
}

/**
 * `?scene=clock` — step 3, made visible: the first scene that **drives** the
 * domain instead of being it.
 *
 * Everything the clock does is proved at its own surface, and nothing here is a
 * second test of any of it. What this scene is for is the one thing a spec
 * cannot show: that the presentation can drive the world without reaching
 * through it, and that pausing is *not advancing* rather than a state of the
 * clock — a page that keeps animating over a world that has stopped.
 *
 * **What this scene owns, and what it does not.** It owns an overlay and a fixed
 * point. It does not own a bus, a clock or a game: those come from the
 * `GameContext` it is handed, which is the difference between this scene and
 * the `bus` scene next door — that one built its own services because step 2's
 * context was empty, and this one uses the context step 3 filled.
 */
export class ClockScene extends Scene {
  /** What there is to take down before the scene has built anything. */
  private static readonly NOTHING_TO_RELEASE = (): void => {};

  /** What to pump before the scene has built anything: nothing. */
  private static readonly NO_BEAT = (): void => {};

  private release: () => void = ClockScene.NOTHING_TO_RELEASE;

  private beat: (realDeltaMs: number) => void = ClockScene.NO_BEAT;

  constructor(readonly context: GameContext) {
    super();
  }

  /**
   * Built on **activation** and taken down on deactivation, so that the hook
   * that builds the overlay is the pair of the hook that removes it — the
   * reasoning is written out once in `bus-scene.ts`.
   */
  override onActivate(): void {
    this.release();

    const testbed = openClockTestbed(this.context);
    this.beat = testbed.beat;
    this.release = testbed.release;
  }

  override onDeactivate(): void {
    this.release();
    this.release = ClockScene.NOTHING_TO_RELEASE;
    this.beat = ClockScene.NO_BEAT;
  }

  /**
   * One beat per update, with the delta the driver hands over.
   *
   * `elapsed` is a **whole** number of milliseconds because the engine is
   * configured with an integer `fixedUpdateTimestep`: Excalibur's own
   * accumulator carries the fraction, on the real-time side where real time is,
   * and calls this a whole number of times (TIME-3). The clock refuses a
   * fractional delta, so a driver that stopped doing that would fail loudly
   * here rather than drift quietly.
   *
   * `onPreUpdate` rather than `onPostUpdate`: the world moves, and then what is
   * on the page is drawn from a world that has finished moving.
   */
  override onPreUpdate(_engine: Engine, elapsed: number): void {
    this.beat(elapsed);
  }
}

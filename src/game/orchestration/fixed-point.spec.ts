import { describe, expect, it } from "vitest";
import { bootstrap } from "../bootstrap";
import { createFixedPoint } from "./fixed-point";
import type { GameContext } from "../bootstrap";
import type { GameEvent } from "../events";

/**
 * The beat: the one place the clock and the bus meet.
 *
 * Every test here drives the **real** bus and the **real** clock through the
 * public function, because what is being asserted is the composition of the two
 * and a fake of either would be asserting the fake. This is the seam every later
 * step pumps, so it is opened once and reused rather than re-derived per
 * service.
 *
 * The whole ticket is one sentence: **the conditional is on the advance, never
 * on the beat.** A paused game that skipped the fixed point would leave intents
 * undrained and the bus unflushed — you equip an item from a paused inventory
 * and the panel updates when you resume.
 *
 * The events below are the clock's own, because at this step they are the only
 * events this game has: `GameEvent` is what `TIME` produces and nothing else
 * until a second service arrives with types to contribute. That makes the tests
 * better rather than worse — what reaches the bus is what the world really did,
 * not a payload a test invented and handed to itself.
 */

/** The default calendar's hour, in game milliseconds: a day of 24 real hours. */
const HOUR = 60 * 60 * 1000;

/** One game, ready to be pumped. */
function aGame() {
  const context = bootstrap();

  return { context, fixedPoint: createFixedPoint(context) };
}

/** Records the type of every event a phase sees, in the order it saw them. */
function record(context: GameContext, phase: "orchestration" | "presentation"): string[] {
  const seen: string[] = [];
  context.bus.onAny(phase, (event) => seen.push(event.type));

  return seen;
}

describe("one beat", () => {
  it("publishes everything the advance returned, in order, and flushes it", () => {
    const { context, fixedPoint } = aGame();
    const hours: number[] = [];

    context.bus.on("orchestration", "time/hour-changed", (event) => hours.push(event.hour));

    fixedPoint.tick(3 * HOUR);

    // Published *and* delivered inside the same beat, in the order the world
    // produced them: a caller pumping the fixed point never flushes anything
    // itself. The payload is read with no cast, which is the whole of the claim
    // that the three `time/*` types are part of this game's union.
    expect(hours).toEqual([1, 2, 3]);
  });

  it("hands the interface the whole beat once, after the rules have finished", () => {
    const { context, fixedPoint } = aGame();
    const order: string[] = [];

    context.bus.on("orchestration", "time/hour-changed", (event) => order.push(`rule: ${event.hour}`));
    context.bus.on("presentation", "time/hour-changed", (event) => order.push(`panel: ${event.hour}`));

    fixedPoint.tick(2 * HOUR);

    // Both rules run, and only then does the interface see the tick — once per
    // event, with the world finished moving (BUS-6).
    expect(order).toEqual(["rule: 1", "rule: 2", "panel: 1", "panel: 2"]);
  });

  it("delivers a timer and a world-time event in the order the clock returned them", () => {
    const { context, fixedPoint } = aGame();
    const seen = record(context, "orchestration");

    // A timer whose deadline is the hour: the clock returns the boundary first
    // and the timer second (TIME-10), and the beat publishes them in that order
    // rather than in some order of its own.
    context.clock.schedule(HOUR, { type: "time/day-phase-changed", day: 0, phase: "noon" });

    fixedPoint.tick(HOUR);

    expect(seen).toEqual(["time/hour-changed", "time/day-phase-changed"]);
  });

  it("is a no-op when the world is paused and nothing is queued", () => {
    const { context, fixedPoint } = aGame();
    const seen = record(context, "orchestration");
    fixedPoint.pause();

    fixedPoint.tick(16);

    expect(seen).toEqual([]);
    expect(context.clock.now()).toBe(0);
  });
});

describe("a paused world", () => {
  it("does not move, and nothing comes due", () => {
    const { context, fixedPoint } = aGame();
    const seen = record(context, "orchestration");

    fixedPoint.pause();
    fixedPoint.tick(2 * HOUR);

    // Not a scale of zero and not a clock that refuses: the clock was simply
    // not advanced, and it has no idea any of this happened.
    expect(context.clock.now()).toBe(0);
    expect(seen).toEqual([]);
  });

  it("still delivers what somebody publishes: the beat goes on", () => {
    const { context, fixedPoint } = aGame();
    const seen = record(context, "presentation");

    fixedPoint.pause();
    context.bus.publish({ type: "time/day-changed", day: 7 });
    fixedPoint.tick(2 * HOUR);

    // The item equipped from a paused inventory reaches the panel in the same
    // beat. This is why the conditional is on the advance and not on the tick,
    // and it is the one behaviour no diagram can state.
    expect(seen).toEqual(["time/day-changed"]);
  });

  it("loses no time and creates none when it resumes", () => {
    const { context, fixedPoint } = aGame();
    const seen = record(context, "orchestration");

    fixedPoint.pause();
    fixedPoint.tick(5 * HOUR);
    expect(seen).toEqual([]);
    expect(context.clock.now()).toBe(0);

    fixedPoint.resume();
    fixedPoint.tick(HOUR - 1);
    expect(seen).toEqual([]);

    fixedPoint.tick(1);

    // The hour arrived after exactly an hour of *game* time, whatever the five
    // hours spent in the menu: the pause did not consume it and did not make it
    // arrive early.
    expect(seen).toEqual(["time/hour-changed"]);
    expect(context.clock.now()).toBe(HOUR);
  });

  it("unfolds like a game nobody paused", () => {
    const paused = aGame();
    const uninterrupted = aGame();
    const fromPaused = record(paused.context, "orchestration");
    const fromUninterrupted = record(uninterrupted.context, "orchestration");

    paused.fixedPoint.pause();
    paused.fixedPoint.tick(9 * HOUR);
    paused.fixedPoint.resume();
    paused.fixedPoint.tick(2 * HOUR);

    uninterrupted.fixedPoint.tick(2 * HOUR);

    expect(fromPaused).toEqual(fromUninterrupted);
    expect(paused.context.clock.now()).toBe(uninterrupted.context.clock.now());
  });

  it("says whether it is paused", () => {
    const { fixedPoint } = aGame();

    expect(fixedPoint.isPaused()).toBe(false);

    fixedPoint.pause();
    expect(fixedPoint.isPaused()).toBe(true);

    fixedPoint.resume();
    expect(fixedPoint.isPaused()).toBe(false);
  });

  it("is not confused by being paused twice, or resumed without being paused", () => {
    const { context, fixedPoint } = aGame();

    fixedPoint.resume();
    fixedPoint.pause();
    fixedPoint.pause();
    fixedPoint.resume();
    fixedPoint.tick(16);

    // A boolean and not a count of reasons: `HUD` and `DLG` do not exist yet,
    // and when they do the shape grows here without the clock learning of it.
    expect(context.clock.now()).toBe(16);
  });
});

describe("the clock", () => {
  it("is advanced by the fixed point and by nobody else", () => {
    const { context, fixedPoint } = aGame();

    fixedPoint.tick(16);
    fixedPoint.tick(16);

    // The presentation may read `now()` and `worldTime()`; it may not move
    // them, because only the orchestration publishes and nothing may enter the
    // bus at an instant the browser chose. Nothing enforces that at the type
    // level — the clock is on the context — so it is written where whoever adds
    // the next caller will read it.
    expect(context.clock.now()).toBe(32);
    expect(context.clock.worldTime()).toEqual({ day: 0, hour: 0, minute: 0, phase: "day" });
  });
});

describe("the compile-time claims", () => {
  it("are checked by the compiler rather than by this run", () => {
    expect(compileTimeClaims).toBeTypeOf("function");
  });
});

/**
 * Referenced and never called: `tsc` has read this body before any test runs,
 * and fails the build on a directive that suppressed nothing.
 */
function compileTimeClaims(context: GameContext): void {
  // No directive on these, and that is the assertion: the three `time/*` types
  // are in the game's union, so this subscription narrows and this event
  // publishes.
  context.bus.on("orchestration", "time/day-changed", (event) => String(event.day));
  context.bus.publish({ type: "time/day-phase-changed", day: 1, phase: "dusk" });

  const event: GameEvent = { type: "time/hour-changed", day: 0, hour: 3 };
  context.bus.publish(event);

  // @ts-expect-error — a type no member of the union carries is not a thing to subscribe to.
  context.bus.on("orchestration", "time/second-changed", () => {});

  // @ts-expect-error — nor is a type nobody has contributed to the union something to publish.
  context.bus.publish({ type: "demo/knocked", times: 1 });

  // @ts-expect-error — and a timer carries a member of the union, checked at the call site.
  context.clock.schedule(100, { type: "demo/knocked", times: 1 });
}

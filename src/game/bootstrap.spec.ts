import { describe, expect, it } from "vitest";
import { bootstrap } from "./bootstrap";
import { createFixedPoint } from "./orchestration/fixed-point";
import type { GameEvent } from "./events";

/**
 * The single construction point (CTX-1), and the property it exists for: two
 * independent games in one process (CTX-4, ARC-8.3).
 *
 * That property is why `bootstrap()` **returns** a context instead of starting
 * something global, and it is checked here rather than trusted because there is
 * exactly one moment when checking it is cheap — now, while the graph is two
 * services wide.
 *
 * The whole file is headless (CTX-7): no canvas, no renderer, no assets. It runs
 * in plain Node, which is the mode the system tests will use.
 */

/** The default calendar's hour, in game milliseconds. */
const HOUR = 60 * 60 * 1000;

/**
 * A fact for a test to publish by hand.
 *
 * The clock's own, because at this step they are the only events this game has
 * — `GameEvent` is what `TIME` produces until a second service contributes
 * types of its own.
 */
function aDayPassed(day: number): GameEvent {
  return { type: "time/day-changed", day };
}

describe("the context", () => {
  it("holds the bus and the clock, built in one place", () => {
    const context = bootstrap();

    expect(Object.keys(context).sort()).toEqual(["bus", "clock", "dispose", "isDisposed"]);
  });

  it("builds a game that is already usable", () => {
    const context = bootstrap();

    expect(context.clock.now()).toBe(0);
    expect(context.clock.worldTime()).toEqual({ day: 0, hour: 0, minute: 0, phase: "day" });
  });
});

describe("two games in one process", () => {
  it("are built from nothing they share", () => {
    const one = bootstrap();
    const other = bootstrap();

    // Different objects, because there is no module-level instance for the
    // second `bootstrap()` to find and hand back.
    expect(one.bus).not.toBe(other.bus);
    expect(one.clock).not.toBe(other.clock);
  });

  it("do not observe each other's time", () => {
    const one = bootstrap();
    const other = bootstrap();
    const seen: string[] = [];

    other.bus.onAny("orchestration", (event) => seen.push(event.type));

    createFixedPoint(one).tick(HOUR);

    // The first game's beat moved the first game's clock, published into the
    // first game's bus and delivered to the first game's handlers. The second
    // game did not happen.
    expect(other.clock.now()).toBe(0);
    expect(seen).toEqual([]);
  });

  it("do not observe each other's events", () => {
    const one = bootstrap();
    const other = bootstrap();
    const seen: string[] = [];

    other.bus.onAny("orchestration", (event) => seen.push(event.type));

    one.bus.publish(aDayPassed(1));
    one.bus.flush();

    expect(seen).toEqual([]);
  });

  it("are disposed one at a time", () => {
    const one = bootstrap();
    const other = bootstrap();
    const seen: string[] = [];

    other.bus.onAny("orchestration", (event) => seen.push(event.type));

    one.dispose();
    other.bus.publish(aDayPassed(1));
    other.bus.flush();

    expect(seen).toEqual(["time/day-changed"]);
  });
});

describe("a disposed context", () => {
  it("has nothing registered on its bus", () => {
    const context = bootstrap();
    const seen: string[] = [];
    context.bus.onAny("orchestration", (event) => seen.push(event.type));

    context.dispose();
    context.bus.publish(aDayPassed(1));
    context.bus.flush();

    expect(seen).toEqual([]);
  });

  it("is inert when it is pumped", () => {
    const context = bootstrap();
    const fixedPoint = createFixedPoint(context);
    const seen: string[] = [];
    context.bus.onAny("orchestration", (event) => seen.push(event.type));

    context.dispose();

    // Not merely unheard: the world does not move either. A clock still
    // counting behind a context nobody can subscribe to would satisfy every
    // assertion about the bus and surprise the first person to read `now()` on
    // a game they had closed.
    expect(() => fixedPoint.tick(HOUR)).not.toThrow();
    expect(seen).toEqual([]);
    expect(context.clock.now()).toBe(0);
  });

  it("says that it has been disposed", () => {
    const context = bootstrap();

    expect(context.isDisposed()).toBe(false);

    context.dispose();

    expect(context.isDisposed()).toBe(true);
  });

  it("can be disposed twice", () => {
    const context = bootstrap();

    context.dispose();

    expect(() => context.dispose()).not.toThrow();
  });
});

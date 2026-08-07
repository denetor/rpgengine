import type { EventBus } from "../../../../engine/core/event-bus/index";
import type { RandomStream } from "../../../../engine/core/random/index";

/**
 * The facts this scene has to publish, and the rules that react to them.
 *
 * Step 2 has no domain facts: the game's event union grows one type per service
 * from step 3 onward, so a testbed for the bus has to invent something to send
 * through it. What it invents is a pond — a pebble goes in, rings spread out,
 * one of them reaches the shore — because a cascade is exactly what the bus is
 * for, and a pond is a cascade everybody already has a picture of.
 *
 * Every type carries a producer prefix, which is BUS-14 and the first place in
 * this project it is seen in code. `demo/` is the producer here: these facts
 * come from nowhere but this scene, and the prefix is what stops two services
 * from ever claiming one string with payloads the compiler cannot tell apart.
 *
 * The rules below are **orchestration** handlers, written in a file under
 * `presentation/`. That is not where the game's rules will live — step 3 puts
 * them in `game/`, in the explicit wiring list BUS-7 asks for — and it is
 * exactly what makes the scene worth looking at: with both phases in one place a
 * reader can see the trace appear *after* all of this has finished, rather than
 * interleaved with it.
 */

/** A pebble goes in. Its weight is how far the rings will get. */
export type PebbleDropped = {
  readonly type: "demo/pebble-dropped";
  readonly weight: number;
};

/** One ring, on its way out. `sound` is drawn from `RND`. */
export type RippleSpread = {
  readonly type: "demo/ripple-spread";
  readonly ring: number;
  readonly rings: number;
  readonly sound: string;
};

/** The last ring arrives, and the pond is quiet again. */
export type ShoreReached = {
  readonly type: "demo/shore-reached";
  readonly rings: number;
};

/** One half of a cycle: the far bank hears something. */
export type EchoHeard = { readonly type: "demo/echo-heard"; readonly bank: string };

/** The other half, which makes the far bank hear something. */
export type EchoReturned = { readonly type: "demo/echo-returned"; readonly bank: string };

/** The union this scene hands the bus as its type parameter (BUS-14). */
export type DemoEvent = PebbleDropped | RippleSpread | ShoreReached | EchoHeard | EchoReturned;

/** How a ring sounds, on the channel the composed parameters govern. */
const SOUNDS = [
  { value: "plink", weight: 4 },
  { value: "plop", weight: 3 },
  { value: "gloop", weight: 2 },
  { value: "sploosh", weight: 1 },
];

/**
 * The channel those draws are filed under.
 *
 * It is matched by the `demo:*` rule of the parameters the scene composes, so
 * the channel report the panel prints is the evidence that the value a
 * designer wrote arrived where it was aimed (CTX-10).
 */
export const RIPPLE_CHANNEL = "demo:ripple";

/** The heaviest pebble on the bank, exclusive — so the deepest cascade is four rings. */
const HEAVIEST = 5;

/**
 * The rules of the pond: one pebble becomes a ring, and each ring becomes the
 * next one until the last reaches the shore.
 *
 * A handler publishes and returns; it never delivers anything itself. That is
 * the whole of BUS-4 and BUS-5, and it is why the depth of the cascade below is
 * a property of the pond rather than of anybody's call stack.
 */
export function wirePond(bus: EventBus<DemoEvent>, pond: RandomStream): void {
  bus.on("orchestration", "demo/pebble-dropped", (event) => {
    bus.publish({
      type: "demo/ripple-spread",
      ring: 1,
      rings: event.weight,
      sound: pond.filtered(RIPPLE_CHANNEL, SOUNDS),
    });
  });

  bus.on("orchestration", "demo/ripple-spread", (event) => {
    if (event.ring < event.rings) {
      bus.publish({
        type: "demo/ripple-spread",
        ring: event.ring + 1,
        rings: event.rings,
        sound: pond.filtered(RIPPLE_CHANNEL, SOUNDS),
      });
      return;
    }

    bus.publish({ type: "demo/shore-reached", rings: event.rings });
  });
}

/**
 * The rules of the echo: each bank answers the other, for ever.
 *
 * Both halves are reasonable on their own, which is the entire difficulty — two
 * rules that publish each other compile perfectly and drain until the tab stops
 * answering. Wired here on purpose so that somebody can watch the rail trip
 * (BUS-8): a rail nobody has seen trip is a rail nobody trusts.
 */
export function wireEcho(bus: EventBus<DemoEvent>): void {
  bus.on("orchestration", "demo/echo-heard", (event) => {
    bus.publish({ type: "demo/echo-returned", bank: event.bank });
  });

  bus.on("orchestration", "demo/echo-returned", (event) => {
    bus.publish({ type: "demo/echo-heard", bank: event.bank });
  });
}

/** A pebble off the bank, weighted by nothing but the stream it came from. */
export function pebbleFrom(pond: RandomStream): PebbleDropped {
  return { type: "demo/pebble-dropped", weight: pond.int(1, HEAVIEST) };
}

/**
 * One line of the trace: the event's type, then whatever else it carries.
 *
 * Written generically, off `Object.entries`, and not as a phrase per type. A
 * trace exists precisely so that a tick can be read **without naming the types
 * in advance**; one that had a case per type would stop showing a type the day
 * somebody forgot to add its case, which is the day the trace was needed.
 */
export function describeEvent(event: DemoEvent): string {
  const carried = Object.entries(event)
    .filter(([field]) => field !== "type")
    .map(([field, value]) => `${field} ${String(value)}`)
    .join(", ");

  return carried.length > 0 ? `${event.type} — ${carried}` : event.type;
}

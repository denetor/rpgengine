import { Scene } from "excalibur";
import type { GameContext } from "../../../../game/bootstrap";
import { composeConfig } from "../../../../engine/core/config/index";
import { CausalDepthError, createEventBus } from "../../../../engine/core/event-bus/index";
import { FILTER_SECTION, Random } from "../../../../engine/core/random/index";
import type { FilterConfig } from "../../../../engine/core/random/index";
import { describeEvent, pebbleFrom, RIPPLE_CHANNEL, wireEcho, wirePond } from "./pond";
import type { DemoEvent } from "./pond";
import { openTracePanel } from "./trace-panel";

/** A seed, so that the scene shows the same pond on every run (ARC-9.1). */
const SEED = 20260807;

/** The name a loader would have read the parameters out of. */
const SOURCE_NAME = "demo.json";

/**
 * What a designer wrote for this scene, in the shape `RND` declares.
 *
 * Invented here like the events are: step 2 has no `game/balance/` to read
 * from, and a scene that reached for one would be inventing the loader as well.
 */
const DESIGNER_WROTE: FilterConfig = {
  channelCap: 32,
  default: "plain",
  profiles: {
    plain: { reduction: 0.6, recovery: 2 },
    patient: { reduction: 0.2, recovery: 6 },
  },
  rules: [{ channel: "demo:*", profile: "patient" }],
};

/**
 * The line under the controls: where the parameters came from, and which
 * profile the service actually resolved for the channel the pond draws on.
 *
 * The second half is the part worth printing. That a configuration was composed
 * proves nothing on its own; that `demo:ripple` is governed by the profile a
 * `demo:*` rule claimed is the composed value **arriving** at the service that
 * declared the section (CTX-10).
 */
function describeParameters(random: Random): string {
  const claim = DESIGNER_WROTE.rules?.[0];
  const stem =
    `RND, built from parameters composed by CFG out of ${SOURCE_NAME}: ` +
    `the rule "${claim?.channel}" claims the profile "${claim?.profile}".`;

  const resolved = random
    .channels()
    .map((report) => `${report.channel} → ${report.profile}`)
    .join(", ");

  if (resolved.length === 0) {
    return `${stem} Nothing drawn yet, so ${RIPPLE_CHANNEL} has no profile resolved.`;
  }

  return `${stem} Resolved so far: ${resolved}.`;
}

/**
 * Builds the whole testbed — services, wiring, overlay — and returns the one
 * function that takes it all down again.
 *
 * A plain function and not the scene's own body, because none of it needs a
 * renderer: it is a bus, a random stream and some DOM. The scene below is the
 * adapter that gives it a lifetime.
 */
function openBusTestbed(): () => void {
  // A configuration of the shape `RND` declares, composed by `CFG` exactly as a
  // bootstrap would compose it: the section comes from the service, the source
  // is a value a loader would have parsed, and what comes back is what the
  // constructor takes.
  const [filter] = composeConfig(
    [FILTER_SECTION],
    [{ name: SOURCE_NAME, values: { random: DESIGNER_WROTE } }],
  );

  const random = new Random(SEED, filter);
  const pond = random.stream("pond");
  const panel = openTracePanel();

  const bus = createEventBus<DemoEvent>((error, event) => {
    // Required, and with no default, so it is answered honestly rather than
    // demonstrated: nothing this scene registers in the presentation phase
    // throws, and if one ever does its failure belongs on screen and not in a
    // console nobody has open.
    panel.refuse(`a handler failed on ${event.type}: ${String(error)}`);
  });

  wirePond(bus, pond);
  wireEcho(bus);

  // The demonstration itself, and the reason its phase is not an implementation
  // detail: **presentation**, so every line below is printed once the world has
  // stopped moving, in one go, in the order the facts happened.
  bus.onAny("presentation", (event) => {
    panel.line(describeEvent(event));
  });

  /**
   * One tick, published and delivered.
   *
   * `CausalDepthError` is caught by its class and nothing else is: a `catch`
   * that swallowed everything would turn the next real failure in a rule into a
   * scene that quietly did nothing, which is precisely what BUS-9 refuses to do
   * in the orchestration phase.
   */
  function tick(publish: () => void): void {
    panel.beginTick();
    publish();

    try {
      bus.flush();
    } catch (error) {
      if (!(error instanceof CausalDepthError)) {
        throw error;
      }

      panel.refuse(error.message);
    }

    panel.parameters(describeParameters(random));
  }

  panel.control("Drop a pebble", () => {
    tick(() => bus.publish(pebbleFrom(pond)));
  });

  panel.control("Ring the echo (a cycle)", () => {
    tick(() => bus.publish({ type: "demo/echo-heard", bank: "the far bank" }));
  });

  panel.parameters(describeParameters(random));

  return () => {
    // The bus's half of CTX-6, outside a flush as BUS-11 requires: the scene is
    // going away, and a subscription that outlived it would be an overlay
    // drawing over a world that no longer exists.
    bus.dispose();
    panel.close();
  };
}

/**
 * `?scene=bus` — step 2, made visible.
 *
 * Everything the bus does is proved at its own surface, in the specs beside it,
 * and nothing here is a second test of any of it. What this scene is for is the
 * one thing a spec cannot show: that the **presentation can drive the bus**
 * without reaching through it into the domain (ARC-1), and that the two-phase
 * delivery is something a person can watch happen rather than a paragraph they
 * have to take on trust.
 *
 * It carries `CFG`'s half of the step as well: the `RND` the pond draws from is
 * built from **composed parameters**, so the two services that make up step 2
 * are visible in one place.
 *
 * **What this scene owns, and why.** It builds its own bus and its own `RND`.
 * They do not come from the `GameContext`, because the context is empty until
 * step 3 fills it with the fields of CTX-1 and with the game loop that will own
 * the `flush()` call site. The context is still taken as a parameter, as every
 * scene takes one, so that when step 3 puts a bus in it this scene changes
 * where it gets one and not its shape. Nothing is reached for: this directory
 * holds no module-level state and there is no global to find.
 */
export class BusScene extends Scene {
  /** What there is to take down before the scene has built anything. */
  private static readonly NOTHING_TO_RELEASE = (): void => {};

  /** Takes the testbed down again. Replaced while the scene is active. */
  private release: () => void = BusScene.NOTHING_TO_RELEASE;

  constructor(readonly context: GameContext) {
    super();
  }

  /**
   * Built on **activation** rather than on initialisation, so that the hook
   * that builds the overlay is the pair of the hook that removes it.
   *
   * `onInitialize` runs once for the life of the scene and `onDeactivate` runs
   * every time the scene is left. A scene built in the first and torn down in
   * the second comes back from its second activation with no overlay and no
   * error — silently dead, in the one way that looks like working. Today's boot
   * registers a single scene per `Engine` and never transitions, so nothing can
   * reach that; the pairing is symmetrical anyway, because "nothing currently
   * calls it twice" is not a property of this file.
   */
  override onActivate(): void {
    this.release();
    this.release = openBusTestbed();
  }

  override onDeactivate(): void {
    this.release();
    this.release = BusScene.NOTHING_TO_RELEASE;
  }
}

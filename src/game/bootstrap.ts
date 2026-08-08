import { createEventBus } from "../engine/core/event-bus/index";
import { createClock } from "../engine/core/time/index";
import { GAME_CALENDAR } from "./calendar";
import type { EventBus } from "../engine/core/event-bus/index";
import type { Clock, TimeConfig } from "../engine/core/time/index";
import type { GameEvent } from "./events";

/**
 * The game's bootstrap: the single construction point for the whole graph
 * (CTX-1), and the seam the rest of the plan hangs off.
 *
 * It **returns** the game's state instead of starting something global, because
 * ARC-8.3 requires two independent games to exist in one process and a `void`
 * signature makes that untestable once scenes have been written against it.
 * There is no service instance at module level anywhere under `game/` (CTX-3):
 * everything below is built inside the function, on every call.
 *
 * The context is a **passive container**. It holds the services and no game
 * logic, mediates no call, and is not a locator anybody fishes out of at
 * runtime: the beat that uses these two lives next door in `orchestration/`.
 */
export interface GameContext {
  /**
   * The game's one channel of indirect communication, typed on the game's own
   * union — the only place that knows what this game is made of.
   */
  readonly bus: EventBus<GameEvent>;

  /**
   * Game time and the scheduler. The presentation may **read** `now()` and
   * `worldTime()` while drawing; only the orchestration's fixed point advances
   * it, because only the orchestration publishes (ARC-4.2).
   */
  readonly clock: Clock<GameEvent>;

  /**
   * Releases everything the game holds, so that a game can be ended without
   * ending the process (CTX-6).
   *
   * Idempotent, and safe to call while nothing else is running. It drops every
   * subscription, so nothing this game publishes afterwards reaches anybody,
   * and it ends the game: a beat pumped after it moves nothing.
   */
  dispose(): void;

  /**
   * Whether this game has been ended.
   *
   * It is here because CTX-6 asks for more than a quiet bus: a context that
   * went on advancing its clock after `dispose()` would not be inert, only
   * unheard, and the next person to read `now()` on a game they had closed
   * would find it had kept going. The orchestration reads this and stops
   * pumping; nothing else has any business asking.
   */
  isDisposed(): boolean;
}

/**
 * What a game is built from.
 *
 * One optional field today and one service to hand it to. It is an options
 * object rather than a positional argument because that is the shape CTX-1
 * settles on — the content, the composed configuration, the seed and the save
 * arrive here as the services that need them do — and growing it later must not
 * make every call site count arguments.
 */
export interface BootstrapOptions {
  /**
   * The calendar. Defaults to this game's own (`GAME_CALENDAR`).
   *
   * It is a parameter at all so that whoever builds a game can say what world
   * it runs in: a test asserting how the beat behaves has no business
   * depending on how long a designer made the day, and a test that did would
   * fail the morning somebody rebalanced it.
   */
  readonly time?: TimeConfig;
}

/**
 * Builds a game and returns its context. Installs nothing, starts nothing, and
 * reads no global.
 *
 * Every dependency is passed explicitly, in this one place, with no automatic
 * resolution and no decorators (CTX-1). Both services take their own arguments
 * and neither takes the context (CTX-2): a service handed the container would
 * have access to everything, which is the boundary CTX-2 exists to keep.
 *
 * Constructible headless (CTX-7): no canvas, no renderer, no assets. What is
 * deliberately still absent is everything the later steps bring — the composed
 * configuration (CTX-10), the content, the seed, the save — because a parameter
 * with nothing behind it is a promise this step cannot keep.
 */
export function bootstrap(options: BootstrapOptions = {}): GameContext {
  const bus = createEventBus<GameEvent>(reportFailedPanel);

  // The clock takes its calendar as its one construction argument, and it is
  // checked before anything is built from it. `CFG` will compose this slice
  // from a file and validate it before the context exists (CTX-10); until then
  // the game's own calendar is a constant next door.
  const clock = createClock<GameEvent>(options.time ?? GAME_CALENDAR);

  let disposed = false;

  return {
    bus,
    clock,

    dispose(): void {
      if (disposed) {
        // Idempotent rather than a refusal: closing a game twice is what
        // happens when a scene tears down and the page unloads, and neither
        // caller is wrong.
        return;
      }

      disposed = true;

      // The clock is left alone. It holds a queue and three numbers, all of
      // which go when the context does, and it has no subscriptions to drop —
      // what ends it is nobody advancing it, which is what `isDisposed()` above
      // is for.
      bus.dispose();
    },

    isDisposed(): boolean {
      return disposed;
    },
  };
}

/**
 * Where a failed **presentation** handler goes.
 *
 * The bus requires this and gives it no default, deliberately: a generic
 * service that reached for `console` would have a dependency it never declared,
 * and one that swallowed by default would have decided on this game's behalf
 * that a panel going dark is not worth mentioning (BUS-9). So the decision is
 * made here, where the game is, and it is the obvious one — say so, and carry
 * on drawing. A rule that fails is never handed to this: those propagate and
 * take the tick with them.
 */
function reportFailedPanel(error: unknown, event: GameEvent): void {
  console.error(`a presentation handler failed on ${event.type}`, error);
}

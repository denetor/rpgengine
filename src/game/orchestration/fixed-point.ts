import type { GameContext } from "../bootstrap";

/**
 * The fixed point: one beat of the game, and the only caller of `advance()`.
 *
 * ```ts
 * drainIntents();                                          // always
 * if (!paused) bus.publishAll(clock.advance(realDeltaMs)); // only if the world runs
 * bus.flush();                                             // always
 * ```
 *
 * **The conditional is on the advance, never on the beat.** Pausing means *not
 * advancing the clock* — it does not mean skipping the tick, which would leave
 * intents undrained and the bus unflushed: an item equipped from a paused
 * inventory would not reach the panel until the game resumed. The world stops;
 * the interface does not.
 *
 * This is the seam every later step pumps. It is deliberately the highest one in
 * the system, so that the composition of the services is proved once here rather
 * than re-derived per service.
 */
export interface FixedPoint {
  /**
   * One beat, given the real time since the last one.
   *
   * The **only** caller of `Clock.advance()` in the whole system. The
   * presentation may read the clock; it may not move it, because only the
   * orchestration publishes — which is what keeps what enters the bus
   * independent of the instant the browser chose to fire an event.
   *
   * How much game time a real millisecond is worth is decided *here*, by what
   * is passed on: today one for one. A game that wanted slow motion would pass
   * a smaller number, and the clock would never know the difference (TIME-2).
   */
  tick(realDeltaMs: number): void;

  /** Stops the world. The interface, the intents and the bus carry on. */
  pause(): void;

  /** Starts it again, from exactly where it stopped. */
  resume(): void;

  /** Whether the world is stopped — what a pause menu draws itself from. */
  isPaused(): boolean;
}

/**
 * Builds the beat for one game.
 *
 * It takes the **whole context**, which no service may do (CTX-2) and which is
 * precisely this module's job: the orchestration is the one thing entitled to
 * hold the game, because it is the thing that composes the services into a
 * tick. Nothing here is a service, and nothing here is exported to one.
 *
 * `paused` lives in this closure and nowhere else. It is orchestration state,
 * because *which situations freeze the world* is a rule of this game: the clock
 * has no pause and no scale to set to zero, and no service ever learns that the
 * game stopped. A boolean is enough while `HUD` and `DLG` do not exist; when
 * they do, this grows into a set of reasons here, and the clock still never
 * learns of it.
 */
export function createFixedPoint(context: GameContext): FixedPoint {
  let paused = false;

  return {
    tick(realDeltaMs: number): void {
      if (context.isDisposed()) {
        // A closed game has no beat. Without this the clock would go on
        // counting behind a context nobody can subscribe to any more — inert
        // to a test that only watches the bus, and quietly not inert to
        // anyone who reads `now()` (CTX-6).
        return;
      }

      // Intents are drained here, first and unconditionally, once `INP` exists
      // at step 7: what the player asked for while the menu was open is still
      // owed an answer. There is nothing to drain yet, and an empty function
      // standing in for it would be a seam nobody could see was empty.

      if (!paused) {
        // The one advance. What comes back is published rather than delivered
        // — the clock returns its batch and never publishes it (ARC-4.2), so
        // the whole of what enters the bus this beat is visible on this line.
        context.bus.publishAll(context.clock.advance(realDeltaMs));
      }

      // Always, and outside the conditional. This is the line that makes a
      // paused game a *stopped world* rather than a stopped program.
      context.bus.flush();
    },

    pause(): void {
      paused = true;
    },

    resume(): void {
      paused = false;
    },

    isPaused(): boolean {
      return paused;
    },
  };
}

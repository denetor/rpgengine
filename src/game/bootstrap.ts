/**
 * The game's bootstrap: the seam the rest of the plan hangs off.
 *
 * It **returns** the game's state instead of starting something global, because
 * ARC-8.3 requires two independent games to exist in one process and a `void`
 * signature makes that untestable once scenes have been written against it.
 *
 * Today the context is an empty shape carrying only `dispose()`. Step 3 fills
 * it with the fields of CTX-1; because every scene already takes it as a
 * parameter, filling it changes no scene's signature — which is the failure
 * `docs/previous-version/ASSESSMENT-REPORT.md` documents for rendering.
 */
export interface GameContext {
  /**
   * Releases everything the game holds, so that a game can be ended without
   * ending the process. Empty while the context is empty.
   */
  dispose(): void;
}

/** Builds a game and returns its context. Installs nothing. */
export function bootstrap(): GameContext {
  return {
    dispose(): void {
      // Nothing is held yet. Step 3 gives this a body.
    },
  };
}

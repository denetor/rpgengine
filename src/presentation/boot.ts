import { Color, DisplayMode, Engine, FadeInOut } from "excalibur";
import type { GameContext } from "../game/bootstrap";
import { FIXED_UPDATE_TIMESTEP_MS } from "./driver";
import { loader } from "./resources";
import { resolveScene, SCENE_PARAMETER } from "./scenes/testbed/registry";
import { renderUnknownScene } from "./scenes/testbed/scene-error";

/**
 * The presentation's boot: it configures Excalibur, picks the scene the URL
 * asks for and hands it the game's state.
 *
 * The context arrives as a parameter and is passed on as a parameter; nothing
 * here reads it. That is the point of the seam — step 3 changes what the
 * context contains, not who takes one.
 */
export async function boot(context: GameContext): Promise<void> {
  const requested = new URLSearchParams(window.location.search).get(SCENE_PARAMETER);
  const resolution = resolveScene(requested);

  if (!resolution.found) {
    renderUnknownScene(resolution);
    return;
  }

  const game = new Engine({
    width: 800, // Logical width and height in game pixels
    height: 600,
    // Whole milliseconds, for the reason written beside the constant.
    //
    // `timescale` is deliberately not set and stays at 1: Excalibur scales
    // `elapsed` before handing it to the update, so a second scaling in the
    // domain would apply it twice. Excalibur's clamp on an anomalous delta — a
    // backgrounded tab, a breakpoint — is this project's cap, and it works by
    // being left alone: nothing in the domain caps anything.
    fixedUpdateTimestep: FIXED_UPDATE_TIMESTEP_MS,
    displayMode: DisplayMode.FitScreenAndFill, // Display mode tells excalibur how to fill the window
    pixelArt: true, // pixelArt will turn on the correct settings to render pixel art without jaggies or shimmering artifacts
    // The scene is registered under its own name, so that the engine's idea of
    // what is running is the name the URL asked for.
    scenes: { [resolution.name]: resolution.create(context) },
  });

  await game.start(resolution.name, {
    loader, // Optional loader (but needed for loading images/sounds)
    inTransition: new FadeInOut({ // Optional in transition
      duration: 1000,
      direction: 'in',
      color: Color.ExcaliburBlue
    })
  });

  // The tab is named after the scene Excalibur actually activated, not after
  // the query string: with several testbed scenes open at once, the tab is
  // where a person reads which one they are looking at. The page's own title is
  // the stem, so the name is written in one place.
  document.title = `${document.title} — ${game.currentSceneName}`;
}

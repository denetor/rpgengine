import type { Scene } from "excalibur";
import type { GameContext } from "../../../game/bootstrap";
import { BusScene } from "./bus/bus-scene";
import { SandboxScene } from "./sandbox/sandbox-scene";

/** The query string parameter that selects a testbed scene: `?scene=<name>`. */
export const SCENE_PARAMETER = "scene";

/**
 * Opened when nothing is asked for, so that the plain URL always shows
 * something that works.
 */
const DEFAULT_SCENE = "sandbox";

/** The name a scene answers to, in the registry and in `?scene=`. */
export type SceneName = string;

/** Builds a scene from the game's state. Every scene receives the context. */
export type SceneFactory = (context: GameContext) => Scene;

/**
 * Every testbed scene, listed by hand.
 *
 * This is an explicit list and not a discovery glob over the folder: a file
 * that states which scenes exist can be read and diffed, and owes nothing to
 * the bundler. The price — every scene is bundled, and a compile error in one
 * breaks them all — is acceptable for a testbed, and the list ships in the
 * production build because a scene that exists in only one of the two build
 * modes is worse than a broken one.
 */
const scenes: Record<SceneName, SceneFactory> = {
  [DEFAULT_SCENE]: (context) => new SandboxScene(context),
  bus: (context) => new BusScene(context),
};

/** A name nobody registered, and what would have worked instead. */
export interface UnknownScene {
  readonly found: false;
  readonly requested: SceneName;
  readonly registered: readonly SceneName[];
}

/** What `?scene=` asked for: either a scene to open, or a name nobody registered. */
export type SceneResolution =
  | { readonly found: true; readonly name: SceneName; readonly create: SceneFactory }
  | UnknownScene;

/**
 * Resolves the value of `?scene=` — `null` when the parameter is absent — into
 * the scene to open.
 *
 * An unregistered name is **not** answered with the default scene. A silent
 * fallback means that a mistyped registration shows the sandbox, and whoever
 * asked for their own scene concludes it is broken.
 */
export function resolveScene(requested: SceneName | null): SceneResolution {
  const name = requested ?? DEFAULT_SCENE;

  if (!Object.hasOwn(scenes, name)) {
    return { found: false, requested: name, registered: Object.keys(scenes) };
  }

  return { found: true, name, create: scenes[name] };
}

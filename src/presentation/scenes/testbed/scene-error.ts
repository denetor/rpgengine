import { SCENE_PARAMETER, UnknownScene } from "./registry";

/** The class the message carries, so that the page can make it legible. */
const ERROR_CLASS = "testbed-error";

/**
 * What a person needs in order to fix their URL: the parameter they got wrong,
 * the name they gave it, and the names that would have worked.
 */
function unknownSceneMessage(resolution: UnknownScene): string {
  const names = resolution.registered.join(", ");
  return `Unknown scene "${resolution.requested}". `
    + `The ?${SCENE_PARAMETER}= parameter accepts one of: ${names}.`;
}

/**
 * Puts that message **in the page**, not in the console.
 *
 * Two reasons, and they point the same way: it is what the person fixing the
 * URL is looking at, and it is observable from the seam the tests already enter
 * through — the browser. Nothing else is started when this is shown.
 */
export function renderUnknownScene(resolution: UnknownScene): void {
  const element = document.createElement("div");
  element.setAttribute("role", "alert");
  element.className = ERROR_CLASS;
  element.textContent = unknownSceneMessage(resolution);
  document.body.append(element);
}

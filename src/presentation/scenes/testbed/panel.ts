/**
 * The two pieces of DOM every testbed overlay is built out of.
 *
 * They live here because both scenes had written them, identically, and a
 * helper copied into the next scene is a helper that drifts: the button one
 * scene builds would stop being the button a test finds in the other. Neither
 * of them knows what a panel is *for* — one makes an element, the other makes a
 * button — which is why sharing them costs the scenes none of their
 * independence.
 */

/** One element, with its class and its text. */
export function element(tag: string, className: string, text = ""): HTMLElement {
  const created = document.createElement(tag);
  created.className = className;
  created.textContent = text;

  return created;
}

/** One button, wired to what it does. */
export function control(className: string, label: string, act: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", act);

  return button;
}

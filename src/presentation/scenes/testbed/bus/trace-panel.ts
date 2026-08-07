/**
 * The overlay the scene is read through: two controls, a trace, and a place for
 * a refusal.
 *
 * In the DOM rather than on the canvas, for the reason `scene-error.ts` is: it
 * is text somebody reads and copies, and drawing text into a canvas buys
 * nothing here but a font to argue with. Nothing in this file knows what a bus
 * is — it is handed lines and prints them — which is what keeps the interesting
 * part of the scene in one place instead of spread across a renderer.
 */

/** The class the overlay carries, so that `style.css` can make it legible. */
const PANEL_CLASS = "bus-testbed";

/** The overlay, once it is on the page. */
export interface TracePanel {
  /**
   * Adds a button that does something.
   *
   * Wired after the panel exists rather than passed in when it is built, so
   * that what a control does can close over the panel it is going to write
   * into — which every control here needs to do.
   */
  control(label: string, act: () => void): void;

  /** Clears the previous tick, so that what is on screen is one tick's trace. */
  beginTick(): void;

  /** Adds one line to the trace. */
  line(text: string): void;

  /** Replaces the line describing where the parameters came from. */
  parameters(text: string): void;

  /** Shows a refusal — the tick failed, and this is what the bus said. */
  refuse(message: string): void;

  /** Takes the overlay off the page. */
  close(): void;
}

/** The paragraph that says what the reader is looking at, and why it matters. */
const EXPLANATION =
  "The trace below is written by an onAny handler registered in the " +
  "PRESENTATION phase. That is why it appears all at once, after every rule " +
  "has run: it is one tick's whole cascade, in causal order, each event " +
  "exactly once. The same handler registered in the orchestration phase " +
  "would print the same events interleaved with the rules still publishing " +
  "them — and the difference between those two readings is the thing this " +
  "scene exists to show.";

/** What a refusal means, in front of the message the bus produced. */
const REFUSAL_NOTE =
  "The flush was refused and the tick is over, so the trace above is empty: " +
  "an exception in the orchestration phase costs the whole tick, and the " +
  "interface is never handed a world the rules stopped halfway through " +
  "building. The bus said:";

/** Builds one element, since every part of the panel wants the same three lines. */
function element(tag: string, className: string, text = ""): HTMLElement {
  const created = document.createElement(tag);
  created.className = className;
  created.textContent = text;
  return created;
}

/** Puts the overlay on the page and returns the handle the scene writes through. */
export function openTracePanel(): TracePanel {
  const panel = element("section", PANEL_CLASS);
  const heading = element("h1", `${PANEL_CLASS}__heading`, "BUS — one tick, traced");
  const explanation = element("p", `${PANEL_CLASS}__note`, EXPLANATION);
  const parametersLine = element("p", `${PANEL_CLASS}__parameters`);
  const buttons = element("div", `${PANEL_CLASS}__controls`);
  const trace = element("ol", `${PANEL_CLASS}__trace`);
  const refusal = element("p", `${PANEL_CLASS}__refusal`);

  // The trace and the refusal are the two things a test — and a person with a
  // screen reader — has to be able to find without knowing the class names.
  trace.setAttribute("aria-label", "trace");
  refusal.setAttribute("role", "alert");
  refusal.hidden = true;

  panel.append(heading, explanation, buttons, parametersLine, trace, refusal);
  document.body.append(panel);

  return {
    control(label: string, act: () => void): void {
      buttons.append(controlFor(label, act));
    },

    beginTick(): void {
      trace.replaceChildren();
      refusal.hidden = true;
      refusal.textContent = "";
    },

    line(text: string): void {
      trace.append(element("li", `${PANEL_CLASS}__event`, text));
    },

    parameters(text: string): void {
      parametersLine.textContent = text;
    },

    refuse(message: string): void {
      refusal.textContent = `${REFUSAL_NOTE} ${message}`;
      refusal.hidden = false;
    },

    close(): void {
      panel.remove();
    },
  };
}

/** One button, wired to what it does. */
function controlFor(label: string, act: () => void): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${PANEL_CLASS}__control`;
  button.textContent = label;
  button.addEventListener("click", act);
  return button;
}

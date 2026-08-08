/**
 * The overlay the `clock` scene is read through: two readings, the controls,
 * and the batch the last beat delivered.
 *
 * In the DOM rather than on the canvas, for the reason `trace-panel.ts` is: it
 * is text somebody reads, and drawing it into a canvas buys nothing here but a
 * font to argue with. Nothing in this file knows what a clock is — it is handed
 * strings and prints them — which keeps the interesting part of the scene in one
 * place.
 */

import { control, element } from "../panel";

/** The class the overlay carries, so that `style.css` can make it legible. */
const PANEL_CLASS = "clock-testbed";

/**
 * A control on the panel, once it is there.
 *
 * It is a handle rather than a label, because two of these controls change what
 * they would do when they are used — pause becomes resume — and a caller that
 * had to name the button by the text currently on it would be holding something
 * that goes stale the moment it is used.
 */
export interface Control {
  /** Changes what the button says, when it has changed what it would do. */
  rename(label: string): void;
}

/** The overlay, once it is on the page. */
export interface ClockPanel {
  /** Adds a button that does something, and hands back the handle to it. */
  control(label: string, act: () => void): Control;

  /** The two readings, written every frame. */
  readings(gameTime: string, worldTime: string): void;

  /** Says whether the world is running, in words rather than by a colour. */
  running(paused: boolean): void;

  /** Replaces the trace with the batch one beat delivered. */
  batch(lines: readonly string[]): void;

  /** Replaces the tally: how many of each fact have arrived since the scene opened. */
  tally(text: string): void;

  /** Takes the overlay off the page. */
  close(): void;
}

/** The paragraph that says what the reader is looking at, and why it matters. */
const EXPLANATION =
  "Game time moves only when the fixed point advances it, once per fixed " +
  "update. The readings below are read off the clock while drawing — a read, " +
  "which the presentation is allowed — and everything in the trace arrived " +
  "through the bus, in the presentation phase, after the rules had finished. " +
  "Pausing does not stop this page: it stops the world, by not advancing it.";

/** What the trace is, so that a large batch is read as one thing and not as a stutter. */
const TRACE_NOTE =
  "The last beat that delivered anything, in the order the clock returned it. " +
  "Jump six hours and the whole batch appears at once — every repetition of " +
  "the bell, and the hour and phase boundaries the jump crossed, in one " +
  "ordered sequence. That is the combat turn, rehearsed before combat exists.";

/** One reading, labelled so that a test and a screen reader find it the same way. */
function reading(name: string): { row: HTMLElement; value: HTMLElement } {
  const row = element("p", `${PANEL_CLASS}__reading`);
  const label = element("span", `${PANEL_CLASS}__label`, `${name}: `);
  const value = element("span", `${PANEL_CLASS}__value`);

  // The accessible name is the reading's name, so nothing depends on a class.
  value.setAttribute("aria-label", name);
  row.append(label, value);

  return { row, value };
}

/** Puts the overlay on the page and returns the handle the scene writes through. */
export function openClockPanel(): ClockPanel {
  const panel = element("section", PANEL_CLASS);
  const heading = element("h1", `${PANEL_CLASS}__heading`, "TIME — the world, driven");
  const explanation = element("p", `${PANEL_CLASS}__note`, EXPLANATION);

  const gameTime = reading("game time");
  const worldTime = reading("world time");
  const state = reading("world state");
  const tallyLine = reading("bells");

  const buttons = element("div", `${PANEL_CLASS}__controls`);
  const traceNote = element("p", `${PANEL_CLASS}__note`, TRACE_NOTE);
  const trace = element("ol", `${PANEL_CLASS}__trace`);

  trace.setAttribute("aria-label", "trace");

  panel.append(
    heading,
    explanation,
    buttons,
    gameTime.row,
    worldTime.row,
    state.row,
    tallyLine.row,
    traceNote,
    trace,
  );
  document.body.append(panel);

  return {
    control(label: string, act: () => void): Control {
      const button = control(`${PANEL_CLASS}__control`, label, act);
      buttons.append(button);

      return {
        rename(renamed: string): void {
          button.textContent = renamed;
        },
      };
    },

    readings(game: string, world: string): void {
      gameTime.value.textContent = game;
      worldTime.value.textContent = world;
    },

    running(paused: boolean): void {
      state.value.textContent = paused ? "paused" : "running";
    },

    batch(lines: readonly string[]): void {
      trace.replaceChildren(
        ...lines.map((line) => element("li", `${PANEL_CLASS}__event`, line)),
      );
    },

    tally(text: string): void {
      tallyLine.value.textContent = text;
    },

    close(): void {
      panel.remove();
    },
  };
}

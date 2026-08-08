import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIXED_UPDATE_TIMESTEP_MS } from "../../../driver";

/**
 * The scene's half of step 3, read off its own source and off the driver's.
 *
 * These are the only tests here that look at the code instead of at what the
 * page does, and they exist for the reason the services' `purity.spec.ts` files
 * do: what they check has **no observable effect until it is violated**. A scene
 * that called `advance()` itself would look identical on screen — the world
 * would run, the readings would move — and the discipline that only the
 * orchestration publishes would be gone, silently, along with the guarantee that
 * nothing enters the bus at an instant the browser chose.
 *
 * The Playwright test next door watches what a person sees. This one watches
 * what a person cannot.
 */

const sceneDirectory = dirname(fileURLToPath(import.meta.url));

/**
 * What the scene may not do, spelled as the call sites it would have to use.
 *
 * `advance(` and `publish` are the two doors into the domain that belong to the
 * orchestration alone. Reading the clock is not on this list and never will be:
 * `now()` and `worldTime()` are reads, and the presentation is explicitly
 * allowed them (ADR-0004, TIME-11).
 */
const NOT_THE_PRESENTATION_S = [".advance(", ".publish(", ".publishAll(", ".flush("];

interface Source {
  readonly file: string;
  readonly text: string;
}

/** Every source the scene ships, spec files excluded. */
function sceneSources(): Source[] {
  return readdirSync(sceneDirectory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts"))
    .map((entry) => ({
      file: entry.name,
      text: readFileSync(join(entry.parentPath, entry.name), "utf-8"),
    }));
}

/** `file: name` for every forbidden call a source makes. */
function occurrencesOfAny(names: readonly string[]): string[] {
  const found: string[] = [];

  for (const { file, text } of sceneSources()) {
    for (const name of names) {
      if (text.includes(name)) {
        found.push(`${file}: ${name}`);
      }
    }
  }

  return found;
}

/**
 * The boot's source: where the driver is built, and therefore where the two
 * load-bearing settings are applied or left alone.
 *
 * Read as text rather than imported, because importing it would import
 * Excalibur, and Excalibur wants a window. The constant it applies is imported
 * above, from the module that exists so that it can be.
 */
function bootSource(): string {
  return readFileSync(join(sceneDirectory, "..", "..", "..", "boot.ts"), "utf-8");
}

describe("the clock scene", () => {
  it("reads its own sources", () => {
    const read = sceneSources().map((source) => source.file);

    expect(read).toContain("clock-scene.ts");
    expect(read.length).toBeGreaterThan(1);
  });

  it("never advances the clock and never publishes", () => {
    // It pumps the fixed point, which does both on its behalf. That is the
    // whole of the discipline every later scene will follow: the presentation
    // drives the domain and does not reach through it.
    expect(occurrencesOfAny(NOT_THE_PRESENTATION_S)).toEqual([]);
  });

  it("pumps the orchestration's fixed point", () => {
    // The other half of the same claim: a scene that called nothing at all
    // would also pass the test above.
    const sources = sceneSources().map((source) => source.text).join("");

    expect(sources).toContain("createFixedPoint");
    expect(sources).toContain("fixedPoint.tick(");
  });
});

describe("the driver", () => {
  it("is configured with a whole number of milliseconds per step", () => {
    // A fractional step would hand the domain a fractional delta, and the clock
    // refuses one (TIME-3): the fraction is the driver's to carry, on the
    // real-time side where real time is.
    expect(Number.isInteger(FIXED_UPDATE_TIMESTEP_MS)).toBe(true);
    expect(FIXED_UPDATE_TIMESTEP_MS).toBeGreaterThan(0);
  });

  it("hands that constant to Excalibur", () => {
    expect(bootSource()).toContain("fixedUpdateTimestep: FIXED_UPDATE_TIMESTEP_MS");
  });

  it("leaves the timescale alone", () => {
    // Excalibur scales `elapsed` before handing it to the update, so a second
    // scaling in the domain would apply it twice. The setting is left at its
    // default by never being written, which is a thing only a reading of the
    // source can check.
    //
    // An **assignment** and not the word: the driver names it in a comment, to
    // say that it is deliberately not set, and a check that forbade the word
    // would forbid the explanation of why it is absent.
    expect(bootSource()).not.toMatch(/\btimescale\s*[:=]/);
  });
});

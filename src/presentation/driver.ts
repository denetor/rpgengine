/**
 * What the driver is configured with, apart from the driver itself.
 *
 * A module of its own so that the two load-bearing settings can be *read* —
 * by `boot.ts`, which applies them, and by the check that they are what they
 * have to be — without pulling Excalibur into a headless test. Importing the
 * boot would import the engine, and the engine wants a window.
 */

/**
 * The fixed simulation step, in **whole** milliseconds: about sixty a second.
 *
 * Whole is the load-bearing half. The domain only ever receives an integer
 * number of milliseconds; Excalibur's own accumulator carries the leftover
 * fraction, on the real-time side where real time is, and calls the update a
 * whole number of times (TIME-3). The clock refuses a fractional delta, so this
 * is not a nicety — `1000 / 60`, which is what somebody improves this into on a
 * quiet afternoon, would fail on the first frame.
 */
export const FIXED_UPDATE_TIMESTEP_MS = 16;

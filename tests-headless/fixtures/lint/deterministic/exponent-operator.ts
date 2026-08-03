/**
 * This file breaks a prohibition on purpose, and must keep breaking it.
 *
 * `**` is `Math.pow` under another name: were it allowed, the prohibition on
 * the deterministic path would be one keystroke away from being sidestepped.
 */
export function lacunarity(base: number, octaves: number): number {
    let scale = base ** octaves;
    scale **= 2;

    return scale;
}

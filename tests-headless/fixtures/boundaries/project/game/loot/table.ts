// Lawful: the game is built on the engine, so it may take a service through its
// public surface. Downhill is the direction the arrow of ARC-1.1 points in.

import { nextRoll } from '../../engine/core/random/index';

export const LOOT = ['a sword', 'a rope', 'a lantern'];

export function randomLoot(): string {
    return LOOT[nextRoll() % LOOT.length];
}

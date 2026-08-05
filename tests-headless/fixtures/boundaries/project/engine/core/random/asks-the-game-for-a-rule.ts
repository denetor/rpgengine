// Rule 4, broken: the engine reaches up into the game (ARC-1.1). The dependency
// is one-way — the game is built on the engine, and an engine that knows this
// game's loot tables is an engine that ships with this game and no other.

import { LOOT } from '../../../game/loot/table';

export function rollLoot(): string {
    return LOOT[0];
}

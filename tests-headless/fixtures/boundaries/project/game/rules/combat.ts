// Lawful, and the case rule 2 is most likely to catch by accident: one module
// of the game importing another module of the game, not through any `index.ts`.
// Modules under `game/` are not services, and ARC-2.1 does not reach them — a
// rule 2 written as "nothing may be imported except through an index" would
// stop the game layer dead and every violation fixture would still be red.

import { randomLoot } from '../loot/table';

export function spoils(): string {
    return randomLoot();
}

// Rule 6 through a third file: quest → inventory → dialogue → quest.
//
// The shape ARC-4.6 names as the conceptual cycle of an RPG, here between three
// modules of `game/` rather than between services — which is exactly the case
// ARC-4.6's "guaranteed by construction" argument does *not* cover, since that
// argument rests on services never importing each other.
//
// It is a separate fixture from the two-file one because a check that only
// noticed A → B → A would pass every assertion the small cycle makes.

import { openDialogue } from './dialogue';

export function turnIn(): string {
    return openDialogue();
}

export const REWARD = 'a rope';

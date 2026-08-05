// A service's public surface: the one file the rest of the project may import.
// It reaches into its own internals, which is the point of having them — and the
// first of the lawful cases rule 2 must not break.

import { drawFrom } from './stream';

export function nextRoll(): number {
    return drawFrom(6);
}

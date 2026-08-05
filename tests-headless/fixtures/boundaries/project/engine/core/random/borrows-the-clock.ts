// Rule 3, broken: one service imports another (ARC-4.1). Through the public
// surface, which is what makes it worth a fixture — the illegal version of this
// crossing is the one that looks entirely correct, and rule 2 would wave it
// through.

import { now } from '../time/index';

export function seedFromClock(): number {
    return now();
}

// Rule 3 again, and the crossing the whole division of labour between rules 2
// and 3 turns on: one service reaching into another service's *insides*.
//
// Rule 2 deliberately exempts every file that already lives inside a service —
// it has to, because a service's own files import each other freely. That looks
// like a hole exactly here, and rule 3 is what closes it: it refuses a service
// the other one's `index.ts`, so reaching past that index is refused too. If
// either rule is loosened, this is the fixture that goes quiet.

import { tick } from '../time/tick';

export function seedFromRawClock(): number {
    return tick();
}

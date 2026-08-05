// A second service, so that rule 3 has two of them to keep apart. Only one
// service exists in the real project today, which is the argument for these
// fixtures rather than against them: without a neighbour, "no service imports
// another service" is a sentence nothing has ever tested.

import { tick } from './tick';

export function now(): number {
    return tick();
}

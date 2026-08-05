// Rule 6, the smallest cycle there is: two files that each need the other.
//
// Nothing in rules 1…5 sees this. Both files sit in the same layer, neither is
// a service, and every edge on its own is a legal edge — which is the whole
// argument for a rule about the graph rather than about its edges.

import { defence } from './second';

export function attack(): number {
    return defence() + 1;
}

export const BASE = 10;

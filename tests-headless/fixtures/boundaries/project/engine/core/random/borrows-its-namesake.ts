// Rule 3, crossed between two services that share a name and differ in family.
// `core/random` and `world/random` are two services, so this is the same
// forbidden crossing as any other — and the only fixture that can tell whether
// rule 3 compares whole paths or merely names.

import { worldNoise } from '../../world/random/index';

export function borrowedNoise(): number {
    return worldNoise();
}

// One side of the diamond.

import { clamp } from './measure';

export function damage(raw: number): number {
    return clamp(raw);
}

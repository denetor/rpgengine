// The other side of the diamond. Unrelated to `blow.ts`: neither imports the
// other, and both need `measure.ts`.

import { clamp } from './measure';

export function absorbed(raw: number): number {
    return clamp(raw / 2);
}

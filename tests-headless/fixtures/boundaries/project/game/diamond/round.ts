// The apex of the diamond: it reaches `measure.ts` twice, by two different
// routes, and never reaches itself. This must pass.

import { damage } from './blow';
import { absorbed } from './guard';

export function resolve(raw: number): number {
    return damage(raw) - absorbed(raw);
}

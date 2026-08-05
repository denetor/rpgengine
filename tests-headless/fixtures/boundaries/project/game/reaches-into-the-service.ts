// Rule 2, broken: a file outside the service names something the service never
// published (ARC-2.1). `stream.ts` is not exported from the service's
// `index.ts`, so from out here it does not exist — and once one caller depends
// on it, the service can no longer be changed behind its own surface.

import { drawFrom } from '../engine/core/random/stream';

export function d20(): number {
    return drawFrom(20);
}

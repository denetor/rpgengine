// Rule 2, broken from the other side: a scene reaching past a service's public
// surface. ADR 0004 lets the presentation talk to a service directly — it does
// not let it talk to the service's insides, and the difference is the whole of
// ARC-2.1.

import { drawFrom } from '../../../../engine/core/random/stream';

export function jitter(): number {
    return drawFrom(3);
}

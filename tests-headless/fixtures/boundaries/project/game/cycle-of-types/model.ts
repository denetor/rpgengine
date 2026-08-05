// The other half of the type-only ring.

import type { Handler } from './handler';

export interface Model {
    subscribe(handler: Handler): void;
}

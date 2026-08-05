// Rule 1, broken the invisible way: `import type` is erased by the compiler, so
// without `tsPreCompilationDeps` the check never sees this line at all. Nothing
// is bundled and nothing runs differently — and the engine now knows a type
// that only exists because a renderer does.

import type { Vector } from 'excalibur';

export function manhattanLength(vector: Vector): number {
    return Math.abs(vector.x) + Math.abs(vector.y);
}

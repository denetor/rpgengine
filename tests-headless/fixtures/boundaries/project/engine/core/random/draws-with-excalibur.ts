// Rule 1, broken the obvious way: a value import of excalibur from inside the
// engine. This is the crossing ARC-1.2 forbids, and the one a tired afternoon
// produces — the import completes, the code runs, and the engine has quietly
// stopped being runnable without a renderer.

import { Color } from 'excalibur';

export const HIGHLIGHT = Color.Red;

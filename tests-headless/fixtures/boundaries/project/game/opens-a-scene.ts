// Rule 5, broken: the game reaches up into the presentation (ARC-1.1). This is
// the crossing that makes a headless simulation impossible, and the one that
// arrives disguised as a convenience — the game "just needs to show something".

import { SandboxScene } from '../presentation/scenes/testbed/sandbox/sandbox-scene';

export function show(): SandboxScene {
    return new SandboxScene();
}

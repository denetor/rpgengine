// Rule 4, broken the other way: the engine reaches up into the presentation
// (ARC-1.1). Two layers up rather than one, and just as forbidden — ARC-1.4
// wants the same game runnable with no renderer at all.

import { SandboxScene } from '../../../presentation/scenes/testbed/sandbox/sandbox-scene';

export function sceneForDebugging(): SandboxScene {
    return new SandboxScene();
}

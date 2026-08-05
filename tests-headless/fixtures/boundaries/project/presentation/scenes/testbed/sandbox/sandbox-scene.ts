// The lawful neighbour of the two fixtures above: excalibur imported from the
// presentation, which is where it belongs. It is here because an over-broad
// rule 1 — one matching `engine` anywhere in the path, say — would pass every
// violation fixture and stop the project dead, and nothing would report it.

import { Scene } from 'excalibur';

import { nextRoll } from '../../../../engine/core/random/index';

export class SandboxScene extends Scene {
    roll(): number {
        return nextRoll();
    }
}

// Two lawful crossings in eight lines, and both of them have to stay lawful.
//
// **excalibur from the presentation**, which is where it belongs: an over-broad
// rule 1 — one matching `engine` anywhere in the path, say — would pass every
// violation fixture and stop the project dead, and nothing would report it.
//
// **A service, straight from a scene, through its public surface**: the
// permission of ADR 0004. Strict layering would oblige this scene to have a
// module in `game/` written for no purpose but to let it through, and §7.2 of
// the requirements asks the opposite — that the scene prove *the presentation*
// can drive the service.

import { Scene } from 'excalibur';

import { nextRoll } from '../../../../engine/core/random/index';

export class SandboxScene extends Scene {
    roll(): number {
        return nextRoll();
    }
}

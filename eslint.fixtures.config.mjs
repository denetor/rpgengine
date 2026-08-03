import { determinismZones } from './eslint.determinism.mjs';

/**
 * Fixture configuration: files that break the prohibitions on purpose.
 *
 * It is never part of `npm run lint` — `eslint.config.mjs` ignores that
 * directory. Only the meta test in `tests-headless/lint.spec.ts` starts it, in
 * a separate process, to check that the linter really reports the violation
 * and really says why.
 *
 * It is the real configuration with different globs, zone for zone:
 * `anywhere/` stands for the rest of the project, `deterministic/` for
 * `src/engine/` and `src/game/`, `service/` for the randomness service.
 */
export default determinismZones({
    everywhere: ['**/*.ts'],
    deterministicPath: ['**/deterministic/*.ts'],
    randomnessService: ['**/service/*.ts'],
});

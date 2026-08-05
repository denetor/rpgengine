import { determinismZones } from './eslint.determinism.mjs';

/**
 * The project's linter, run by `npm run lint`.
 *
 * It carries one concern only, and deliberately no style rules: the
 * prohibitions of ADR 0001, which have **no observable effect until they are
 * violated**. `Math.random()` makes a game unreproducible; a transcendental
 * `Math` function on the deterministic path makes it unreproducible *across
 * engines*, which no test on a single browser can catch. Discipline is not
 * enough for either — hence a tool.
 *
 * The rules and the shape of the three zones live in `eslint.determinism.mjs`,
 * shared with `eslint.fixtures.config.mjs`. Only the globs are decided here.
 *
 * The boundary rules of ARC-14 are not here yet: they belong to a later
 * ticket, and this configuration is where they will go.
 */
export default [
    {
        ignores: [
            'dist/**',
            'playwright-report/**',
            'test-results/**',
            'blob-report/**',
            // Broken on purpose, and linted only by eslint.fixtures.config.mjs.
            'tests-headless/fixtures/lint/**',
        ],
    },
    ...determinismZones({
        everywhere: ['**/*.ts', '**/*.js', '**/*.mjs', '**/*.cjs'],

        // The deterministic path. `engine/` and `game/` produce values a save
        // or a seed must be able to reproduce, on any engine; so does the page
        // that reads the golden vectors out of a browser.
        //
        // `presentation/` is deliberately out, **testbed scenes included**, and
        // so is the browser entry point at the top of `src/`: a scene produces
        // pixels, not values a seed has to reproduce. Why the testbed gets no
        // nested exception, and what that gives up, is argued once in
        // `docs/specs/layout-and-boundaries.md`, §Determinism zones. The
        // decision is pinned by a probe in `tests-headless/lint.spec.ts`.
        deterministicPath: [
            'src/engine/**/*.ts',
            'src/game/**/*.ts',
            'tests-browser/**/*.ts',
        ],

        // ARC-9.2 names the randomness service as the one exception for
        // `Math.random()` — a caller that wants an unseeded game has to get
        // its seed from somewhere.
        randomnessService: ['src/engine/core/random/**/*.ts'],
    }),
];

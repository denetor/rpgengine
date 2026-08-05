/**
 * The frontiers of ARC-14.2, as a `dependency-cruiser` configuration.
 *
 * **Why a second tool, beside the linter that already guards ADR 0001.** Rules
 * 1…5 forbid *edges* of the import graph and rule 6 forbids *cycles*, which is
 * a property of the whole graph; ESLint sees one file at a time, and a plugin
 * that detects cycles rebuilds the graph by hand. The reason that bites sooner:
 * ESLint's core `no-restricted-imports` matches **the string written in the
 * import**, so a crossing written with relative segments would have to be
 * guessed at with a pattern counting how many levels up the author climbed.
 * `dependency-cruiser` resolves each import to a real path from the project
 * root and matches against that, so the rule states what it means. The price is
 * a second place to look when a build fails; what is bought is that ESLint
 * stays what it is today, the keeper of ADR 0001 and nothing else.
 *
 * **Why this file is parametric on its root.** Two configurations apply these
 * very rule objects: `dependency-cruiser.config.mjs`, over `src`, and
 * `dependency-cruiser.fixtures.config.mjs`, over a miniature project that
 * crosses the frontiers on purpose so that `tests-headless/boundaries.spec.ts`
 * can watch the check fail. A rule copied into both would drift, and the test
 * would then certify rules that are no longer the ones applied.
 *
 * Every message names **the frontier that was crossed** and says why it is
 * there: a rule that looks arbitrary gets switched off by the next person who
 * trips over it at 6pm.
 */

const REQUIREMENTS = 'docs/REQUIREMENTS.md';

/**
 * Excalibur as a resolved path, which is what the tool matches against — the
 * package directory itself, and not the next package whose name happens to
 * start with the same eleven letters.
 */
const EXCALIBUR = '^node_modules/excalibur(/|$)';

/**
 * The rules that forbid an edge of the import graph, over a project whose three
 * layers live under `root`.
 *
 * Five of the six rules of ARC-14.2. The sixth forbids cycles, which is a
 * property of the whole graph rather than of an edge, and it is ticket 06.
 */
function forbiddenEdges(root) {
    // A **service** is a directory two levels below `engine/`: the family level
    // of the catalogue (`engine/core/`) is kept, so `engine/core/random/` is a
    // service and `engine/core/` is not. Everything below turns on that, which
    // is why it is written once here.
    const insideAService = `^${root}/engine/[^/]+/[^/]+/`;
    const aPublicSurface = `^${root}/engine/[^/]+/[^/]+/index\\.ts$`;

    // The same directory, captured, so that a `to` pattern can say "some other
    // service" — the one thing no single pattern can express on its own. The
    // whole path is captured and not just the service's name: two families may
    // each hold a service called `random`, and they would be different services.
    const theServiceWeCameFrom = `^(${root}/engine/[^/]+/[^/]+)/`;

    return [
        {
            name: 'engine-may-not-import-excalibur',
            severity: 'error',
            comment:
                'Frontier crossed: engine/ → excalibur. ARC-1.2 keeps rendering, DOM and audio ' +
                'APIs out of the domain, so that the same game can also run with no renderer at ' +
                'all (ARC-1.4) — which is the condition that makes a headless system test ' +
                'possible, and the reason the engine can be replayed from a seed without a ' +
                'browser. Excalibur belongs to presentation/: let the engine answer in plain ' +
                `values and let the presentation draw them. See ARC-1.2 and ARC-14.2 in ${REQUIREMENTS}.`,
            from: { path: `^${root}/engine/` },
            to: { path: EXCALIBUR },
        },
        {
            name: 'service-internals-are-private',
            severity: 'error',
            comment:
                "Frontier crossed: outside a service → its insides. ARC-2.1 gives every service a " +
                'single public surface, its index.ts, and everything the index does not export is ' +
                'private to it — not by convention but so that the service can be changed behind ' +
                'that surface without a search of the project. Import what the index exports; if ' +
                `what you need is not there, the question is whether it should be. See ARC-2.1 and ARC-14.2 in ${REQUIREMENTS}.`,
            // Anything that is not itself inside a service. Files that *are*
            // inside one are left to the rule below, which is stricter: it
            // refuses a service the other service's index as well, so nothing
            // falls between the two.
            from: { pathNot: insideAService },
            to: { path: insideAService, pathNot: aPublicSurface },
        },
        {
            name: 'services-may-not-import-each-other',
            severity: 'error',
            comment:
                'Frontier crossed: a service → another service. ARC-4.1 lets a service receive ' +
                'neither another service nor an injection of one; what one service needs from ' +
                'another it is handed as a value by the orchestration (ARC-4.2), which is what ' +
                'keeps each service testable on its own (ARC-3.4) and the service graph acyclic ' +
                `by construction (ARC-4.6). See ARC-4.1 and ARC-14.2 in ${REQUIREMENTS}.`,
            from: { path: theServiceWeCameFrom },
            // `$1` is the service directory captured on the left. Without the
            // backreference the rule would have to name every pair of services
            // that will ever exist.
            to: { path: insideAService, pathNot: '^$1/' },
        },
        {
            name: 'engine-may-not-import-the-layers-above',
            severity: 'error',
            comment:
                'Frontier crossed: engine/ → game/ or presentation/. ARC-1.1 makes the ' +
                'dependencies one-way, presentation → game → engine, and this is the arrow ' +
                'pointing back up. An engine that knows this game is an engine that ships with ' +
                'this game and no other, and one that knows the presentation cannot be run ' +
                `headless at all (ARC-1.4). See ARC-1.1 and ARC-14.2 in ${REQUIREMENTS}.`,
            from: { path: `^${root}/engine/` },
            to: { path: `^${root}/(game|presentation)/` },
        },
        {
            name: 'game-may-not-import-the-presentation',
            severity: 'error',
            comment:
                'Frontier crossed: game/ → presentation/. ARC-1.1 again, one step further up: ' +
                'the rules of the game are what a headless simulation runs, so a rule that ' +
                'reaches for a scene is a rule that cannot be simulated or tested without a ' +
                'renderer. What the presentation must show, the game reports; the presentation ' +
                `decides how to draw it. See ARC-1.1 and ARC-14.2 in ${REQUIREMENTS}.`,
            from: { path: `^${root}/game/` },
            to: { path: `^${root}/presentation/` },
        },
    ];
}

/**
 * The options both configurations run under.
 *
 * They are shared for the same reason the rules are: `tsPreCompilationDeps` is
 * what makes a type-only import visible at all, so a fixture proving that a
 * type-only crossing is caught would prove it about the fixture run only, while
 * the real check quietly went blind.
 */
const OPTIONS = {
    // Without this, TypeScript's `import type` is erased before the tool ever
    // sees it — and a type-only import upward is exactly how a domain layer
    // starts to know the layer above it.
    tsPreCompilationDeps: true,

    // The compiler's own resolution, so that the tool resolves an import the
    // way the build does rather than the way it guesses.
    tsConfig: { fileName: 'tsconfig.json' },

    // The edge *into* a package is what rule 1 is about, so the dependency is
    // recorded; what lives inside the package is not this project's graph, so
    // it is not walked into.
    doNotFollow: { path: ['node_modules'] },
};

/** The whole configuration, for a project whose layers live under `root`. */
export function boundaryConfiguration(root) {
    return {
        forbidden: forbiddenEdges(root),
        options: OPTIONS,
    };
}

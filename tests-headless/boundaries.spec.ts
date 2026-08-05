import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const thisDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(thisDirectory, '..');

/**
 * The tool's entry point, named outright. `require.resolve` on the manifest —
 * the trick `lint.spec.ts` uses to find ESLint — does not work here, because
 * `dependency-cruiser` does not export its `package.json`.
 */
const boundaryCheckCli = join(
    projectRoot,
    'node_modules',
    'dependency-cruiser',
    'bin',
    'dependency-cruise.mjs',
);

const REAL_CONFIG = 'dependency-cruiser.config.mjs';
const FIXTURES_CONFIG = 'dependency-cruiser.fixtures.config.mjs';

/** What `npm run boundaries` checks, and what the fixture configuration checks. */
const PROJECT = 'src';
const FIXTURES = 'tests-headless/fixtures/boundaries/project';

/**
 * The reporter `npm run boundaries` uses, and therefore the one whose exit code
 * and whose text are the outcome a person actually gets.
 */
const HUMAN_REPORTER = 'err-long';

interface Violation {
    from: string;
    to: string;
    dependencyTypes: string[];
    rule: { name: string };
}

interface ForbiddenRule {
    name: string;
    from: { path?: string };
    to: { path?: string };
}

/** What the tool reports about a run, in the machine-readable form. */
interface Report {
    violations: Violation[];
    forbidden: ForbiddenRule[];
    tsPreCompilationDeps: boolean;
}

/** What the tool reports to whoever started it. */
interface Outcome {
    exitCode: number | null;
    message: string;
}

/** Starts the check in a separate process, with the reporter asked for. */
function runCheck(
    target: string,
    config: string,
    outputType: string,
): SpawnSyncReturns<string> {
    const args = [target, '--config', config, '--output-type', outputType];

    return spawnSync(process.execPath, [boundaryCheckCli, ...args], {
        cwd: projectRoot,
        encoding: 'utf-8',
    });
}

/**
 * The outcome of a run, as the pipeline reads it.
 *
 * The separate process is the point, as in `runner.spec.ts` and
 * `lint.spec.ts`: what is observed is what the check reports to whoever started
 * it — the exit code, the message — and not the outcome of an assertion made
 * in here.
 *
 * It has to be **this** reporter and not the JSON one: `--output-type json`
 * exits 0 whatever it found, since printing a report is not the same as
 * failing. The exit code that fails a build is the one the command's own
 * reporter returns, so that is the run these assertions watch.
 */
function outcomeOf(target: string, config: string): Outcome {
    const result = runCheck(target, config, HUMAN_REPORTER);

    return {
        exitCode: result.status,
        message: result.stdout + result.stderr,
    };
}

/**
 * The same run, read as data: which edge broke which rule, and — in
 * `ruleSetUsed` — the rules the tool actually understood the configuration to
 * mean. That last part is the tool's own answer to "what is configured here",
 * which is what the zone assertions at the bottom need and what no command-line
 * flag offers.
 */
function reportOf(target: string, config: string): Report {
    const result = runCheck(target, config, 'json');

    if (!result.stdout.startsWith('{')) {
        throw new Error(
            `the check reported no result at all (exit ${result.status}): ${result.stderr}`,
        );
    }

    const parsed = JSON.parse(result.stdout) as {
        summary: {
            violations: Violation[];
            ruleSetUsed: { forbidden: ForbiddenRule[] };
            optionsUsed: { tsPreCompilationDeps?: boolean };
        };
    };

    return {
        violations: parsed.summary.violations,
        forbidden: parsed.summary.ruleSetUsed.forbidden,
        tsPreCompilationDeps: parsed.summary.optionsUsed.tsPreCompilationDeps === true,
    };
}

/**
 * Four runs, shared by every assertion below: the fixtures and the project,
 * each read once as an outcome and once as data. They happen in `beforeAll` and
 * not at module level so that a check that fails to start is reported as a
 * failed test — with its stderr — rather than as a crash during collection.
 */
let fixtureOutcome: Outcome;
let fixtureReport: Report;
let projectOutcome: Outcome;
let projectReport: Report;

beforeAll(() => {
    fixtureOutcome = outcomeOf(FIXTURES, FIXTURES_CONFIG);
    fixtureReport = reportOf(FIXTURES, FIXTURES_CONFIG);
    projectOutcome = outcomeOf(PROJECT, REAL_CONFIG);
    projectReport = reportOf(PROJECT, REAL_CONFIG);
}, 180_000);

/** The violations reported for one fixture, named relative to the fixture root. */
function violationsFor(fixture: string): Violation[] {
    return fixtureReport.violations.filter(
        (violation) => violation.from === `${FIXTURES}/${fixture}`,
    );
}

/**
 * The reporter wraps its text at a fixed width, so a phrase in a message is not
 * a phrase in a line. Whitespace is flattened before anything is looked for.
 */
function unwrapped(text: string): string {
    return text.replace(/\s+/g, ' ');
}

/** Rule 1 of ARC-14.2, named after the frontier rather than after its number. */
const ENGINE_TO_EXCALIBUR = 'engine-may-not-import-excalibur';

describe('the boundary check, seen failing', () => {
    it('reports a failure when a frontier is crossed', () => {
        expect(fixtureOutcome.exitCode).not.toBe(0);
    });

    it('catches excalibur imported from inside the engine', () => {
        const violations = violationsFor('engine/core/random/draws-with-excalibur.ts');

        expect(violations).toHaveLength(1);
        expect(violations[0].rule.name).toBe(ENGINE_TO_EXCALIBUR);
        expect(violations[0].to).toContain('excalibur');
    });

    it('catches the same crossing written as an `import type`', () => {
        const violations = violationsFor('engine/core/random/knows-an-excalibur-type.ts');

        expect(violations).toHaveLength(1);
        expect(violations[0].rule.name).toBe(ENGINE_TO_EXCALIBUR);
        // Named rather than taken on trust: were the edge seen as an ordinary
        // import, this fixture would pass for the wrong reason and
        // `tsPreCompilationDeps` could be switched off unnoticed.
        expect(violations[0].dependencyTypes).toContain('type-only');
    });

    it('names the frontier that was crossed, and the file that crossed it', () => {
        const message = unwrapped(fixtureOutcome.message);

        expect(message).toContain('Frontier crossed: engine/ → excalibur');
        expect(message).toContain('draws-with-excalibur.ts');
        expect(message).toContain('ARC-1.2');
    });

    it('leaves excalibur alone in the presentation, which is where it belongs', () => {
        expect(violationsFor('presentation/scenes/testbed/sandbox/sandbox-scene.ts')).toEqual([]);
    });
});

/**
 * What the **real** configuration forbids, applied to paths that stand for
 * their layer and need not exist.
 *
 * The fixtures above prove the rules bite. They cannot prove the project is
 * inside them, because they bring their own root: a mistyped path in the real
 * configuration would leave every fixture green and the engine unguarded. And
 * the subject here is the pattern, not today's file inventory — `src/engine/`
 * holds nothing but the randomness service at the moment, so an assertion
 * naming a real engine file would keep passing after the layer was renamed.
 *
 * The rules are read back from the tool rather than imported from the
 * configuration file, so that what is asserted is what the tool understood.
 */
function frontiersFrom(path: string): string[] {
    return projectReport.forbidden
        .filter((rule) => covers(rule.from.path, path))
        .map((rule) => rule.name);
}

/** The frontiers that name a module at `path` as the forbidden destination. */
function frontiersTo(path: string): string[] {
    return projectReport.forbidden
        .filter((rule) => covers(rule.to.path, path))
        .map((rule) => rule.name);
}

/** Whether one side of a rule, which may say nothing at all, covers a path. */
function covers(pattern: string | undefined, path: string): boolean {
    return pattern !== undefined && new RegExp(pattern).test(path);
}

/** A path standing for its layer, whether or not anything lives there yet. */
const ENGINE = 'src/engine/core/combat/rules.ts';
const GAME = 'src/game/loot/table.ts';
const PRESENTATION = 'src/presentation/scenes/testbed/proximity/proximity-scene.ts';
const ENTRY_POINT = 'src/main.ts';

/** Excalibur as the tool resolves it, and a package that merely starts the same. */
const EXCALIBUR = 'node_modules/excalibur/build/dist/excalibur.min.js';
const A_PACKAGE_NAMED_AFTER_IT = 'node_modules/excalibur-tiled/dist/index.js';

describe('the frontiers the project itself falls inside', () => {
    it('closes the excalibur frontier over the whole engine', () => {
        expect(frontiersFrom(ENGINE)).toContain(ENGINE_TO_EXCALIBUR);
    });

    it('closes it over the engine only: excalibur is how the other layers draw', () => {
        expect(frontiersFrom(PRESENTATION)).not.toContain(ENGINE_TO_EXCALIBUR);
        expect(frontiersFrom(GAME)).not.toContain(ENGINE_TO_EXCALIBUR);
        expect(frontiersFrom(ENTRY_POINT)).not.toContain(ENGINE_TO_EXCALIBUR);
    });

    it('closes it against excalibur, not against every package named after it', () => {
        expect(frontiersTo(EXCALIBUR)).toContain(ENGINE_TO_EXCALIBUR);
        expect(frontiersTo(A_PACKAGE_NAMED_AFTER_IT)).not.toContain(ENGINE_TO_EXCALIBUR);
    });

    it('reads type-only imports in the real project too, not only in the fixtures', () => {
        expect(projectReport.tsPreCompilationDeps).toBe(true);
    });
});

describe('the project as it stands', () => {
    it('crosses no frontier, and passes the check unchanged', () => {
        expect(projectReport.violations).toEqual([]);
        expect(projectOutcome.exitCode).toBe(0);
    });
});

/**
 * The wiring, which is otherwise the one part of the check nothing observes.
 *
 * Everything above starts the tool directly, so a check that had been dropped
 * from the build and from the unit lane would still be green here — the same
 * hole the zone assertions exist to close, one level out. And the root is
 * written down twice, in `dependency-cruiser.config.mjs` and on the command
 * line, because the tool takes what to cruise as an argument and not from its
 * configuration; if the two ever disagreed the rules would match nothing and
 * the check would pass in silence.
 */
function scripts(): Record<string, string> {
    const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8')) as {
        scripts: Record<string, string>;
    };

    return manifest.scripts;
}

describe('the command the pipeline runs', () => {
    it('checks the root the real configuration is written for', () => {
        const [tool, target] = scripts().boundaries.split(' ');

        expect(tool).toBe('depcruise');
        expect(target).toBe(PROJECT);
        expect(scripts().boundaries).toContain(REAL_CONFIG);
    });

    it('runs inside the build, so that a crossing fails it (ARC-14.3)', () => {
        expect(scripts().build).toContain('npm run boundaries');
    });

    it('runs inside the fast unit lane, so a developer finds out before the build does', () => {
        expect(scripts()['test:unit']).toContain('npm run boundaries');
    });
});

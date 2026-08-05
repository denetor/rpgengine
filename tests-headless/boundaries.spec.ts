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

/**
 * One side of a rule. A side may say what it covers, what it does not, or both;
 * a side that says neither covers everything.
 */
interface Side {
    path?: string;
    pathNot?: string;
}

interface ForbiddenRule {
    name: string;
    from: Side;
    to: Side;
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

/** The five edge rules of ARC-14.2, named after their frontier, not their number. */
const ENGINE_TO_EXCALIBUR = 'engine-may-not-import-excalibur';
const SERVICE_INTERNALS_ARE_PRIVATE = 'service-internals-are-private';
const SERVICE_TO_ANOTHER_SERVICE = 'services-may-not-import-each-other';
const ENGINE_TO_THE_LAYERS_ABOVE = 'engine-may-not-import-the-layers-above';
const GAME_TO_PRESENTATION = 'game-may-not-import-the-presentation';

/** The frontiers a fixture was reported for, by name. */
function frontiersCrossedBy(fixture: string): string[] {
    return violationsFor(fixture).map((violation) => violation.rule.name);
}

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

    it('catches a file outside a service naming what the service never published', () => {
        expect(frontiersCrossedBy('game/reaches-into-the-service.ts')).toEqual([
            SERVICE_INTERNALS_ARE_PRIVATE,
        ]);
        expect(
            frontiersCrossedBy('presentation/scenes/testbed/sandbox/peeks-inside-the-service.ts'),
        ).toEqual([SERVICE_INTERNALS_ARE_PRIVATE]);
    });

    it('catches one service importing another, public surface and all', () => {
        expect(frontiersCrossedBy('engine/core/random/borrows-the-clock.ts')).toEqual([
            SERVICE_TO_ANOTHER_SERVICE,
        ]);
    });

    /**
     * The crossing the division of labour between rules 2 and 3 turns on. Rule 2
     * exempts every file that already lives inside a service, because a
     * service's own files import each other freely; rule 3 is what stops that
     * exemption from becoming a way into the service next door.
     */
    it('catches one service rummaging in another service’s insides', () => {
        expect(frontiersCrossedBy('engine/core/random/rummages-in-the-clock.ts')).toEqual([
            SERVICE_TO_ANOTHER_SERVICE,
        ]);
    });

    /**
     * Two services may share a name and differ in family, so "another service"
     * has to compare whole paths. A rule comparing names would let this one
     * through and pass every other fixture in the file.
     */
    it('tells two services apart when they share a name', () => {
        expect(frontiersCrossedBy('engine/core/random/borrows-its-namesake.ts')).toEqual([
            SERVICE_TO_ANOTHER_SERVICE,
        ]);
    });

    it('catches the engine reaching up into the game, and into the presentation', () => {
        expect(frontiersCrossedBy('engine/core/random/asks-the-game-for-a-rule.ts')).toEqual([
            ENGINE_TO_THE_LAYERS_ABOVE,
        ]);
        expect(frontiersCrossedBy('engine/core/random/draws-its-own-scene.ts')).toEqual([
            ENGINE_TO_THE_LAYERS_ABOVE,
        ]);
    });

    it('catches the game reaching up into the presentation', () => {
        expect(frontiersCrossedBy('game/opens-a-scene.ts')).toEqual([GAME_TO_PRESENTATION]);
    });

    it('says which frontier was crossed, for every rule and not only the first', () => {
        const message = unwrapped(fixtureOutcome.message);

        for (const frontier of [
            'engine/ → excalibur',
            'outside a service → its insides',
            'a service → another service',
            'engine/ → game/ or presentation/',
            'game/ → presentation/',
        ]) {
            expect(message).toContain(`Frontier crossed: ${frontier}`);
        }
    });
});

describe('the crossings that are legal, and must stay so', () => {
    it('lets excalibur into the presentation, and a scene into a service surface', () => {
        expect(violationsFor('presentation/scenes/testbed/sandbox/sandbox-scene.ts')).toEqual([]);
    });

    it('lets a service import its own internals', () => {
        expect(violationsFor('engine/core/random/index.ts')).toEqual([]);
        expect(violationsFor('engine/core/time/index.ts')).toEqual([]);
    });

    it('lets a spec beside the code import the internals it tests', () => {
        expect(violationsFor('engine/core/random/stream.spec.ts')).toEqual([]);
    });

    it('lets a module of the game import another module of the game', () => {
        expect(violationsFor('game/rules/combat.ts')).toEqual([]);
    });

    it('lets the game take a service through its public surface', () => {
        expect(violationsFor('game/loot/table.ts')).toEqual([]);
    });

    it('reports the ten crossings named above and not one more', () => {
        // Every violation is identified by name somewhere above; the count is
        // what turns "these fire" into "only these fire", so that a rule which
        // starts biting a lawful file fails here instead of going unread.
        expect(fixtureReport.violations).toHaveLength(10);
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
function rulesForbidding(from: string, to: string): string[] {
    return projectReport.forbidden
        .filter((rule) => closes(rule, from, to))
        .map((rule) => rule.name);
}

/** Whether one rule of the real configuration closes one crossing. */
function closes(rule: ForbiddenRule, from: string, to: string): boolean {
    const captured = capturesFrom(rule.from, from);

    if (captured === null) {
        return false;
    }

    return capturesFrom(withGroups(rule.to, captured), to) !== null;
}

/**
 * What a side matches on a path: the capture groups if it covers the path, and
 * `null` if it does not. A side with no `path` covers everything its `pathNot`
 * does not exclude, which is how "any file outside a service" is written.
 */
function capturesFrom(side: Side, path: string): string[] | null {
    if (side.pathNot !== undefined && new RegExp(side.pathNot).test(path)) {
        return null;
    }

    if (side.path === undefined) {
        return [path];
    }

    return new RegExp(side.path).exec(path);
}

/**
 * A `to` pattern may refer back to a group captured by `from` — `$1` is how
 * "some *other* service" is expressed at all, since no single pattern can say
 * "not the one we came from". The tool substitutes as it walks the graph; these
 * assertions ask about a pair of paths, so they have to substitute themselves.
 *
 * This is the one place where the assertions stop reading the tool and start
 * imitating it, so it is worth saying what that costs: if the tool's
 * backreferences ever meant something else, the crossings below would be
 * checked against a rule the check does not apply. What guards against it is
 * the other half of this file — a fixture where one service reaches into
 * another's insides, which only stays red while `$1` means what it means here.
 */
function withGroups(side: Side, captured: string[]): Side {
    return {
        path: side.path === undefined ? undefined : substituted(side.path, captured),
        pathNot: side.pathNot === undefined ? undefined : substituted(side.pathNot, captured),
    };
}

/** One pattern with its `$1`…`$9` replaced by what `from` captured. */
function substituted(pattern: string, captured: string[]): string {
    return pattern.replace(/\$([1-9])/g, (reference, digit: string) => {
        return captured[Number(digit)] ?? reference;
    });
}

/** A path standing for its layer, whether or not anything lives there yet. */
const ENGINE = 'src/engine/core/combat/rules.ts';
const GAME = 'src/game/loot/table.ts';
const ANOTHER_GAME_MODULE = 'src/game/rules/damage.ts';
const PRESENTATION = 'src/presentation/scenes/testbed/proximity/proximity-scene.ts';
const ENTRY_POINT = 'src/main.ts';

/** A service, and the difference between its surface and its insides. */
const SERVICE_SURFACE = 'src/engine/core/combat/index.ts';
const SERVICE_INTERNALS = 'src/engine/core/combat/resolve-attack.ts';
const SERVICE_SPEC = 'src/engine/core/combat/resolve-attack.spec.ts';
const ANOTHER_SERVICE_SURFACE = 'src/engine/core/random/index.ts';
const A_FAMILY_LEVEL_FILE = 'src/engine/core/shared-types.ts';

/** Excalibur as the tool resolves it, and a package that merely starts the same. */
const EXCALIBUR = 'node_modules/excalibur/build/dist/excalibur.min.js';
const A_PACKAGE_NAMED_AFTER_IT = 'node_modules/excalibur-tiled/dist/index.js';

describe('the frontiers the project itself falls inside', () => {
    it('closes the excalibur frontier over the whole engine', () => {
        expect(rulesForbidding(ENGINE, EXCALIBUR)).toContain(ENGINE_TO_EXCALIBUR);
    });

    it('closes it over the engine only: excalibur is how the other layers draw', () => {
        expect(rulesForbidding(PRESENTATION, EXCALIBUR)).toEqual([]);
        expect(rulesForbidding(GAME, EXCALIBUR)).toEqual([]);
        expect(rulesForbidding(ENTRY_POINT, EXCALIBUR)).toEqual([]);
    });

    it('closes it against excalibur, not against every package named after it', () => {
        expect(rulesForbidding(ENGINE, A_PACKAGE_NAMED_AFTER_IT)).toEqual([]);
    });

    it('keeps a service reachable only through its public surface', () => {
        expect(rulesForbidding(GAME, SERVICE_INTERNALS)).toContain(SERVICE_INTERNALS_ARE_PRIVATE);
        expect(rulesForbidding(PRESENTATION, SERVICE_INTERNALS)).toContain(
            SERVICE_INTERNALS_ARE_PRIVATE,
        );
        expect(rulesForbidding(ENTRY_POINT, SERVICE_INTERNALS)).toContain(
            SERVICE_INTERNALS_ARE_PRIVATE,
        );
    });

    it('lets a service keep its own insides, spec included', () => {
        expect(rulesForbidding(SERVICE_SURFACE, SERVICE_INTERNALS)).toEqual([]);
        expect(rulesForbidding(SERVICE_SPEC, SERVICE_INTERNALS)).toEqual([]);
    });

    it('counts a service two levels below the engine, not one', () => {
        // `engine/core/` is a family of services, not a service: a file sitting
        // directly in it is nobody's internals, and the rule must not claim it.
        expect(rulesForbidding(GAME, A_FAMILY_LEVEL_FILE)).toEqual([]);
    });

    it('does not treat a module of the game as a service', () => {
        // ARC-2.1 speaks about services, which live under `engine/`. A rule
        // reading "nothing but an index may be imported" would stop the game
        // layer dead while every violation fixture stayed red.
        expect(rulesForbidding(GAME, ANOTHER_GAME_MODULE)).toEqual([]);
    });

    it('keeps the services apart, surface or no surface', () => {
        expect(rulesForbidding(SERVICE_INTERNALS, ANOTHER_SERVICE_SURFACE)).toContain(
            SERVICE_TO_ANOTHER_SERVICE,
        );
    });

    it('holds the engine below the game and the presentation', () => {
        expect(rulesForbidding(ENGINE, GAME)).toContain(ENGINE_TO_THE_LAYERS_ABOVE);
        expect(rulesForbidding(ENGINE, PRESENTATION)).toContain(ENGINE_TO_THE_LAYERS_ABOVE);
    });

    it('holds the game below the presentation', () => {
        expect(rulesForbidding(GAME, PRESENTATION)).toContain(GAME_TO_PRESENTATION);
    });

    it('leaves the arrow of ARC-1.1 open downhill', () => {
        expect(rulesForbidding(PRESENTATION, GAME)).toEqual([]);
        expect(rulesForbidding(GAME, SERVICE_SURFACE)).toEqual([]);
    });

    /**
     * The permission of ADR 0004, asserted rather than inferred from the absence
     * of a rule. Whoever has read "presentation → game → engine" will expect
     * this crossing to be closed, and closing it is one line — so the decision
     * needs somewhere to fail.
     */
    it('lets a scene reach a service directly, through its public surface', () => {
        expect(rulesForbidding(PRESENTATION, SERVICE_SURFACE)).toEqual([]);
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

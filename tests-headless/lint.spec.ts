import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const thisDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(thisDirectory, '..');
const fixturesConfig = join(projectRoot, 'eslint.fixtures.config.mjs');
const fixturesDirectory = join(thisDirectory, 'fixtures', 'lint');

const eslintPackageRoot = dirname(require.resolve('eslint/package.json'));
const eslintCli = join(eslintPackageRoot, 'bin', 'eslint.js');

interface LintMessage {
    ruleId: string | null;
    message: string;
}

interface LintFile {
    filePath: string;
    messages: LintMessage[];
}

interface LintRun {
    exitCode: number | null;
    files: LintFile[];
}

/**
 * Runs the linter over the fixture suite, in a separate process.
 *
 * The separate process is the point, as in `runner.spec.ts`: what we want to
 * observe is the outcome the linter reports to whoever started it — the exit
 * code the pipeline reads — and not the outcome of an assertion.
 *
 * The fixtures deliberately break the prohibitions, so they cannot be part of
 * the normal `npm run lint`: `eslint.config.mjs` ignores them, and only
 * `eslint.fixtures.config.mjs` — which applies the very same rule objects —
 * ever looks at them.
 */
function runFixtureLint(): LintRun {
    const args = [
        '--no-config-lookup',
        '--config',
        fixturesConfig,
        '--format',
        'json',
        fixturesDirectory,
    ];
    const result = spawnSync(process.execPath, [eslintCli, ...args], {
        cwd: projectRoot,
        encoding: 'utf-8',
    });

    if (!result.stdout.startsWith('[')) {
        throw new Error(
            `the linter reported no result at all (exit ${result.status}): ${result.stderr}`,
        );
    }

    return {
        exitCode: result.status,
        files: JSON.parse(result.stdout) as LintFile[],
    };
}

/**
 * One run, shared by every assertion below. It happens in `beforeAll` and not
 * at module level so that a linter that fails to start is reported as a failed
 * test — with its stderr — rather than as a crash during collection.
 */
let lintRun: LintRun;

beforeAll(() => {
    lintRun = runFixtureLint();
}, 120_000);

/**
 * The two rules the determinism prohibitions are expressed with. The linter
 * reports the odd notice of its own — an inline `eslint-disable` that
 * `noInlineConfig` refused, for one — and those are not what is under test.
 */
const DETERMINISM_RULES = ['no-restricted-properties', 'no-restricted-syntax'];

function isDeterminismMessage(message: LintMessage): boolean {
    return message.ruleId !== null && DETERMINISM_RULES.includes(message.ruleId);
}

/** The messages reported for one fixture, named relative to the fixture root. */
function messagesFor(fixture: string): string[] {
    const wanted = join(fixturesDirectory, fixture);
    const file = lintRun.files.find((candidate) => candidate.filePath === wanted);

    if (file === undefined) {
        throw new Error(`the linter never looked at ${fixture}`);
    }

    return file.messages.filter(isDeterminismMessage).map((message) => message.message);
}

describe('lint-enforced prohibitions', () => {
    it('reports a failure when a prohibition is broken', () => {
        expect(lintRun.exitCode).not.toBe(0);
    });

    it('catches Math.random outside the randomness service', () => {
        const messages = messagesFor('anywhere/math-random.ts');

        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('Math.random');
    });

    it('catches every transcendental Math function on the deterministic path', () => {
        const messages = messagesFor('deterministic/transcendental.ts').join('\n');

        for (const forbidden of ['Math.log', 'Math.cos', 'Math.sin', 'Math.exp', 'Math.pow']) {
            expect(messages).toContain(forbidden);
        }
    });

    it('catches the exponentiation operator on the deterministic path', () => {
        const messages = messagesFor('deterministic/exponent-operator.ts');

        expect(messages).toHaveLength(2);
        for (const message of messages) {
            expect(message).toContain('**');
        }
    });

    it('catches the approximated Math constants on the deterministic path', () => {
        const messages = messagesFor('deterministic/approximate-constants.ts').join('\n');

        for (const forbidden of ['Math.SQRT2', 'Math.SQRT1_2', 'Math.PI']) {
            expect(messages).toContain(forbidden);
        }
    });

    it('cannot be switched off from inside the file that breaks it', () => {
        const messages = messagesFor('deterministic/disabled-in-line.ts').join('\n');

        expect(messages).toContain('Math.cos');
        expect(messages).toContain('**');
    });

    it('explains why, and points at ADR 0001', () => {
        const everyMessage = lintRun.files
            .flatMap((file) => file.messages)
            .filter(isDeterminismMessage)
            .map((message) => message.message);

        expect(everyMessage.length).toBeGreaterThan(0);
        for (const message of everyMessage) {
            expect(message).toContain('0001-bit-for-bit-reproducibility');
        }
    });

    it('leaves the exactly specified Math functions alone', () => {
        expect(messagesFor('deterministic/exact-math.ts')).toEqual([]);
    });

    it('lets the randomness service call Math.random', () => {
        expect(messagesFor('service/math-random.ts')).toEqual([]);
    });
});

/**
 * What the real `eslint.config.mjs` forbids at a given path.
 *
 * `--print-config` answers for a *path*, not for a file, and the path need not
 * exist. That is what makes this worth asserting: the subject is the glob, not
 * today's file inventory — `src/engine/` happens to hold nothing but the
 * randomness service at the moment, so a test that named a real engine file
 * would still pass with the whole `src/engine/**` glob deleted, covered by the
 * service glob nested inside it.
 *
 * The fixtures above prove the rules bite. They cannot prove the project is
 * inside them, because they bring their own globs: a mistyped glob in the real
 * configuration leaves every fixture passing and the engine unguarded.
 */
function forbiddenPropertiesAt(path: string): string[] {
    const result = spawnSync(process.execPath, [eslintCli, '--print-config', path], {
        cwd: projectRoot,
        encoding: 'utf-8',
    });

    if (!result.stdout.startsWith('{')) {
        throw new Error(`no configuration came back for ${path}: ${result.stderr}`);
    }

    const configured = JSON.parse(result.stdout) as {
        rules: { 'no-restricted-properties'?: [number, ...{ property: string }[]] };
    };
    const [, ...entries] = configured.rules['no-restricted-properties'] ?? [0];

    return entries.map((entry) => entry.property);
}

/** A path standing for its zone, whether or not anything lives there yet. */
const ENGINE = 'src/engine/core/combat/rules.ts';
const GAME = 'src/game/loot/table.ts';
const SERVICE = 'src/engine/core/random/stream.ts';
const TESTBED = 'src/testbed/random/test-random.ts';
const VECTOR_PAGE = 'tests-browser/golden-vectors.ts';
const PRESENTATION = 'src/main.ts';

describe('the zones the project itself falls in', () => {
    it('holds the engine to the whole of ADR 0001', () => {
        const forbidden = forbiddenPropertiesAt(ENGINE);

        expect(forbidden).toEqual(expect.arrayContaining(['pow', 'cos', 'SQRT2', 'random']));
    });

    it('holds the game rules to it too: a fight is replayed from a seed', () => {
        expect(forbiddenPropertiesAt(GAME)).toEqual(expect.arrayContaining(['pow', 'cos']));
    });

    it('holds the testbed and the vector page to it, since both report computed values', () => {
        expect(forbiddenPropertiesAt(TESTBED)).toContain('pow');
        expect(forbiddenPropertiesAt(VECTOR_PAGE)).toContain('pow');
    });

    it('leaves Math.random to the randomness service alone', () => {
        expect(forbiddenPropertiesAt(SERVICE)).not.toContain('random');
        expect(forbiddenPropertiesAt(SERVICE)).toContain('pow');
        expect(forbiddenPropertiesAt(PRESENTATION)).toContain('random');
    });

    it('does not hold the presentation code to the transcendental prohibition', () => {
        expect(forbiddenPropertiesAt(PRESENTATION)).not.toContain('cos');
    });
});
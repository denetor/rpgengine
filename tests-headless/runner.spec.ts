import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const thisDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(thisDirectory, '..');
const fixturesConfig = join(projectRoot, 'vitest.fixtures.config.ts');

const vitestPackageRoot = dirname(require.resolve('vitest/package.json'));
const vitestCli = join(vitestPackageRoot, 'vitest.mjs');

interface RunResult {
    exitCode: number | null;
    output: string;
}

/**
 * Runs the headless runner on the fixture suite, in a separate process.
 *
 * The separate process is the point: what we want to observe is the outcome
 * the runner reports to whoever started it, not the outcome of an assertion.
 */
function runFixtureSuite(): RunResult {
    const args = ['run', '--config', fixturesConfig];
    const result = spawnSync(process.execPath, [vitestCli, ...args], {
        cwd: projectRoot,
        encoding: 'utf-8',
    });
    return {
        exitCode: result.status,
        output: result.stdout + result.stderr,
    };
}

describe('headless suite', () => {
    it('reports a failure when a test does not hold', () => {
        const run = runFixtureSuite();

        expect(run.exitCode).not.toBe(0);
        expect(run.output).toContain('deliberate-failure.ts');
        expect(run.output).toContain('fails on purpose');
    }, 120_000);
});

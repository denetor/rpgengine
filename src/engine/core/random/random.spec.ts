import { describe, expect, it } from 'vitest';
import { Random } from './index';

/**
 * Every test enters through a constructed service and observes the values it
 * produces: the only seam this service exposes (see the spec's "Seam"
 * section). No test knows the generator's internal structure.
 */
describe('Random', () => {
    it('produces the same sequence for the same root seed', () => {
        const first = new Random(12345);
        const second = new Random(12345);

        const firstValues = drawUniforms(first.stream('combat'), 100);
        const secondValues = drawUniforms(second.stream('combat'), 100);

        expect(firstValues).toEqual(secondValues);
    });

    it('produces the same sequence over a million draws', () => {
        const first = new Random(12345).stream('combat');
        const second = new Random(12345).stream('combat');
        let differences = 0;

        for (let draw = 0; draw < 1_000_000; draw += 1) {
            if (first.next() !== second.next()) {
                differences += 1;
            }
        }

        expect(differences).toBe(0);
    }, 30_000);

    it('gives every stream its own sequence', () => {
        const service = new Random(12345);

        const combat = drawUniforms(service.stream('combat'), 100);
        const loot = drawUniforms(service.stream('loot'), 100);

        expect(combat).not.toEqual(loot);
    });

    it('returns the same instance for the same stream id', () => {
        const service = new Random(12345);

        expect(service.stream('combat')).toBe(service.stream('combat'));
    });

    it('keeps two services built in the same process independent', () => {
        const first = new Random(12345);
        const second = new Random(999);

        const firstBefore = first.stream('combat').next();
        drawUniforms(second.stream('combat'), 100);
        const firstAfter = first.stream('combat').next();
        const firstAlone = new Random(12345).stream('combat');

        expect([firstBefore, firstAfter]).toEqual(drawUniforms(firstAlone, 2));
    });

    it('refuses an explicit seed that contradicts an existing stream', () => {
        const service = new Random(12345);
        service.stream('combat', 777);

        expect(() => service.stream('combat', 778)).toThrow(/different seed/);
        expect(() => service.stream('combat', 777)).not.toThrow();
        expect(() => service.stream('combat')).not.toThrow();
    });

    it('leaves a stream untouched while another one is consumed', () => {
        const service = new Random(12345);
        const reference = drawUniforms(new Random(12345).stream('combat'), 10);

        drawUniforms(service.stream('ai'), 1000);

        expect(drawUniforms(service.stream('combat'), 10)).toEqual(reference);
    });

    it('leaves existing streams untouched when a new stream is created', () => {
        const service = new Random(12345);
        const combat = service.stream('combat');
        const before = drawUniforms(combat, 10);

        drawUniforms(service.stream('ambient'), 10);

        const after = drawUniforms(combat, 10);
        const alone = drawUniforms(new Random(12345).stream('combat'), 20);
        expect([...before, ...after]).toEqual(alone);
    });

    it('uses an explicit seed in place of the derived one', () => {
        const derived = new Random(12345).stream('combat');
        const explicit = new Random(12345).stream('combat', 777);
        const sameExplicit = new Random(54321).stream('loot', 777);

        expect(drawUniforms(explicit, 20)).not.toEqual(drawUniforms(derived, 20));
        expect(drawUniforms(new Random(12345).stream('combat', 777), 20)).toEqual(
            drawUniforms(sameExplicit, 20),
        );
    });
});

function drawUniforms(stream: { next(): number }, count: number): number[] {
    const values: number[] = [];
    for (let index = 0; index < count; index += 1) {
        values.push(stream.next());
    }
    return values;
}

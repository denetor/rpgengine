import { describe, expect, it } from 'vitest';
import { Random, RANDOM_STATE_VERSION } from './index';
import type { RandomState } from './index';

/**
 * Saving and restoring, seen from where the game sees it: a service, the state
 * it produces, and the service rebuilt from that state. No test reaches for the
 * generator's internals — the round trip is observed through the values drawn
 * before and after it.
 */
describe('serialization', () => {
    it('carries a version, the root seed and the touched streams', () => {
        const service = new Random(12345);
        service.stream('combat').next();

        const state = service.serialize();

        expect(state.version).toBe(RANDOM_STATE_VERSION);
        expect(state.rootSeed).toBe(12345);
        expect(state.streams.map((stream) => stream.id)).toEqual(['combat']);
    });

    it('resumes the sequence from the exact point it was saved at', () => {
        const service = new Random(12345);
        const combat = service.stream('combat');
        drawUniforms(combat, 37);

        const state = service.serialize();
        const expected = drawUniforms(combat, 100);
        const restored = Random.deserialize(state);

        expect(drawUniforms(restored.stream('combat'), 100)).toEqual(expected);
    });

    it('survives the trip through JSON', () => {
        const service = new Random(12345);
        drawUniforms(service.stream('combat'), 37);
        drawUniforms(service.stream('loot'), 9);

        const state = service.serialize();
        const expected = drawUniforms(service.stream('combat'), 100);
        const restored = Random.deserialize(JSON.parse(JSON.stringify(state)) as RandomState);

        expect(drawUniforms(restored.stream('combat'), 100)).toEqual(expected);
    });

    it('produces a state made of plain data only', () => {
        const service = new Random(12345);
        drawUniforms(service.stream('combat'), 5);
        drawUniforms(service.stream('loot', 777), 5);

        const state = service.serialize();

        expect(nonPlainValues(state)).toEqual([]);
        expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    });

    it('keeps every stream at its own position', () => {
        const service = new Random(12345);
        drawUniforms(service.stream('combat'), 37);
        drawUniforms(service.stream('loot'), 9);
        drawUniforms(service.stream('ai'), 512);

        const state = service.serialize();
        const expected = {
            combat: drawUniforms(service.stream('combat'), 20),
            loot: drawUniforms(service.stream('loot'), 20),
            ai: drawUniforms(service.stream('ai'), 20),
        };
        const restored = Random.deserialize(state);

        expect({
            combat: drawUniforms(restored.stream('combat'), 20),
            loot: drawUniforms(restored.stream('loot'), 20),
            ai: drawUniforms(restored.stream('ai'), 20),
        }).toEqual(expected);
    });

    it('leaves a stream that was never requested out of the state', () => {
        const service = new Random(12345);
        drawUniforms(service.stream('combat'), 10);

        const state = service.serialize();

        expect(state.streams.map((stream) => stream.id)).toEqual(['combat']);
    });

    it('rebuilds an unsaved stream from its own name', () => {
        const service = new Random(12345);
        drawUniforms(service.stream('combat'), 10);

        const restored = Random.deserialize(service.serialize());

        expect(drawUniforms(restored.stream('loot'), 20)).toEqual(
            drawUniforms(new Random(12345).stream('loot'), 20),
        );
    });

    it('resumes a stream born from an explicit seed without being given the seed again', () => {
        const service = new Random(12345);
        const lockpick = service.stream('lockpick', 777);
        drawUniforms(lockpick, 13);

        const state = service.serialize();
        const expected = drawUniforms(lockpick, 20);
        const restored = Random.deserialize(state);

        expect(drawUniforms(restored.stream('lockpick'), 20)).toEqual(expected);
    });

    it('remembers that a restored stream had an explicit seed', () => {
        const service = new Random(12345);
        service.stream('lockpick', 777).next();

        const restored = Random.deserialize(service.serialize());

        expect(() => restored.stream('lockpick', 777)).not.toThrow();
        expect(() => restored.stream('lockpick', 778)).toThrow(/different seed/);
    });

    it('stores no seed for a stream that derived its own', () => {
        const service = new Random(12345);
        service.stream('combat').next();

        const state = service.serialize();

        expect(Object.prototype.hasOwnProperty.call(state.streams[0], 'seed')).toBe(false);
    });

    it('orders the streams by name, whatever the order they were requested in', () => {
        const one = new Random(12345);
        const other = new Random(12345);
        for (const id of ['loot', 'ai', 'combat']) {
            one.stream(id).next();
        }
        for (const id of ['combat', 'loot', 'ai']) {
            other.stream(id).next();
        }

        expect(JSON.stringify(one.serialize())).toEqual(JSON.stringify(other.serialize()));
    });

    it('takes a snapshot: drawing afterwards does not move the saved state', () => {
        const service = new Random(12345);
        const combat = service.stream('combat');

        const state = service.serialize();
        const expected = drawUniforms(combat, 20);
        drawUniforms(combat, 1000);

        expect(drawUniforms(Random.deserialize(state).stream('combat'), 20)).toEqual(expected);
    });

    it('restores by construction: no instance method replaces the state', () => {
        const service = new Random(12345);
        const forbidden = ['deserialize', 'restore', 'load', 'setState', 'fromState'];

        for (const name of forbidden) {
            expect(service[name as keyof Random]).toBeUndefined();
        }
    });

    it('refuses a state written by another version', () => {
        const service = new Random(12345);
        service.stream('combat').next();
        const state = { ...service.serialize(), version: RANDOM_STATE_VERSION + 1 };

        expect(() => Random.deserialize(state)).toThrow(/version/);
    });

    it('refuses a state whose stream is not a usable generator state', () => {
        const service = new Random(12345);
        service.stream('combat').next();
        const state = service.serialize();
        const truncated = {
            ...state,
            streams: [{ ...state.streams[0], words: [1, 2, 3] }],
        };
        const zeroed = {
            ...state,
            streams: [{ ...state.streams[0], words: [0, 0, 0, 0] }],
        };

        expect(() => Random.deserialize(truncated)).toThrow(/combat/);
        expect(() => Random.deserialize(zeroed)).toThrow(/combat/);
    });

    it('refuses a state that names the same stream twice', () => {
        const service = new Random(12345);
        service.stream('combat').next();
        const state = service.serialize();
        const duplicated = { ...state, streams: [state.streams[0], state.streams[0]] };

        expect(() => Random.deserialize(duplicated)).toThrow(/combat/);
    });
});

function drawUniforms(stream: { next(): number }, count: number): number[] {
    const values: number[] = [];
    for (let index = 0; index < count; index += 1) {
        values.push(stream.next());
    }
    return values;
}

/**
 * Every value the state holds, that is neither a number, a string, a boolean,
 * a plain object nor an array — a function, a class instance, a typed array.
 */
function nonPlainValues(value: unknown, path: string = 'state'): string[] {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        return [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => nonPlainValues(item, `${path}[${index}]`));
    }
    if (isPlainObject(value)) {
        return Object.entries(value).flatMap(([key, item]) =>
            nonPlainValues(item, `${path}.${key}`),
        );
    }
    return [`${path}: ${typeof value}`];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        Object.getPrototypeOf(value) === Object.prototype
    );
}

import { describe, expect, it } from 'vitest';
import { NOISE_MAX_SLOPE, Random } from './index';
import type { RandomStream } from './index';

/**
 * Coherent noise, observed through a constructed service — the same seam as
 * every other spec here.
 *
 * The property under test throughout is that `noise2` and `fbm2` are **pure
 * functions of (stream seed, x, y)** (RND-18): they read the stream's
 * permutation table and nothing else, so no test here needs to know how many
 * values were drawn before it, or in which order the samples were taken.
 */

function streamOf(seed: number, id = 'worldgen'): RandomStream {
    return new Random(seed).stream(id);
}

/** A spread of coordinates: whole numbers, fractions, negatives, far away. */
function sampleGrid(stream: RandomStream, side = 40, step = 0.37): number[] {
    const values: number[] = [];
    for (let row = 0; row < side; row += 1) {
        for (let column = 0; column < side; column += 1) {
            values.push(stream.noise2((column - side / 2) * step, (row - side / 2) * step));
        }
    }
    return values;
}

/** The largest change one step away from `(x, y)`, in either direction. */
function slopeAround(stream: RandomStream, x: number, y: number, step: number): number {
    const here = stream.noise2(x, y);
    return Math.max(
        Math.abs(stream.noise2(x + step, y) - here),
        Math.abs(stream.noise2(x, y + step) - here),
    );
}

describe('noise2', () => {
    it('stays inside the declared interval', () => {
        const stream = streamOf(101);

        for (const value of sampleGrid(stream, 80, 0.19)) {
            expect(value).toBeGreaterThanOrEqual(-1);
            expect(value).toBeLessThanOrEqual(1);
        }
    });

    it('uses the interval it declares instead of hugging zero', () => {
        const stream = streamOf(102);
        const values = sampleGrid(stream, 80, 0.19);

        expect(Math.max(...values)).toBeGreaterThan(0.5);
        expect(Math.min(...values)).toBeLessThan(-0.5);
    });

    it('is zero on the lattice, where no gradient contributes', () => {
        const stream = streamOf(103);

        expect(stream.noise2(0, 0)).toBe(0);
        expect(stream.noise2(3, -7)).toBe(0);
    });

    it('varies gradually: nearby samples differ within the declared bound', () => {
        // Swept over many tables and over both a line and a grid: a bound
        // measured along one walk of one seed is close to self-confirming, and
        // the steepest spot of a permutation is not on any particular line.
        const step = 0.001;
        let worst = 0;

        for (let seed = 0; seed < 40; seed += 1) {
            const stream = streamOf(1000 + seed);

            for (let index = 0; index < 500; index += 1) {
                const x = index * 0.0131 - 3;
                const y = index * 0.0079 - 2;
                worst = Math.max(worst, slopeAround(stream, x, y, step));
            }

            for (let row = 0; row < 24; row += 1) {
                for (let column = 0; column < 24; column += 1) {
                    // Offsets that walk the inside of a cell, where the fade is
                    // steepest, rather than the lattice points, where it is flat.
                    const x = column * 0.37 + 0.43;
                    const y = row * 0.37 + 0.51;
                    worst = Math.max(worst, slopeAround(stream, x, y, step));
                }
            }
        }

        expect(worst).toBeLessThanOrEqual(NOISE_MAX_SLOPE * step);
    });

    it('gives the same value for the same coordinates, in whatever order they are sampled', () => {
        const coordinates: [number, number][] = [];
        for (let index = 0; index < 500; index += 1) {
            coordinates.push([index * 0.41 - 100, index * -0.23 + 60]);
        }

        const forwards = streamOf(105);
        const inOrder = coordinates.map(([x, y]) => forwards.noise2(x, y));

        const backwards = streamOf(105);
        const reversed = [...coordinates].reverse().map(([x, y]) => backwards.noise2(x, y));

        expect([...reversed].reverse()).toEqual(inOrder);
    });

    it('gives the same value however many times it is asked', () => {
        const stream = streamOf(106);

        expect(stream.noise2(1.5, -2.25)).toBe(stream.noise2(1.5, -2.25));
    });

    it('depends on the stream, not on the service the stream came from', () => {
        const one = new Random(107);
        const other = new Random(107);

        expect(one.stream('worldgen').noise2(0.5, 0.5)).toBe(
            other.stream('worldgen').noise2(0.5, 0.5),
        );
        expect(one.stream('worldgen').noise2(0.5, 0.5)).not.toBe(
            one.stream('ai').noise2(0.5, 0.5),
        );
    });

    it('scales the coordinates by the frequency', () => {
        const stream = streamOf(108);

        expect(stream.noise2(0.5, -1.25, { frequency: 3 })).toBe(stream.noise2(1.5, -3.75));
    });

    it('refuses coordinates and a frequency it cannot sample', () => {
        const stream = streamOf(109);

        expect(() => stream.noise2(Number.NaN, 0)).toThrow(/finite/);
        expect(() => stream.noise2(0, Number.POSITIVE_INFINITY)).toThrow(/finite/);
        expect(() => stream.noise2(0, 0, { frequency: 0 })).toThrow(/frequency/);
        expect(() => stream.noise2(0, 0, { frequency: -1 })).toThrow(/frequency/);
    });
});

describe('the permutation table', () => {
    it('is built when the stream is created, not from the values drawn since', () => {
        const drawnFrom = streamOf(110);
        for (let draw = 0; draw < 1000; draw += 1) {
            drawnFrom.next();
        }

        expect(drawnFrom.noise2(0.5, 0.25)).toBe(streamOf(110).noise2(0.5, 0.25));
    });

    it('survives a save and a reload, without being written to the save', () => {
        const service = new Random(111);
        const before = service.stream('worldgen');
        before.next();
        const expected = before.noise2(0.5, 0.25);

        const state = service.serialize();
        const restored = Random.deserialize(state);

        expect(JSON.stringify(state)).not.toMatch(/permutation/);
        expect(restored.stream('worldgen').noise2(0.5, 0.25)).toBe(expected);
    });

    it('follows an explicit stream seed rather than the root seed', () => {
        const fromRoot = new Random(112).stream('worldgen');
        const fromExplicit = new Random(112).stream('worldgen', 999);
        const sameExplicit = new Random(777).stream('worldgen', 999);

        expect(fromExplicit.noise2(0.5, 0.25)).toBe(sameExplicit.noise2(0.5, 0.25));
        expect(fromExplicit.noise2(0.5, 0.25)).not.toBe(fromRoot.noise2(0.5, 0.25));
    });
});

describe('sampling and the sequence', () => {
    it('leaves the sequence exactly where it was, over a million samplings', () => {
        const sampled = streamOf(113);
        const first = sampled.next();

        for (let sample = 0; sample < 1_000_000; sample += 1) {
            sampled.noise2(sample * 0.013, sample * -0.007);
        }

        const reference = streamOf(113);
        expect(first).toBe(reference.next());
        expect(sampled.next()).toBe(reference.next());
    }, 30_000);

    it('leaves the sequence alone for fbm as well', () => {
        const sampled = streamOf(114);

        for (let sample = 0; sample < 10_000; sample += 1) {
            sampled.fbm2(sample * 0.013, sample * -0.007, 5);
        }

        expect(sampled.next()).toBe(streamOf(114).next());
    });

    it('leaves the sequence alone when it refuses a sample', () => {
        const stream = streamOf(115);

        expect(() => stream.noise2(Number.NaN, 0)).toThrow();
        expect(() => stream.fbm2(0, 0, 0)).toThrow();

        expect(stream.next()).toBe(streamOf(115).next());
    });
});

describe('fbm2', () => {
    it('is the plain noise when there is a single octave', () => {
        const stream = streamOf(116);

        expect(stream.fbm2(0.5, -1.25, 1)).toBe(stream.noise2(0.5, -1.25));
        expect(stream.fbm2(0.5, -1.25, 1, { frequency: 4 })).toBe(
            stream.noise2(0.5, -1.25, { frequency: 4 }),
        );
    });

    it('stays inside the declared interval whatever the octaves', () => {
        const stream = streamOf(117);

        for (let index = 0; index < 4000; index += 1) {
            const x = index * 0.037 - 70;
            const y = index * -0.019 + 40;
            const value = stream.fbm2(x, y, 6, { lacunarity: 2.3, persistence: 0.7 });
            expect(value).toBeGreaterThanOrEqual(-1);
            expect(value).toBeLessThanOrEqual(1);
        }
    });

    it('sums the octaves: adding one changes the result', () => {
        const stream = streamOf(118);

        const one = stream.fbm2(0.5, -1.25, 1);
        const two = stream.fbm2(0.5, -1.25, 2);
        const three = stream.fbm2(0.5, -1.25, 3);

        expect(two).not.toBe(one);
        expect(three).not.toBe(two);
    });

    it('takes the lacunarity and the persistence from the caller', () => {
        const stream = streamOf(119);
        const plain = stream.fbm2(0.5, -1.25, 4);

        expect(stream.fbm2(0.5, -1.25, 4, { lacunarity: 3 })).not.toBe(plain);
        expect(stream.fbm2(0.5, -1.25, 4, { persistence: 0.25 })).not.toBe(plain);
    });

    it('applies the lacunarity octave by octave', () => {
        const stream = streamOf(120);
        const lacunarity = 2.5;
        const persistence = 0.5;

        // The same sum written out by hand, with the frequency of each octave
        // spelled out as a product rather than as a power.
        const summed =
            stream.noise2(0.5, -1.25) +
            persistence * stream.noise2(0.5 * lacunarity, -1.25 * lacunarity) +
            persistence *
                persistence *
                stream.noise2(0.5 * lacunarity * lacunarity, -1.25 * lacunarity * lacunarity);
        const amplitudes = 1 + persistence + persistence * persistence;

        expect(stream.fbm2(0.5, -1.25, 3, { lacunarity, persistence })).toBe(
            summed / amplitudes,
        );
    });

    it('adds detail: more octaves vary faster over a short step', () => {
        const stream = streamOf(121);
        // Short enough that the sixth octave — thirty-two times faster than the
        // first — is still resolved. Measured over a step it cannot resolve,
        // the extra octaves read as noise and the comparison says nothing.
        const step = 0.005;
        let coarse = 0;
        let detailed = 0;

        for (let index = 0; index < 2000; index += 1) {
            const x = index * 0.023 - 20;
            const y = index * -0.017 + 15;
            coarse += Math.abs(stream.fbm2(x + step, y, 1) - stream.fbm2(x, y, 1));
            detailed += Math.abs(stream.fbm2(x + step, y, 6) - stream.fbm2(x, y, 6));
        }

        expect(detailed).toBeGreaterThan(coarse * 1.05);
    });

    it('gives the same value for the same coordinates, in whatever order', () => {
        const coordinates: [number, number][] = [];
        for (let index = 0; index < 300; index += 1) {
            coordinates.push([index * 0.29 - 40, index * -0.13 + 25]);
        }

        const forwards = streamOf(122);
        const inOrder = coordinates.map(([x, y]) => forwards.fbm2(x, y, 4));

        const backwards = streamOf(122);
        const reversed = [...coordinates].reverse().map(([x, y]) => backwards.fbm2(x, y, 4));

        expect([...reversed].reverse()).toEqual(inOrder);
    });

    it('refuses an octave count that is not a whole number of octaves', () => {
        const stream = streamOf(123);

        expect(() => stream.fbm2(0, 0, 0)).toThrow(/octave/);
        expect(() => stream.fbm2(0, 0, -1)).toThrow(/octave/);
        expect(() => stream.fbm2(0, 0, 2.5)).toThrow(/octave/);
    });

    it('refuses a lacunarity or a persistence it cannot sum', () => {
        const stream = streamOf(124);

        expect(() => stream.fbm2(0, 0, 3, { lacunarity: 0 })).toThrow(/lacunarity/);
        expect(() => stream.fbm2(0, 0, 3, { lacunarity: Number.NaN })).toThrow(/lacunarity/);
        expect(() => stream.fbm2(0, 0, 3, { persistence: -0.5 })).toThrow(/persistence/);
        expect(() => stream.fbm2(0, 0, 3, { persistence: Number.NaN })).toThrow(/persistence/);
    });

    it('refuses octaves whose frequency would run off the end of the number line', () => {
        const stream = streamOf(125);

        // Each of the three is finite on its own, and the last octave is not.
        // Left unchecked, an infinite frequency makes the lattice cell NaN and
        // the sample comes back NaN — outside the interval, and silent.
        expect(() => stream.fbm2(0.5, 0.5, 40, { lacunarity: 1e9 })).toThrow(/largest number/);
        expect(() => stream.fbm2(0.5, 0.5, 12, { frequency: 1e300, lacunarity: 1e9 })).toThrow(
            /largest number/,
        );

        expect(stream.fbm2(0.5, 0.5, 40, { lacunarity: 1e9 - 1, frequency: 1e-300 })).not.toBeNaN();
    });
});
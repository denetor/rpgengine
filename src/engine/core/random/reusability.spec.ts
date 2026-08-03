import { describe, expect, it } from 'vitest';
import { NOISE_MAX_SLOPE, Random, UNFILTERED_PROFILE } from './index';
import type { FilterConfig, FilterProfile, RandomStream, WeightedEntry } from './index';

/**
 * The reusability proof (ARC-3.4, ARC-3.2).
 *
 * `RND` is declared **generic**, and that is a promise which degrades in
 * silence: one balancing constant, one channel name taken for granted, one
 * default that only makes sense in an action RPG, and the service is
 * domain-specific before anybody notices. This file is the test that would
 * notice.
 *
 * Everything below belongs to **a vineyard**: soil moisture over a plot,
 * rainfall in millimetres, which grapes are ripe, what a taster writes down.
 * There are no dungeons, no loot and no damage anywhere in it, and nothing here
 * is imported from this game's code — the only imports are the service's own
 * door and the numbers this file makes up.
 *
 * The criterion, stated so that a later edit cannot quietly fail it: **if
 * making this file pass ever requires changing the service, the service was not
 * generic**.
 *
 * The two counting helpers below are also in `filter.spec.ts`, and that is
 * deliberate rather than an oversight: a proof that the service can be lifted
 * into another project must not itself lean on this game's test scaffolding.
 * They are six lines of arithmetic over an array, and the copy costs less than
 * the coupling would.
 */

/** The grape varieties of a made-up estate, in no particular order. */
const VARIETIES = ['malvasia', 'trebbiano', 'vermentino', 'moscato'];

/** How the fruit on a row is found, when somebody walks out to look at it. */
const RIPENESS: WeightedEntry<string>[] = [
    { value: 'green', weight: 6 },
    { value: 'turning', weight: 3 },
    { value: 'ripe', weight: 1 },
];

/** What a taster writes down about a barrel. The channel these repeat on. */
const TASTING_NOTES: WeightedEntry<string>[] = [
    { value: 'almond', weight: 4 },
    { value: 'quince', weight: 3 },
    { value: 'wet-stone', weight: 2 },
    { value: 'elderflower', weight: 1 },
];

/**
 * A configuration invented for this estate and nothing else: two profiles named
 * after how patient a taster is, and a rule that hands every tasting channel to
 * the patient one. Neither name means anything to the service.
 */
const ESTATE_CONFIG: FilterConfig = {
    channelCap: 4,
    default: 'brisk',
    profiles: {
        brisk: { reduction: 0.8, recovery: 1 },
        patient: { reduction: 0.2, recovery: 6 },
    },
    rules: [{ channel: 'tasting:*', profile: 'patient' }],
};

/** The outcomes of `count` filtered draws on one channel. */
function drawFiltered(stream: RandomStream, channel: string, count: number): string[] {
    const drawn: string[] = [];
    for (let draw = 0; draw < count; draw += 1) {
        drawn.push(stream.filtered(channel, TASTING_NOTES));
    }
    return drawn;
}

/** How many draws repeated the one before them. */
function repetitions(drawn: readonly string[]): number {
    let repeated = 0;
    for (let index = 1; index < drawn.length; index += 1) {
        if (drawn[index] === drawn[index - 1]) {
            repeated += 1;
        }
    }
    return repeated;
}

/** How many of `drawn` were `outcome`. */
function timesDrawn(drawn: readonly string[], outcome: string): number {
    return drawn.filter((each) => each === outcome).length;
}

/** How coarse the soil samples are: one number, so the bound below cannot drift from it. */
const SOIL_FREQUENCY = 0.4;

describe('an estate that has never heard of this game, and no configuration at all', () => {
    it('hands out streams named after the estate\'s own concerns', () => {
        const estate = new Random(9001);

        const weather = estate.stream('weather');
        const soil = estate.stream('soil');

        // Two names the service has never seen are two independent sequences,
        // and asking twice for one of them returns the same stream (RND-19).
        expect(weather).not.toBe(soil);
        expect(estate.stream('weather')).toBe(weather);
    });

    it('draws uniform values, whole numbers and decisions', () => {
        const stream = new Random(9002).stream('weather');

        const rows = new Set<number>();
        let frosts = 0;
        for (let day = 0; day < 400; day += 1) {
            const uniform = stream.next();
            expect(uniform).toBeGreaterThanOrEqual(0);
            expect(uniform).toBeLessThan(1);

            // The rows of the plot are numbered from 14: a range that starts
            // nowhere in particular is exactly what the service must not have
            // an opinion about.
            rows.add(stream.int(14, 27));
            if (stream.bool(0.15)) {
                frosts += 1;
            }
        }

        for (const row of rows) {
            expect(row).toBeGreaterThanOrEqual(14);
            expect(row).toBeLessThan(27);
        }
        expect(rows.size).toBe(13);

        // Around 60 frosty mornings in 400, because the estate said 0.15 — a
        // band wide enough to be about the probability rather than about this
        // seed, and narrow enough that a `bool` ignoring its argument fails it.
        expect(frosts).toBeGreaterThan(30);
        expect(frosts).toBeLessThan(90);
    });

    it('picks and shuffles the estate\'s own list, leaving it alone', () => {
        const stream = new Random(9003).stream('harvest');
        const asWritten = [...VARIETIES];

        const picked = stream.pick(VARIETIES);
        const rounds = [stream.shuffle(VARIETIES), stream.shuffle(VARIETIES)];

        expect(VARIETIES).toContain(picked);
        for (const order of rounds) {
            expect([...order].sort()).toEqual([...VARIETIES].sort());
        }
        // A shuffle that returned the list untouched would satisfy everything
        // above, so one of the two rounds has to have moved something.
        expect(rounds.some((order) => order.join() !== VARIETIES.join())).toBe(true);
        expect(VARIETIES).toEqual(asWritten);
    });

    it('rolls dice for how many crates are opened', () => {
        const stream = new Random(9004).stream('cellar');

        for (let sample = 0; sample < 200; sample += 1) {
            const crates = stream.diceRoll(6, 3);
            expect(crates).toBeGreaterThanOrEqual(3);
            expect(crates).toBeLessThanOrEqual(18);
        }
    });

    it('draws from a table of ripeness it was handed, in the proportions given', () => {
        const stream = new Random(9005).stream('rows');

        const drawn: string[] = [];
        for (let look = 0; look < 4000; look += 1) {
            drawn.push(stream.weighted(RIPENESS));
        }

        expect(new Set(drawn)).toEqual(new Set(['green', 'turning', 'ripe']));
        expect(timesDrawn(drawn, 'green')).toBeGreaterThan(timesDrawn(drawn, 'turning'));
        expect(timesDrawn(drawn, 'turning')).toBeGreaterThan(timesDrawn(drawn, 'ripe'));
    });

    it('draws rainfall in millimetres, around a mean it was told', () => {
        const stream = new Random(9006).stream('weather');

        let total = 0;
        const samples = 4000;
        for (let day = 0; day < samples; day += 1) {
            // Rain does not fall upwards: the low bound is the caller's, and
            // the service clamps to it rather than inventing one.
            const millimetres = stream.gaussian(42, 9, [0, 200]);
            expect(millimetres).toBeGreaterThanOrEqual(0);
            expect(millimetres).toBeLessThanOrEqual(200);
            total += millimetres;
        }

        expect(total / samples).toBeGreaterThan(41);
        expect(total / samples).toBeLessThan(43);
    });

    it('samples soil moisture over the plot, gradually and repeatably', () => {
        const soil = new Random(9007).stream('soil');
        const step = 0.05;

        let previous = soil.noise2(0, 0, { frequency: SOIL_FREQUENCY });
        for (let along = 1; along < 300; along += 1) {
            const here = soil.noise2(along * step, 3.25, { frequency: SOIL_FREQUENCY });
            expect(here).toBeGreaterThanOrEqual(-1);
            expect(here).toBeLessThanOrEqual(1);
            if (along > 1) {
                expect(Math.abs(here - previous)).toBeLessThanOrEqual(
                    NOISE_MAX_SLOPE * SOIL_FREQUENCY * step,
                );
            }
            previous = here;
        }

        // The same corner of the plot, asked for again out of order, is the
        // same corner: a patch of the estate can be regenerated on its own.
        expect(soil.noise2(2.5, 3.25, { frequency: SOIL_FREQUENCY })).toBe(
            soil.noise2(2.5, 3.25, { frequency: SOIL_FREQUENCY }),
        );
    });

    it('sums octaves for the coarse and fine grain of the same plot', () => {
        const soil = new Random(9008).stream('soil');

        const detailed = soil.fbm2(1.5, -0.25, 4, {
            frequency: 0.3,
            lacunarity: 2.5,
            persistence: 0.4,
        });

        expect(detailed).toBeGreaterThanOrEqual(-1);
        expect(detailed).toBeLessThanOrEqual(1);
        // Sampling consumes nothing, so the next draw is the first draw.
        expect(soil.next()).toBe(new Random(9008).stream('soil').next());
    });

    it('samples with no options at all, on defaults that are shape and not balance', () => {
        // The one place the service does hold numbers of its own: the octave
        // defaults. They are named here so that they are *stated* rather than
        // hidden — an estate that passes nothing gets one octave scale, each
        // octave twice as fast and half as loud, and any other number would
        // make this fail rather than quietly change every map drawn from it.
        const soil = new Random(9009).stream('soil');

        expect(soil.noise2(1.5, -0.25)).toBe(soil.noise2(1.5, -0.25, { frequency: 1 }));
        expect(soil.fbm2(1.5, -0.25, 4)).toBe(
            soil.fbm2(1.5, -0.25, 4, { frequency: 1, lacunarity: 2, persistence: 0.5 }),
        );
    });

    it('filters on a made-up channel, and without configuration does not filter', () => {
        const filtered = new Random(9009).stream('cellar');
        const weighted = new Random(9009).stream('cellar');

        for (let taste = 0; taste < 500; taste += 1) {
            expect(filtered.filtered('tasting:barrel-7', TASTING_NOTES)).toBe(
                weighted.weighted(TASTING_NOTES),
            );
        }
    });

    it('still names the channel, so that an unfiltered one is visible', () => {
        const estate = new Random(9010);
        estate.stream('cellar').filtered('tasting:barrel-7', TASTING_NOTES);

        expect(estate.channels()).toEqual([
            { channel: 'tasting:barrel-7', profile: UNFILTERED_PROFILE },
        ]);
    });

    it('saves and restores an estate, with no configuration on either side', () => {
        const estate = new Random(9011);
        const stream = estate.stream('weather');
        for (let day = 0; day < 50; day += 1) {
            stream.gaussian(42, 9);
        }

        const saved = JSON.parse(JSON.stringify(estate.serialize()));
        const expected = [stream.gaussian(42, 9), stream.gaussian(42, 9)];

        const reloaded = Random.deserialize(saved);
        const after = reloaded.stream('weather');

        expect([after.gaussian(42, 9), after.gaussian(42, 9)]).toEqual(expected);
    });
});

describe('an estate with profiles it invented for itself', () => {
    it('resolves a made-up channel to a made-up profile, by prefix', () => {
        const estate = new Random(9012, ESTATE_CONFIG);
        const stream = estate.stream('cellar');

        stream.filtered('tasting:barrel-7', TASTING_NOTES);
        stream.filtered('pruning:row-14', TASTING_NOTES);

        expect(estate.channels()).toEqual([
            { channel: 'pruning:row-14', profile: 'brisk' },
            { channel: 'tasting:barrel-7', profile: 'patient' },
        ]);
    });

    it('collapses repeats on the channel it was told to be patient about', () => {
        const filtered = new Random(9013, ESTATE_CONFIG).stream('cellar');
        const unfiltered = new Random(9013).stream('cellar');

        const withMemory = drawFiltered(filtered, 'tasting:barrel-7', 4000);
        const without = drawFiltered(unfiltered, 'tasting:barrel-7', 4000);

        expect(repetitions(withMemory)).toBeLessThan(repetitions(without) / 2);
    });

    it('keeps only as many channels as the estate\'s own cap allows', () => {
        const estate = new Random(9014, ESTATE_CONFIG);
        const stream = estate.stream('cellar');

        for (let barrel = 0; barrel < 10; barrel += 1) {
            stream.filtered(`tasting:barrel-${barrel}`, TASTING_NOTES);
        }

        // Four, because this estate said four. The service has no number of
        // its own to fall back on (ARC-3.2).
        expect(estate.channels()).toHaveLength(ESTATE_CONFIG.channelCap);
    });

    it('forgets a barrel that has been emptied', () => {
        const estate = new Random(9015, ESTATE_CONFIG);
        estate.stream('cellar').filtered('tasting:barrel-7', TASTING_NOTES);

        estate.forget('tasting:barrel-7');

        expect(estate.channels()).toEqual([]);
    });

    it('carries the estate\'s tasting memory across a save', () => {
        const estate = new Random(9016, ESTATE_CONFIG);
        const stream = estate.stream('cellar');
        drawFiltered(stream, 'tasting:barrel-7', 40);

        const saved = JSON.parse(JSON.stringify(estate.serialize()));
        const expected = drawFiltered(stream, 'tasting:barrel-7', 20);

        const reloaded = Random.deserialize(saved, ESTATE_CONFIG);
        const after = drawFiltered(reloaded.stream('cellar'), 'tasting:barrel-7', 20);

        expect(after).toEqual(expected);
    });
});

/**
 * ARC-3.2's other half: the service holds no balancing value of its own.
 *
 * `isolation.spec.ts` reads the source for names from this game; these read the
 * behaviour for numbers. A hidden reduction, a floor of the service's own
 * choosing or a cap it fell back on would all be invisible to a source scan and
 * are all visible here — because every one of them would survive a change to
 * the data, and none of them does.
 */
describe('no balancing value of its own', () => {
    /**
     * A configuration of one profile, under which every channel is governed by
     * the numbers passed in and by nothing else. Written out rather than spread
     * from `ESTATE_CONFIG`, so that what governs a draw here is all in view.
     */
    function everythingUnder(profile: FilterProfile): FilterConfig {
        return {
            channelCap: 4,
            default: 'estate',
            profiles: { estate: profile },
            rules: [],
        };
    }

    it('behaves differently when the estate tunes its profile differently', () => {
        const insistent = new Random(
            9017,
            everythingUnder({ reduction: 0.1, recovery: 8 }),
        ).stream('cellar');
        const forgiving = new Random(
            9017,
            everythingUnder({ reduction: 0.9, recovery: 1 }),
        ).stream('cellar');

        const pushedHard = drawFiltered(insistent, 'tasting:barrel-7', 4000);
        const pushedGently = drawFiltered(forgiving, 'tasting:barrel-7', 4000);

        expect(repetitions(pushedHard)).toBeLessThan(repetitions(pushedGently));
    });

    it('does nothing at all when the estate asks for no reduction', () => {
        // A reduction of 1 multiplies every weight by 1 for ever. If the
        // service held any anti-repetition of its own — a floor, a nudge, a
        // default it fell back on — this sequence would diverge from the
        // unfiltered one, and it does not.
        const filtered = new Random(
            9018,
            everythingUnder({ reduction: 1, recovery: 1 }),
        ).stream('cellar');
        const weighted = new Random(9018).stream('cellar');

        for (let taste = 0; taste < 1000; taste += 1) {
            expect(filtered.filtered('tasting:barrel-7', TASTING_NOTES)).toBe(
                weighted.weighted(TASTING_NOTES),
            );
        }
    });

    it('takes the weights from the caller, including a weight of zero', () => {
        // "Never comes up" is the estate's statement about its own fruit, and
        // the filter does not overrule it however the memory moves.
        const stream = new Random(9019, ESTATE_CONFIG).stream('cellar');
        const table: WeightedEntry<string>[] = [
            { value: 'almond', weight: 3 },
            { value: 'brett', weight: 0 },
        ];

        const drawn: string[] = [];
        for (let taste = 0; taste < 500; taste += 1) {
            drawn.push(stream.filtered('tasting:barrel-7', table));
        }

        expect(new Set(drawn)).toEqual(new Set(['almond']));
    });
});

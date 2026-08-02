import { describe, expect, it } from 'vitest';
import golden from './filter-golden.json';
import { Random, UNFILTERED_PROFILE } from './index';
import type { FilterConfig, RandomStream, WeightedEntry } from './index';

/**
 * The filtered draw, observed through a constructed service — the same seam as
 * every other spec here.
 *
 * What is deliberately **not** asserted anywhere below: that the long-run
 * distribution stays within tolerance of the nominal weights. The filter shifts
 * it by construction, and a tolerance wide enough to let that pass would test
 * nothing (ADR 0002). In its place: monotonicity, the collapse of consecutive
 * repetitions, and a golden vector.
 */

const CONFIG: FilterConfig = {
    channelCap: 64,
    default: 'neutral',
    profiles: {
        neutral: { reduction: 0.6, recovery: 2 },
        lockpick: { reduction: 0.25, recovery: 5 },
    },
    rules: [{ channel: 'lockpick:*', profile: 'lockpick' }],
};

const TABLE: WeightedEntry<string>[] = [
    { value: 'common', weight: 6 },
    { value: 'uncommon', weight: 3 },
    { value: 'rare', weight: 1 },
];

function filteredStream(seed: number, config?: FilterConfig): RandomStream {
    return new Random(seed, config).stream('loot');
}

/** The outcomes of `count` filtered draws on one channel. */
function drawFiltered(stream: RandomStream, channel: string, count: number): string[] {
    const drawn: string[] = [];
    for (let draw = 0; draw < count; draw += 1) {
        drawn.push(stream.filtered(channel, TABLE));
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

/** How many times each outcome came up. */
function tally(drawn: readonly string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const outcome of drawn) {
        counts[outcome] = (counts[outcome] ?? 0) + 1;
    }
    return counts;
}

describe('without configuration', () => {
    it('draws exactly as the unfiltered weighted draw does', () => {
        const filtered = filteredStream(200);
        const weighted = filteredStream(200);

        const fromFilter = drawFiltered(filtered, 'loot:goblin', 1000);
        const fromWeighted: string[] = [];
        for (let draw = 0; draw < 1000; draw += 1) {
            fromWeighted.push(weighted.weighted(TABLE));
        }

        expect(fromFilter).toEqual(fromWeighted);
    });

    it('still lists the channel, so that an unfiltered channel is visible', () => {
        const service = new Random(201);
        service.stream('loot').filtered('loot:goblin', TABLE);

        expect(service.channels()).toEqual([
            { channel: 'loot:goblin', profile: UNFILTERED_PROFILE },
        ]);
    });

    it('keeps no weights to save', () => {
        const service = new Random(202);
        service.stream('loot').filtered('loot:goblin', TABLE);

        expect(service.serialize().channels).toEqual([]);
    });

    it('works with channels and outcomes foreign to this game (ARC-3.4)', () => {
        // Nothing about the service knows what a goblin is. The reusability
        // proof of ticket 11 does this properly; this is the local corner of
        // it, on the one path that could plausibly have grown an opinion.
        const harbour = [
            { value: 'calm', weight: 5 },
            { value: 'swell', weight: 3 },
            { value: 'squall', weight: 2 },
        ];
        const service = new Random(203);
        const stream = service.stream('tides');

        for (let draw = 0; draw < 100; draw += 1) {
            expect(['calm', 'swell', 'squall']).toContain(
                stream.filtered('tides:harbour:north', harbour),
            );
        }

        expect(service.channels()).toEqual([
            { channel: 'tides:harbour:north', profile: UNFILTERED_PROFILE },
        ]);
    });
});

describe('the filtered draw', () => {
    it('returns one of the outcomes offered', () => {
        const stream = filteredStream(203, CONFIG);

        for (const outcome of drawFiltered(stream, 'loot:goblin', 200)) {
            expect(['common', 'uncommon', 'rare']).toContain(outcome);
        }
    });

    it('consumes exactly one value of the sequence', () => {
        const stream = filteredStream(204, CONFIG);
        stream.filtered('loot:goblin', TABLE);
        const afterFiltered = stream.next();

        const reference = filteredStream(204, CONFIG);
        reference.next();

        expect(afterFiltered).toBe(reference.next());
    });

    it('draws from the nominal weights the first time a channel is used', () => {
        const filtered = filteredStream(205, CONFIG);
        const weighted = filteredStream(205, CONFIG);

        expect(filtered.filtered('loot:goblin', TABLE)).toBe(weighted.weighted(TABLE));
    });

    it('refuses a table it cannot draw from, exactly as the weighted draw does', () => {
        const stream = filteredStream(206, CONFIG);

        expect(() => stream.filtered('loot:goblin', [])).toThrow(/empty/);
        expect(() => stream.filtered('loot:goblin', [{ value: 'x', weight: 0 }])).toThrow(/weight/);
    });

    it('leaves the sequence alone when it refuses a table', () => {
        const stream = filteredStream(207, CONFIG);

        expect(() => stream.filtered('loot:goblin', [])).toThrow();

        expect(stream.next()).toBe(filteredStream(207, CONFIG).next());
    });
});

describe('weight readjustment', () => {
    it('reduces the outcome that has just come up', () => {
        const service = new Random(208, CONFIG);
        const drawn = service.stream('loot').filtered('loot:goblin', TABLE);

        const [channel] = service.serialize().channels;
        const reduced = TABLE.findIndex((entry) => entry.value === drawn);

        expect(channel.multipliers[reduced]).toBeCloseTo(0.6, 10);
        for (let index = 0; index < TABLE.length; index += 1) {
            if (index !== reduced) {
                expect(channel.multipliers[index]).toBe(1);
            }
        }
    });

    it('recovers a reduced outcome over the profile\'s number of draws', () => {
        // reduction 0.6 loses 0.4 of the weight; recovery 2 gives it back over
        // two draws, so 0.2 a draw.
        const service = new Random(209, CONFIG);
        const stream = service.stream('loot');

        const first = stream.filtered('loot:goblin', TABLE);
        const reduced = TABLE.findIndex((entry) => entry.value === first);

        let previous = 0.6;
        for (let draw = 0; draw < 2; draw += 1) {
            let next = stream.filtered('loot:goblin', TABLE);
            while (next === first) {
                // Only a draw that does *not* pick it lets it recover; keep
                // going until one lands elsewhere.
                previous = previous * 0.6;
                next = stream.filtered('loot:goblin', TABLE);
            }
            previous = Math.min(1, previous + 0.2);
            const [channel] = service.serialize().channels;
            expect(channel.multipliers[reduced]).toBeCloseTo(previous, 10);
        }
    });

    it('never recovers past the nominal weight', () => {
        const service = new Random(210, CONFIG);
        const stream = service.stream('loot');

        for (let draw = 0; draw < 500; draw += 1) {
            stream.filtered('loot:goblin', TABLE);
        }

        const [channel] = service.serialize().channels;
        for (const multiplier of channel.multipliers) {
            expect(multiplier).toBeLessThanOrEqual(1);
            expect(multiplier).toBeGreaterThan(0);
        }
    });

    it('collapses consecutive repetitions compared with the weighted draw', () => {
        const rounds = 10_000;

        const filtered = filteredStream(211, CONFIG);
        const filteredRepeats = repetitions(drawFiltered(filtered, 'loot:goblin', rounds));

        const weighted = filteredStream(211, CONFIG);
        const unfiltered: string[] = [];
        for (let draw = 0; draw < rounds; draw += 1) {
            unfiltered.push(weighted.weighted(TABLE));
        }

        expect(filteredRepeats).toBeLessThan(repetitions(unfiltered) * 0.75);
    });

    it('keeps a run of repeats possible, rather than forbidding it', () => {
        // ADR 0002: readjustment must not become the rule "never twice in a
        // row", which a player learns and exploits. Repeats get rarer, not
        // impossible.
        const stream = filteredStream(212, CONFIG);

        expect(repetitions(drawFiltered(stream, 'loot:goblin', 10_000))).toBeGreaterThan(0);
    });

    it('keeps the order of the weights: a heavier outcome is not drawn less often', () => {
        const stream = filteredStream(213, CONFIG);
        const counts = tally(drawFiltered(stream, 'loot:goblin', 10_000));

        expect(counts.common).toBeGreaterThanOrEqual(counts.uncommon);
        expect(counts.uncommon).toBeGreaterThanOrEqual(counts.rare);
    });

    it('keeps one memory per channel', () => {
        const service = new Random(214, CONFIG);
        const stream = service.stream('loot');

        drawFiltered(stream, 'loot:goblin', 20);
        stream.filtered('loot:troll', TABLE);

        const channels = service.serialize().channels;
        expect(channels.map((channel) => channel.channel)).toEqual([
            'loot:goblin',
            'loot:troll',
        ]);
        expect(channels[1].multipliers.filter((value) => value === 1)).toHaveLength(2);
    });

    it('shares a channel between streams: the key is the caller\'s, not the stream\'s', () => {
        const service = new Random(215, CONFIG);

        service.stream('loot').filtered('shared', TABLE);
        service.stream('combat').filtered('shared', TABLE);

        expect(service.serialize().channels).toHaveLength(1);
    });

    it('starts over when the table it is given has a different number of outcomes', () => {
        const service = new Random(216, CONFIG);
        const stream = service.stream('loot');

        drawFiltered(stream, 'loot:goblin', 20);
        stream.filtered('loot:goblin', [
            { value: 'only', weight: 1 },
            { value: 'other', weight: 1 },
        ]);

        const [channel] = service.serialize().channels;
        expect(channel.multipliers).toHaveLength(2);
    });
});

describe('profiles', () => {
    it('resolves a channel to a profile by prefix', () => {
        const service = new Random(217, CONFIG);
        const stream = service.stream('loot');

        stream.filtered('lockpick:door:42', TABLE);
        stream.filtered('loot:goblin', TABLE);

        expect(service.channels()).toEqual([
            { channel: 'lockpick:door:42', profile: 'lockpick' },
            { channel: 'loot:goblin', profile: 'neutral' },
        ]);
    });

    it('prefers the longest prefix when several rules match', () => {
        const service = new Random(218, {
            channelCap: 64,
            default: 'neutral',
            profiles: {
                neutral: { reduction: 0.6, recovery: 2 },
                lockpick: { reduction: 0.25, recovery: 5 },
                doors: { reduction: 0.1, recovery: 9 },
            },
            rules: [
                { channel: 'lockpick:*', profile: 'lockpick' },
                { channel: 'lockpick:door:*', profile: 'doors' },
            ],
        });
        const stream = service.stream('loot');

        stream.filtered('lockpick:door:42', TABLE);
        stream.filtered('lockpick:chest:7', TABLE);

        expect(service.channels()).toEqual([
            { channel: 'lockpick:chest:7', profile: 'lockpick' },
            { channel: 'lockpick:door:42', profile: 'doors' },
        ]);
    });

    it('matches a rule without a star as the whole name', () => {
        const service = new Random(219, {
            channelCap: 64,
            default: 'neutral',
            profiles: {
                neutral: { reduction: 0.6, recovery: 2 },
                exact: { reduction: 0.25, recovery: 5 },
            },
            rules: [{ channel: 'lockpick', profile: 'exact' }],
        });
        const stream = service.stream('loot');

        stream.filtered('lockpick', TABLE);
        stream.filtered('lockpick:door', TABLE);

        expect(service.channels()).toEqual([
            { channel: 'lockpick', profile: 'exact' },
            { channel: 'lockpick:door', profile: 'neutral' },
        ]);
    });

    it('resolves once and keeps the answer for the life of the channel', () => {
        const service = new Random(220, CONFIG);
        const stream = service.stream('loot');

        const profiles = new Set<string>();
        for (let draw = 0; draw < 100; draw += 1) {
            stream.filtered('lockpick:door:42', TABLE);
            profiles.add(service.channels()[0].profile);
        }

        expect([...profiles]).toEqual(['lockpick']);
    });

    it('applies the profile it resolved, not the default', () => {
        const service = new Random(221, CONFIG);
        const stream = service.stream('loot');

        const drawn = stream.filtered('lockpick:door:42', TABLE);
        const reduced = TABLE.findIndex((entry) => entry.value === drawn);

        // The lockpick profile reduces to 0.25, the default to 0.6.
        expect(service.serialize().channels[0].multipliers[reduced]).toBeCloseTo(0.25, 10);
    });
});

describe('the configuration', () => {
    it('insists on a default profile that exists', () => {
        expect(() => new Random(222, { channelCap: 64, default: 'missing', profiles: {} })).toThrow(
            /default/,
        );
        expect(
            () =>
                new Random(223, {
                    channelCap: 64,
                    default: 'neutral',
                    profiles: { other: { reduction: 0.5, recovery: 2 } },
                }),
        ).toThrow(/default/);
    });

    it('insists that every rule names a profile that exists', () => {
        expect(
            () =>
                new Random(224, {
                    channelCap: 64,
                    default: 'neutral',
                    profiles: { neutral: { reduction: 0.5, recovery: 2 } },
                    rules: [{ channel: 'lockpick:*', profile: 'absent' }],
                }),
        ).toThrow(/absent/);
    });

    it('refuses parameters that would stop an outcome coming up at all', () => {
        const withProfile = (reduction: number, recovery: number): FilterConfig => ({
            channelCap: 64,
            default: 'neutral',
            profiles: { neutral: { reduction, recovery } },
        });

        expect(() => new Random(225, withProfile(0, 2))).toThrow(/reduction/);
        expect(() => new Random(226, withProfile(1.5, 2))).toThrow(/reduction/);
        expect(() => new Random(227, withProfile(Number.NaN, 2))).toThrow(/reduction/);
        expect(() => new Random(228, withProfile(0.5, 0))).toThrow(/recovery/);
        expect(() => new Random(229, withProfile(0.5, Number.NaN))).toThrow(/recovery/);
    });

    it('keeps the name of the unfiltered profile for itself', () => {
        expect(
            () =>
                new Random(230, {
                    channelCap: 64,
                    default: UNFILTERED_PROFILE,
                    profiles: { [UNFILTERED_PROFILE]: { reduction: 0.5, recovery: 2 } },
                }),
        ).toThrow(new RegExp(UNFILTERED_PROFILE));
    });
});

describe('the golden distribution', () => {
    /**
     * The vector is stored in the repo, versioned, and carries everything
     * needed to reproduce it — seed, configuration, table, draw count — so that
     * a diff on the numbers is readable next to the parameters that produced
     * them.
     *
     * What it is for: the filter shifts the distribution away from the nominal
     * weights by construction (ADR 0002), so there is no correct distribution
     * to compare against. There is, however, the one measured here — and any
     * unintended change to the reduction, the recovery, the resolution rules or
     * the order in which a draw touches the stream moves it.
     */
    for (const [channel, expected] of Object.entries(golden.channels)) {
        it(`is unchanged on '${channel}'`, () => {
            const stream = new Random(golden.seed, golden.config).stream(golden.stream);

            const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0 };
            for (let draw = 0; draw < golden.draws; draw += 1) {
                counts[stream.filtered(channel, golden.table)] += 1;
            }

            expect(counts).toEqual(expected);
        });
    }

    it('is a shifted distribution, which is what makes it worth pinning', () => {
        // Not a tolerance against the nominal weights — that is the assertion
        // ADR 0002 rules out. It checks the opposite: that the filter moved the
        // distribution at all, so a golden vector that quietly became the
        // unfiltered one would not pass as unchanged.
        const shifted = golden.channels['loot:goblin'];

        expect(shifted.rare).toBeGreaterThan(golden.nominal.rare * 1.2);
        expect(shifted.common).toBeLessThan(golden.nominal.common * 0.9);
    });
});

describe('saving and restoring', () => {
    it('carries the anti-repetition memory across a reload', () => {
        const service = new Random(231, CONFIG);
        drawFiltered(service.stream('loot'), 'loot:goblin', 37);

        const state = service.serialize();
        const expected = drawFiltered(service.stream('loot'), 'loot:goblin', 100);
        const restored = Random.deserialize(state, CONFIG);

        expect(drawFiltered(restored.stream('loot'), 'loot:goblin', 100)).toEqual(expected);
    });

    it('does not let a reload reset the memory', () => {
        const service = new Random(232, CONFIG);
        drawFiltered(service.stream('loot'), 'loot:goblin', 37);
        const restored = Random.deserialize(service.serialize(), CONFIG);

        const forgetful = new Random(232, CONFIG);
        drawFiltered(forgetful.stream('loot'), 'loot:goblin', 37);
        const fresh = Random.deserialize(
            { ...forgetful.serialize(), channels: [] },
            CONFIG,
        );

        expect(drawFiltered(restored.stream('loot'), 'loot:goblin', 50)).not.toEqual(
            drawFiltered(fresh.stream('loot'), 'loot:goblin', 50),
        );
    });

    it('writes the channels ordered by name, whatever order they were used in', () => {
        const service = new Random(233, CONFIG);
        const stream = service.stream('loot');
        stream.filtered('zebra', TABLE);
        stream.filtered('aardvark', TABLE);

        expect(service.serialize().channels.map((channel) => channel.channel)).toEqual([
            'aardvark',
            'zebra',
        ]);
    });

    it('survives a trip through JSON', () => {
        const service = new Random(234, CONFIG);
        drawFiltered(service.stream('loot'), 'loot:goblin', 20);

        const state = service.serialize();
        const restored = Random.deserialize(JSON.parse(JSON.stringify(state)), CONFIG);

        expect(restored.serialize()).toEqual(state);
    });

    it('resolves the profile again on restore, rather than trusting the save', () => {
        const service = new Random(235, CONFIG);
        service.stream('loot').filtered('lockpick:door:42', TABLE);

        const restored = Random.deserialize(service.serialize(), CONFIG);

        expect(restored.channels()).toEqual([
            { channel: 'lockpick:door:42', profile: 'lockpick' },
        ]);
        expect(JSON.stringify(service.serialize())).not.toMatch(/lockpick"/);
    });

    it('loses the weights when it is reloaded without a configuration', () => {
        // Deliberate, and pinned here so it stays a decision: with no profiles
        // there is nothing to apply the weights with and nothing to move them
        // by. The channel's name survives for the diagnostic; its memory does
        // not, exactly as if the filter had been removed from the game.
        const service = new Random(237, CONFIG);
        drawFiltered(service.stream('loot'), 'loot:goblin', 20);

        const unconfigured = Random.deserialize(service.serialize());

        expect(unconfigured.channels()).toEqual([
            { channel: 'loot:goblin', profile: UNFILTERED_PROFILE },
        ]);
        expect(unconfigured.serialize().channels).toEqual([]);
    });

    it('refuses a saved channel it cannot use', () => {
        const service = new Random(236, CONFIG);
        service.stream('loot').filtered('loot:goblin', TABLE);
        const state = service.serialize();

        expect(() =>
            Random.deserialize(
                { ...state, channels: [{ channel: '', multipliers: [1], lastUsed: 1 }] },
                CONFIG,
            ),
        ).toThrow(/channel/);
        expect(() =>
            Random.deserialize(
                { ...state, channels: [{ channel: 'a', multipliers: [2], lastUsed: 1 }] },
                CONFIG,
            ),
        ).toThrow(/multiplier/);
        expect(() =>
            Random.deserialize(
                { ...state, channels: [{ channel: 'a', multipliers: [1], lastUsed: -1 }] },
                CONFIG,
            ),
        ).toThrow(/last used/);
        expect(() =>
            Random.deserialize(
                {
                    ...state,
                    channels: [
                        { channel: 'a', multipliers: [1], lastUsed: 1 },
                        { channel: 'a', multipliers: [1], lastUsed: 2 },
                    ],
                },
                CONFIG,
            ),
        ).toThrow(/twice/);
    });
});

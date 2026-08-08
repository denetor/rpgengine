import { describe, expect, it } from 'vitest';
import { createClock, restoreClock } from './index';
import type { Clock, DayPhaseChanged, TimeConfig, TimeEvent } from './index';

/**
 * The reusability proof (ARC-3.4, ARC-8.3).
 *
 * `TIME` is declared **generic**, and that is a promise which degrades in
 * silence: one balancing constant, one phase name that means something only to
 * this game's dawn and dusk, one default that only makes sense next to this
 * game's rules, and the service is domain-specific before anybody notices.
 * This file is the test that would notice.
 *
 * Everything below belongs to **a bakery's night shift**: doughs set to prove,
 * each with its own deadline; an oven timer that repeats every few minutes; and
 * the night divided into named stretches — *mixing*, *proving*, *baking*,
 * *service* — that begin at fixed times and are **not of equal length**. That
 * last property is the reason for the domain: unequal, non-periodic phases are
 * exactly what a repeating timer cannot express, so rediscovering the calendar
 * in somebody else's vocabulary is the only convincing way to show it is not a
 * fact about this game's dawn and dusk. A baker also does the two things this
 * service was hardest to design for: waits (a batch advanced by hours at once,
 * because nothing happens until it does) and cancels (the loaf pulled early).
 * `RND` picked an estate growing grapes and `BUS` a signal box on a branch
 * line, for how plainly they are not this project; the same instinct applies
 * here.
 *
 * The only imports are the service's own door and vitest; there is no helper,
 * no fixture and no builder borrowed from the specs beside it, because a proof
 * that the clock can be lifted into another project must not lean on the
 * project it is being lifted out of.
 *
 * The criterion, stated so that a later edit cannot quietly fail it: **if
 * making this file pass ever requires changing the service, the service was
 * not generic**.
 *
 * ## Verification: the service was broken twice
 *
 * A proof that passes on the first run is exactly what a vacuous file would
 * also report, so it was checked by breaking the service twice and confirming
 * this file noticed — and noticed *only* what was broken.
 *
 * 1. **Anchoring a repetition to the advance's target instant instead of to its
 *    own deadline.** In `clock.ts`, the re-arm line inside `advance()` was
 *    changed from `arm({ ...timer, at: timer.at + timer.every })` to
 *    `arm({ ...timer, at: until + timer.every })`. A repeater re-armed at
 *    `until + everyMs` no longer satisfies `<= until` within the same call, so
 *    a single long wait fires it once instead of the right number of times.
 *    Result: `npx vitest run src/engine/core/time/reusability.spec.ts` failed
 *    exactly one test — "the oven comes due the right number of times inside
 *    one long wait, anchored to its own period" (expected `6` oven-readies,
 *    got `1`) — and passed every other test in the file, including the ones
 *    covering doughs, cancellation, the shift's phases and the save door.
 * 2. **Making the phase lookup assume equal-length stretches.** In
 *    `calendar.ts`, `phaseAtMinute` was replaced with
 *    `calendar.phases[Math.min(calendar.phases.length - 1,
 *    Math.floor(minute / (MINUTES_PER_DAY / calendar.phases.length)))].name`
 *    instead of "the last phase whose start is at or before this minute."
 *    Result: with the shift's unequal phase lengths this reports the wrong
 *    phase at the wrong instants, and exactly two tests failed — "reports the
 *    shift correctly at a known instant" (worldTime's `phase` came back
 *    `'mixing'` where `'proving'` was expected, since a day sliced into four
 *    equal quarters puts 03:00 in the first quarter rather than in the second
 *    stretch the shift actually declares) and "crosses the four stretches once
 *    each, in order, with the doughs that fall between them" (only `'mixing'`
 *    was ever reported crossed — `proving`, `baking` and `service` never
 *    differed from it under the equal-length assumption, so the boundaries
 *    that would have told them apart were never crossed at all). Every other
 *    test in the file, including the oven's repetition count, passed
 *    unchanged.
 *
 * Both changes were reverted after confirming the isolated failure.
 */

/** A batch of dough came due for its prove. */
type DoughProved = { readonly type: 'bakery/dough-proved'; readonly batch: string };

/** The oven has come up to temperature again. */
type OvenReady = { readonly type: 'bakery/oven-ready' };

/** The whole of the night shift's vocabulary — nothing from this game anywhere in it. */
type BakeryEvent = DoughProved | OvenReady;

function doughProved(batch: string): DoughProved {
    return { type: 'bakery/dough-proved', batch };
}

const OVEN_READY: OvenReady = { type: 'bakery/oven-ready' };

/**
 * The night's own calendar, invented from scratch: a day length of the
 * shift's choosing, and four stretches that begin at fixed times and are
 * deliberately **not** of equal length — mixing runs 3 hours, proving 11,
 * baking 6, service 4. A calendar that assumed equal stretches would get every
 * one of them wrong.
 */
const NIGHT_SHIFT: TimeConfig = {
    dayLengthMs: 1_440_000,
    startsAt: { day: 1, hour: 22, minute: 0 },
    phases: [
        { name: 'mixing', hour: 0, minute: 0 },
        { name: 'proving', hour: 3, minute: 0 },
        { name: 'baking', hour: 14, minute: 0 },
        { name: 'service', hour: 20, minute: 0 },
    ],
};

const MINUTE = 1_000;
const HOUR = 60 * MINUTE;

/** A clock for the night shift — the fixture the ticket permits, built here. */
function bakery(config?: TimeConfig): Clock<BakeryEvent> {
    return createClock<BakeryEvent>(config);
}

function isPhaseChanged(event: BakeryEvent | TimeEvent): event is DayPhaseChanged {
    return event.type === 'time/day-phase-changed';
}

/** Where in the batch a named phase began, or `-1` if it never did. */
function phaseIndex(batch: readonly (BakeryEvent | TimeEvent)[], phase: string): number {
    return batch.findIndex((event) => isPhaseChanged(event) && event.phase === phase);
}

/** Where in the batch a named batch of dough came due, or `-1` if it never did. */
function doughIndex(batch: readonly (BakeryEvent | TimeEvent)[], loaf: string): number {
    return batch.findIndex((event) => event.type === 'bakery/dough-proved' && event.batch === loaf);
}

describe('doughs set to prove, in an oven that has never heard of this game', () => {
    it('come due in the order their deadlines fall, breaking a tie by registration order', () => {
        const shift = bakery();

        shift.schedule(300, doughProved('sourdough'));
        shift.schedule(100, doughProved('rye'));
        shift.schedule(100, doughProved('spelt'));

        // Rye and spelt share a deadline; rye was registered first.
        expect(shift.advance(300)).toEqual([
            doughProved('rye'),
            doughProved('spelt'),
            doughProved('sourdough'),
        ]);
    });

    it('the oven comes due the right number of times inside one long wait, anchored to its own period', () => {
        const shift = bakery();
        shift.scheduleRepeating(200, OVEN_READY);

        // One wait standing in for four hours, rather than the sixty small
        // steps that would hide an implementation anchored to `now`.
        const batch = shift.advance(1_200);

        expect(batch.filter((event) => event.type === 'bakery/oven-ready')).toHaveLength(6);

        // Anchored to the deadline it just came due at: the next ready is at
        // 1 400, not pushed out by however long the batch above took to read.
        expect(shift.advance(200)).toEqual([OVEN_READY]);
    });

    it('cancelling the oven stops the bakes for good', () => {
        const shift = bakery();
        const oven = shift.scheduleRepeating(200, OVEN_READY);

        shift.advance(400);
        expect(shift.cancel(oven)).toBe(true);

        expect(shift.advance(2_000)).toEqual([]);
    });

    it('pulling a loaf that has already come due changes nothing else pending', () => {
        const shift = bakery();
        const rye = shift.schedule(100, doughProved('rye'));
        shift.schedule(200, doughProved('spelt'));

        expect(shift.advance(100)).toEqual([doughProved('rye')]);

        // Already due: the report is `false`, and nothing about spelt moves.
        expect(shift.cancel(rye)).toBe(false);
        expect(shift.advance(100)).toEqual([doughProved('spelt')]);
    });
});

describe('the shift, on its own invented calendar', () => {
    it('reports the shift correctly at a known instant', () => {
        const shift = bakery(NIGHT_SHIFT);

        // 22:00 plus five hours is 03:00 the next day, exactly where proving
        // begins.
        shift.advance(5 * HOUR);

        expect(shift.worldTime()).toEqual({ day: 2, hour: 3, minute: 0, phase: 'proving' });
    });

    it('crosses the four stretches once each, in order, with the doughs that fall between them', () => {
        const shift = bakery(NIGHT_SHIFT);

        // Three loaves, each due squarely inside one of the stretches the
        // advance below crosses.
        shift.schedule(3 * HOUR, doughProved('inside mixing'));
        shift.schedule(10 * HOUR, doughProved('inside proving'));
        shift.schedule(20 * HOUR, doughProved('inside baking'));

        // 22:00 to the next day's 21:00: mixing begins two hours in, proving
        // five, baking sixteen, service twenty-two — the whole shift, once
        // round, without doubling back onto service.
        const batch = shift.advance(23 * HOUR);

        const phases = batch.filter(isPhaseChanged).map((event) => event.phase);
        expect(phases).toEqual(['mixing', 'proving', 'baking', 'service']);

        // "Between them": each loaf sits after the stretch it was proving in
        // began, and before the next one did — not merely present somewhere
        // in the batch.
        expect(doughIndex(batch, 'inside mixing')).toBeGreaterThan(phaseIndex(batch, 'mixing'));
        expect(doughIndex(batch, 'inside mixing')).toBeLessThan(phaseIndex(batch, 'proving'));

        expect(doughIndex(batch, 'inside proving')).toBeGreaterThan(phaseIndex(batch, 'proving'));
        expect(doughIndex(batch, 'inside proving')).toBeLessThan(phaseIndex(batch, 'baking'));

        expect(doughIndex(batch, 'inside baking')).toBeGreaterThan(phaseIndex(batch, 'baking'));
        expect(doughIndex(batch, 'inside baking')).toBeLessThan(phaseIndex(batch, 'service'));
    });
});

describe('a shift saved and picked up again', () => {
    it('a dough resumes with the exact remainder', () => {
        const shift = bakery(NIGHT_SHIFT);
        shift.schedule(8_000, doughProved('sourdough'));
        shift.advance(3_000);

        const resumed = restoreClock<BakeryEvent>(shift.serialize(), NIGHT_SHIFT);

        expect(resumed.advance(4_999)).toEqual([]);
        expect(resumed.advance(1)).toEqual([doughProved('sourdough')]);
    });

    it('continues the identical sequence an uninterrupted shift would have produced', () => {
        const uninterrupted = bakery(NIGHT_SHIFT);
        uninterrupted.schedule(5_000, doughProved('sourdough'));
        uninterrupted.schedule(9_000, doughProved('rye'));
        uninterrupted.advance(2_000);

        const resumed = restoreClock<BakeryEvent>(uninterrupted.serialize(), NIGHT_SHIFT);

        expect(resumed.advance(10_000)).toEqual(uninterrupted.advance(10_000));
    });
});

describe('two ovens in one process', () => {
    it('do not observe each other', () => {
        const riverside = bakery();
        const highStreet = bakery();

        riverside.schedule(100, doughProved('sourdough'));
        highStreet.schedule(100, doughProved('rye'));

        expect(riverside.advance(100)).toEqual([doughProved('sourdough')]);
        expect(highStreet.advance(100)).toEqual([doughProved('rye')]);

        // Ids drawn from one oven's counter mean nothing to the other's.
        const idAtRiverside = riverside.schedule(50, doughProved('spelt'));
        expect(highStreet.cancel(idAtRiverside)).toBe(false);

        expect(riverside.now()).toBe(100);
        expect(highStreet.now()).toBe(100);
    });
});

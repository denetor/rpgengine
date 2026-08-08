/**
 * The calendar: game time projected onto day, hour, minute and phase, and the
 * boundaries an interval of game time crosses (TIME-10).
 *
 * Everything here is a **pure function** of the instants involved and the
 * configuration — `worldTime()` of one instant, the transitions of the two
 * endpoints of an advance — and that is the requirement rather than a
 * preference. Nothing about world time is remembered and nothing is serialized,
 * so there is no "last hour announced" to fall out of step with the calendar it
 * was computed from, and a save carries none of it.
 *
 * A day is **24 hours of 60 minutes, fixed**. World time is a human-readable
 * projection of `dayLengthMs`, not a physics: `dayLengthMs` alone already makes
 * a day as long or as short as a game wants, and a second knob for the number of
 * hours in it would buy a calendar nobody has asked for at the price of every
 * consumer having to ask how long an hour is.
 */

import type { DayPhase, GameTimeMs, TimeConfig, TimeEvent, WorldTime } from './types';

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;

/**
 * The calendar a clock nobody configured runs on: a day of 24 real hours,
 * starting at midnight of day zero, with a single phase named `day`.
 *
 * The day length is the identity — one game millisecond is one millisecond —
 * because it is the only choice that is not an opinion about somebody's game.
 * The **single phase** is the point of the fallback (TIME-11): a clock nobody
 * configured has no day/night cycle, so `time/day-phase-changed` never fires.
 * Four phases named dawn, day, dusk and night would be this game's content
 * sitting in `engine/` as a default value, and a reusing game would inherit
 * them.
 */
export const DEFAULT_TIME_CONFIG: TimeConfig = {
    dayLengthMs: 24 * 60 * 60 * 1000,
    startsAt: { day: 0, hour: 0, minute: 0 },
    phases: [{ name: 'day', hour: 0, minute: 0 }],
};

/** One phase, with the minute of the day it begins at worked out once. */
interface ResolvedPhase {
    readonly name: DayPhase;
    readonly startMinute: number;
}

/**
 * A configuration with the arithmetic that never changes done once, at
 * construction.
 *
 * `startOffsetMs` is where `startsAt` sits inside its day, in milliseconds, so
 * that every instant below is `startOffsetMs + gameTime` and the game's zero
 * needs no special case anywhere else.
 */
export interface Calendar {
    readonly dayLengthMs: number;
    readonly startDay: number;
    readonly startOffsetMs: number;
    readonly phases: readonly ResolvedPhase[];
}

/** The minute of the day an `{ hour, minute }` names. */
function minuteOfDay(at: { readonly hour: number; readonly minute: number }): number {
    return at.hour * MINUTES_PER_HOUR + at.minute;
}

/**
 * The first millisecond of a day at which a given minute of that day is
 * reported.
 *
 * Rounded **up**, because the minute begins when the clock would first say so:
 * `minutesInto` below rounds down, and the two together make
 * `minutesInto(msOfMinute(m)) === m` — which is what lets a boundary instant
 * computed here be handed to `worldTimeAt` and come back agreeing with itself.
 *
 * That identity holds for a day of at least 1 440 ms, one per minute, and the
 * configuration check is where it is guaranteed: `dayLengthMs` below that is
 * refused before a calendar is built from it.
 */
function msOfMinute(minute: number, dayLengthMs: number): number {
    return dividedRoundingUp(minute * dayLengthMs, MINUTES_PER_DAY);
}

/**
 * `numerator / denominator` rounded up, for whole and non-negative numbers.
 *
 * Written with `Math.floor` rather than with `Math.ceil` because ADR 0001 lets
 * the deterministic path use `+ - * /`, `Math.floor`, `Math.sqrt` and
 * `Math.imul`, and that list is deliberately short: it is a list of the
 * operations somebody has checked, not of the operations that happen to be
 * exact. Adding to it is a decision, and this file does not need one.
 */
function dividedRoundingUp(numerator: number, denominator: number): number {
    return Math.floor((numerator + denominator - 1) / denominator);
}

/** The configuration with its arithmetic resolved; the fallback when there is none. */
export function resolveCalendar(config: TimeConfig = DEFAULT_TIME_CONFIG): Calendar {
    return {
        dayLengthMs: config.dayLengthMs,
        startDay: config.startsAt.day,
        startOffsetMs: msOfMinute(minuteOfDay(config.startsAt), config.dayLengthMs),
        phases: config.phases.map((phase) => ({
            name: phase.name,
            startMinute: minuteOfDay(phase),
        })),
    };
}

/**
 * Minutes elapsed on the calendar at `instant`, counted from midnight of the
 * day the game began on.
 *
 * The single conversion from milliseconds to calendar minutes, rounded **down**:
 * a minute is the minute that has begun, not the one that is nearest. Every
 * question below — which hour, which day, which phase — is asked of this number
 * and of nothing else, so none of them can disagree with another.
 */
function minutesInto(calendar: Calendar, instant: GameTimeMs): number {
    const onTheCalendar = calendar.startOffsetMs + instant;

    return Math.floor((onTheCalendar * MINUTES_PER_DAY) / calendar.dayLengthMs);
}

/** The phase covering a minute of the day: the last one that has begun. */
function phaseAtMinute(calendar: Calendar, minute: number): DayPhase {
    let current = calendar.phases[0];

    for (const phase of calendar.phases) {
        if (phase.startMinute <= minute) {
            current = phase;
        }
    }

    return current.name;
}

/** Day, hour, minute and phase at one instant. A pure function (TIME-10). */
export function worldTimeAt(calendar: Calendar, instant: GameTimeMs): WorldTime {
    const minutes = minutesInto(calendar, instant);
    const withinTheDay = minutes % MINUTES_PER_DAY;

    return {
        day: calendar.startDay + Math.floor(minutes / MINUTES_PER_DAY),
        hour: Math.floor(withinTheDay / MINUTES_PER_HOUR),
        minute: withinTheDay % MINUTES_PER_HOUR,
        phase: phaseAtMinute(calendar, withinTheDay),
    };
}

/**
 * A world-time event with the instant it happens at, so that the clock can
 * merge it into the batch of timers that came due in the same interval.
 *
 * `order` breaks a tie between two of them at the **same instant**, coarsest
 * first: at midnight the day changes, then the hour, then the phase. It reads
 * the way the world does — the largest unit turning over is what a person
 * notices first — and the phase comes last because it is a function of the hour
 * and the minute the two before it have just announced.
 */
export interface Transition {
    readonly at: GameTimeMs;
    readonly order: number;
    readonly event: TimeEvent;
}

const DAY_FIRST = 0;
const THEN_THE_HOUR = 1;
const THEN_THE_PHASE = 2;

/** The instant a given minute of the calendar begins at, in game time. */
function instantOfMinute(calendar: Calendar, minute: number): GameTimeMs {
    return msOfMinute(minute, calendar.dayLengthMs) - calendar.startOffsetMs;
}

/**
 * Every boundary the interval `(from, to]` crosses, ordered by `(instant,
 * order)`.
 *
 * Half-open at the start and closed at the end, which is the interval an
 * advance covers: a boundary is crossed by the advance that *reaches* it, once,
 * and by no other. That is what makes ten advances of an hour return what one
 * advance of ten hours returns.
 *
 * A pure function of the two endpoints and the calendar (TIME-10). It walks
 * only the boundaries inside the interval — no scan of anything per advance —
 * and an advance that crosses nothing allocates one empty list.
 */
export function transitionsBetween(
    calendar: Calendar,
    from: GameTimeMs,
    to: GameTimeMs,
): readonly Transition[] {
    if (to <= from) {
        return [];
    }

    const crossed: Transition[] = [
        ...daysBetween(calendar, from, to),
        ...hoursBetween(calendar, from, to),
        ...phasesBetween(calendar, from, to),
    ];

    // Total on `(at, order)`: two boundaries of the same kind cannot share an
    // instant — two phases beginning at the same minute is what the
    // configuration check refuses — so the comparison never has to fall back on
    // the order the three lists were built in.
    crossed.sort((one, other) => {
        if (one.at !== other.at) {
            return one.at - other.at;
        }

        return one.order - other.order;
    });

    return crossed;
}

/** Every midnight in the interval. */
function daysBetween(calendar: Calendar, from: GameTimeMs, to: GameTimeMs): readonly Transition[] {
    const crossed: Transition[] = [];
    const first = dayIndexAt(calendar, from) + 1;
    const last = dayIndexAt(calendar, to);

    for (let day = first; day <= last; day += 1) {
        const at = instantOfMinute(calendar, day * MINUTES_PER_DAY);

        crossed.push({
            at,
            order: DAY_FIRST,
            // Read off the clock at that instant rather than counted here:
            // whatever the event says, `worldTime()` says the same thing to
            // anyone who asks it at the same instant.
            event: { type: 'time/day-changed', day: worldTimeAt(calendar, at).day },
        });
    }

    return crossed;
}

/** Every hour in the interval, midnights included — midnight is an hour too. */
function hoursBetween(calendar: Calendar, from: GameTimeMs, to: GameTimeMs): readonly Transition[] {
    const crossed: Transition[] = [];
    const first = hourIndexAt(calendar, from) + 1;
    const last = hourIndexAt(calendar, to);

    for (let hour = first; hour <= last; hour += 1) {
        const at = instantOfMinute(calendar, hour * MINUTES_PER_HOUR);
        const world = worldTimeAt(calendar, at);

        crossed.push({
            at,
            order: THEN_THE_HOUR,
            event: { type: 'time/hour-changed', day: world.day, hour: world.hour },
        });
    }

    return crossed;
}

/**
 * Every phase boundary in the interval that is a **change of phase**.
 *
 * The candidates are the starts of every configured phase on every day the
 * interval touches, which is a handful of instants however large the advance;
 * each is kept only if the phase before it differs from the phase at it. That
 * comparison is what makes the single-phase fallback silent: a calendar with
 * one phase has boundaries at every midnight and no change at any of them
 * (TIME-11).
 */
function phasesBetween(
    calendar: Calendar,
    from: GameTimeMs,
    to: GameTimeMs,
): readonly Transition[] {
    const crossed: Transition[] = [];
    const firstDay = dayIndexAt(calendar, from);
    const lastDay = dayIndexAt(calendar, to);

    for (let day = firstDay; day <= lastDay; day += 1) {
        for (const phase of calendar.phases) {
            const at = instantOfMinute(calendar, day * MINUTES_PER_DAY + phase.startMinute);

            if (at <= from || at > to) {
                continue;
            }

            const world = worldTimeAt(calendar, at);

            // `at` is at least 1 here, since it is greater than `from` and no
            // advance starts before zero — so there is an instant before it to
            // compare against.
            if (world.phase === worldTimeAt(calendar, at - 1).phase) {
                continue;
            }

            crossed.push({
                at,
                order: THEN_THE_PHASE,
                event: { type: 'time/day-phase-changed', day: world.day, phase: world.phase },
            });
        }
    }

    return crossed;
}

/** Which day of the calendar an instant falls on, counted from the game's first. */
function dayIndexAt(calendar: Calendar, instant: GameTimeMs): number {
    return Math.floor(minutesInto(calendar, instant) / MINUTES_PER_DAY);
}

/** Which hour of the calendar an instant falls in, counted from the game's first. */
function hourIndexAt(calendar: Calendar, instant: GameTimeMs): number {
    return Math.floor(minutesInto(calendar, instant) / MINUTES_PER_HOUR);
}

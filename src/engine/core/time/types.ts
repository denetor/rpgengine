/**
 * The vocabulary of the clock: what an instant is, what a timer's payload is
 * allowed to be, and the surface a caller sees.
 *
 * Nothing here names an event of this game — or of any game. The union is a
 * type parameter supplied by whoever constructs the clock, exactly as the bus
 * takes one (TIME-7). The service could not name one even if it wanted to: it
 * lives under `engine/`, and rule 4 of the boundary check fails the build on
 * `engine/ → game/`.
 */

/**
 * Plain data, as the compiler understands it — the same type the bus declares
 * under the same name, and deliberately a **second declaration** of it.
 *
 * Rule 3 of the boundary check (`services-may-not-import-each-other`) has no
 * exception for types, and `tsPreCompilationDeps` is on, so even an `import
 * type` from the bus would fail the build (TIME-14). Structural typing makes
 * the two declarations the same type, which is what lets the game hand its one
 * union to both services; a shared module holding it would be the project's
 * first piece of global state.
 */
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | readonly JsonValue[]
    | { readonly [key: string]: JsonValue };

/**
 * A fact that has already happened, discriminated by `type` — a member of the
 * game's event union, and the payload a timer carries (TIME-6).
 *
 * This constraint is the whole of the serializability rule: a timer's payload
 * satisfies `JsonValue` by construction, so a callback, a renderer entity or a
 * keyed collection cannot be scheduled and the error lands at the `schedule()`
 * call site rather than in a save file.
 *
 * As with the bus, event types **must be declared as `type` aliases, never as
 * `interface`s**: only the former gets the implicit index signature this
 * constraint requires. The rule is asserted, with the reason, in
 * `types.spec.ts`.
 */
export type DomainEvent = { readonly type: string; readonly [key: string]: JsonValue };

/**
 * Game milliseconds since the game began — always whole, always absolute.
 *
 * Consumers **redeclare this locally** rather than import it (TIME-14): no
 * service receives the clock, so whoever needs the current time is handed a
 * `GameTimeMs` parameter by the orchestration, and rule 3 of the boundary check
 * would refuse the import.
 */
export type GameTimeMs = number;

/**
 * The name of a phase of the day, as the configuration spells it.
 *
 * A `string` and **not** an enum, because a generic engine cannot know that
 * this game has dawn, day, dusk and night (ARC-3.2, TIME-11). The phases are an
 * ordered table of names and start times in the configuration; adding a fifth
 * is a data edit, and a game with three or with one uses the same engine.
 */
export type DayPhase = string;

/**
 * Game time as a person reads it: the projection of `now()` onto the configured
 * calendar (TIME-10).
 *
 * A day is 24 hours of 60 minutes, fixed. Nothing here is stored — it is
 * computed from the instant and the calendar every time it is asked for — so
 * nothing here can drift out of agreement with the calendar it came from, and
 * none of it reaches a save.
 */
export interface WorldTime {
    /** Days since the game began, counted from the configured `startsAt.day`. */
    readonly day: number;

    /** 0…23. */
    readonly hour: number;

    /** 0…59. */
    readonly minute: number;

    /** The last phase whose start is at or before this instant. */
    readonly phase: DayPhase;
}

/**
 * The calendar, which is **configuration and not content** (TIME-11): how long
 * a day lasts in game milliseconds, when the game begins, and the phases of the
 * day.
 *
 * It is the service's own section, written under the key `time`, and the whole
 * of it is optional: a clock built with none runs on `DEFAULT_TIME_CONFIG`.
 */
export interface TimeConfig {
    /** Game milliseconds in one day. A positive whole number. */
    readonly dayLengthMs: number;

    /** The world time at game time zero. */
    readonly startsAt: {
        readonly day: number;
        readonly hour: number;
        readonly minute: number;
    };

    /**
     * The phases of the day, in order, the first beginning at 00:00.
     *
     * Data rather than an enum, and the reason is ARC-3.2: the engine may not
     * know what this game's phases are called.
     */
    readonly phases: readonly {
        readonly name: DayPhase;
        readonly hour: number;
        readonly minute: number;
    }[];
}

/**
 * The handle on a registered timer: an opaque branded `number`, drawn from a
 * monotonic counter (TIME-8).
 *
 * Branded so that a plain `number` is not assignable to it — an id is nothing a
 * caller may compute, only something the clock hands out. Drawn from a counter
 * because that counter *is* the registration order the batch is tied on
 * (TIME-4), so no second sequence exists anywhere.
 *
 * A caller-chosen `string` key is refused deliberately: two callers claiming
 * one key by accident is a collision the service cannot detect.
 */
export type TimerId = number & { readonly __brand: 'TimerId' };

/**
 * The three facts the world clock produces, and the only events this service
 * has (TIME-10).
 *
 * They are the first events the game's union receives **from a service**, and
 * they are shaped by BUS-14: the producing service is in the discriminant, so a
 * subscriber reading `'time/hour-changed'` knows where it came from without a
 * registry. `time/day-phase-changed` is deliberately not called
 * `phase-changed` — *phase* already means the delivery phase, in the bus and in
 * the glossary, and a game with two meanings for a word ends up with a
 * subscriber on the wrong one.
 *
 * Declared as `type` aliases and not `interface`s, like every event type in this
 * project: only the former gets the implicit index signature `DomainEvent`
 * requires.
 *
 * There is **no `time/minute-changed`** (TIME-11). The HUD clock calls
 * `worldTime()` while drawing — a read, which is lawful for the presentation —
 * and an event 1 440 times a day so that a label can update is a cost every
 * subscriber in the game pays, in the tick, for ever.
 *
 * Every one of them carries the **day it happened on**, because the day is what
 * tells two 08:00s apart: a routine that fires at the same hour every morning
 * and a quest counting elapsed days read the same event and ask it different
 * questions.
 */

/** An hour of the day began. One per hour crossed, however large the advance. */
export type HourChanged = {
    readonly type: 'time/hour-changed';
    readonly day: number;
    readonly hour: number;
};

/** Midnight passed. One per midnight crossed. */
export type DayChanged = {
    readonly type: 'time/day-changed';
    readonly day: number;
};

/**
 * A phase of the day began — dawn, dusk, whatever this game's calendar calls
 * them.
 *
 * Never emitted by a clock whose configuration declares a single phase, which
 * is what the fallback declares: there is no boundary between two phases to
 * cross, not even at midnight (TIME-11).
 */
export type DayPhaseChanged = {
    readonly type: 'time/day-phase-changed';
    readonly day: number;
    readonly phase: DayPhase;
};

/**
 * What the world clock can produce, for `game/` to fold into its union.
 *
 * The union is exported as one type as well as three, because folding it in is
 * one line at the point where the game's event union is assembled and a list of
 * three would go stale the day a fourth appears.
 */
export type TimeEvent = HourChanged | DayChanged | DayPhaseChanged;

/**
 * One saved timer: when it comes due, how often it repeats, and the fact it
 * carries.
 *
 * `at` is **absolute**, never a remainder. With `elapsedMs` beside it the
 * remainder is a subtraction — exact, and nothing is rounded on write — where a
 * saved remainder would have to be recomputed against the clock at every save.
 */
export interface TimerState<E extends DomainEvent> {
    readonly id: TimerId;
    readonly at: GameTimeMs;

    /** The period of a repeating timer; absent on a one-shot. */
    readonly every?: number;

    readonly event: E;
}

/**
 * `TIME`'s portion of a save.
 *
 * `nextId` is in it for a reason worth writing down: the ids break ties at
 * equal deadlines (TIME-4, TIME-8), so a counter restarting from zero would
 * give a timer created *after* a load a lower id than one still pending from
 * *before* it, and the same game saved and reloaded would come due in a
 * different order — at exactly the point where ARC-9.1's test is *save, reload,
 * compare*. It cannot be derived as `max(saved id) + 1` either: the ids
 * consumed by timers that have already fired are not in the list, so they would
 * be handed out a second time, and whoever kept one in order to cancel it would
 * cancel a stranger's timer.
 *
 * **World time is not here.** It is derivable from `elapsedMs` and the
 * calendar, and the calendar is configuration rather than state (CFG-15). The
 * consequence is stated rather than discovered: changing `dayLengthMs`
 * reinterprets existing saves, and the same game finds itself at a different
 * hour of the day.
 */
export interface TimeState<E extends DomainEvent> {
    readonly version: number;
    readonly elapsedMs: GameTimeMs;
    readonly nextId: number;

    /** Pending timers only, ordered by `(at, id)`. Cancelled ones are not written. */
    readonly timers: readonly TimerState<E>[];
}

/** The clock's whole surface (ARC-2.1). */
export interface Clock<E extends DomainEvent> {
    /** The current instant of game time. Reading it moves nothing. */
    now(): GameTimeMs;

    /**
     * The same instant as a person reads it: day, hour, minute and phase
     * (TIME-10).
     *
     * A pure function of `now()` and the calendar, which is why the
     * presentation may call it while drawing: a HUD clock updates every frame
     * off a read, and there is deliberately no `minute-changed` event to save
     * it the trouble — emitting one 1 440 times a day so a label can update is
     * a cost every subscriber in the game pays, in the tick, for ever.
     */
    worldTime(): WorldTime;

    /**
     * Advances game time by exactly this much and returns everything that came
     * due, ordered by `(deadline, id)` — that is, by deadline, and at an equal
     * deadline in registration order (TIME-4).
     *
     * Whole milliseconds only, and never negative: the fraction of a fractional
     * frame is carried by the driver, and an integer clock keeps "due at
     * exactly 6000" meaning what it says (TIME-3).
     *
     * It **publishes nothing** (ARC-4.2). The batch is computed before any
     * consumer runs, which is what makes the same total elapsed time return the
     * same events however it was subdivided — and what obliges a consumer to
     * tolerate a world that has already moved past the event it is holding
     * (TIME-5).
     *
     * The batch carries the caller's own events **and** the world-time
     * transitions the same interval crossed, merged in time order (TIME-10) —
     * which is why the element type is a union: a game whose union has folded
     * the three `time/*` types in, as it is meant to, sees the two collapse
     * back into its own union, and one that has not is told so at the point
     * where it hands the batch to the bus.
     */
    advance(gameDeltaMs: number): readonly (E | TimeEvent)[];

    /**
     * Registers `event` to come due `afterMs` from now, once, and returns the
     * handle that can cancel it.
     *
     * The event is handed back **unchanged** at the deadline: there is no
     * wrapper type and no second dispatcher beside the bus (TIME-6).
     */
    schedule(afterMs: number, event: E): TimerId;

    /**
     * Registers `event` to come due every `everyMs`, first at `now + everyMs`,
     * for as long as the clock lives or until it is cancelled.
     *
     * Repetition is anchored to the **deadline**: after coming due at `D` the
     * next deadline is `D + everyMs`, so a 100 ms repeater over a 6000 ms
     * advance comes due sixty times, at 100…6000, and not sixty times bunched
     * at the end (TIME-5).
     *
     * Not sugar for a handler that reschedules itself: that handler runs during
     * the flush, after the batch was computed, so a 6000 ms advance would yield
     * one repetition instead of sixty.
     */
    scheduleRepeating(everyMs: number, event: E): TimerId;

    /**
     * Cancels a timer, reporting whether it was still pending: `false` for one
     * that has already come due, for one already cancelled, and for an id this
     * clock never handed out.
     *
     * That report is what lets a caller tell *cancelled* from *already fired*
     * without keeping a second set of books beside the clock's.
     *
     * Cancelling is unobservable in every other way (TIME-9): a cancelled timer
     * never comes due, and cancelling one changes nothing about the order or
     * the deadlines of the others. Most cancellations turn out to be
     * unnecessary — an event that finds nothing to act on is a normal outcome —
     * and `cancel` earns its place on repeating timers, which would otherwise
     * stay in the queue for ever.
     */
    cancel(id: TimerId): boolean;

    /**
     * This clock's portion of a save: the elapsed time, the id counter and the
     * timers still pending, with absolute deadlines (TIME-13).
     *
     * A **snapshot** — advancing afterwards does not move it — and plain data
     * throughout, so it goes through a save file and back unchanged. What it
     * does not carry is world time, which is derivable, and the calendar, which
     * is configuration rather than state (CFG-15).
     */
    serialize(): TimeState<E>;
}

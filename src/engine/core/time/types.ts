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

/** The clock's whole surface (ARC-2.1). */
export interface Clock<E extends DomainEvent> {
    /** The current instant of game time. Reading it moves nothing. */
    now(): GameTimeMs;

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
     */
    advance(gameDeltaMs: number): readonly E[];

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
}

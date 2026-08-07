/**
 * The delivery contract: a queue, a cascade drained to quiescence, and two
 * phases (BUS-4, BUS-5, BUS-6).
 *
 * `publish` runs nothing. `flush` delivers everything queued to the **rules**,
 * including everything the rules publish while it is running, until the queue is
 * empty; then it hands that whole tick, once and in the same order, to the
 * **interface**. The order in which the game's rules run is therefore a property
 * of this file and not of anybody's call stack — which is the entire reason the
 * bus exists before any game does (ARC-9.1).
 *
 * What a handler that misbehaves is owed is decided by its phase and by nothing
 * else (BUS-9): a rule that threw takes the tick down with it, a panel that
 * threw is reported and the drawing carries on. There is no third answer for a
 * build under test — a branch on the build mode would make the tested game and
 * the shipped game two different games, and only one of them would be tested.
 */

import { CausalDepthError } from './errors';
import type { DomainEvent, EventBus, Phase } from './types';

/**
 * How many generations one flush may deliver before the bus calls it a cycle
 * (BUS-8).
 *
 * Events queued before the flush are generation 0; what a handler publishes
 * while generation *n* is being delivered forms generation *n+1*. The countable
 * thing is that depth and not iterations — a single queue drained until empty
 * has no iterations in it.
 *
 * Not a construction argument, not a `CFG` section, and not a parameter of any
 * kind (BUS-15). A legitimate deep cascade — an item picked up completes an
 * objective, which completes a quest, which grants a reward, which adds an item,
 * which fills a container — runs six or seven deep, so 32 is headroom and not a
 * budget. The only realistic use of a knob here would be somebody hitting the
 * error, raising the limit to 500 and shipping the cycle, which is why the
 * number is a constant with this paragraph beside it.
 */
const MAX_GENERATIONS = 32;

/** What every subscription is, once the compiler's narrowing has been spent. */
type Handler<E> = (event: E) => void;

/**
 * One subscription, in one phase.
 *
 * `type` is the event type it answers to, or `null` for an `onAny`. Keeping
 * both kinds in **one list per phase** is what makes BUS-7 a fact about the
 * list rather than a fact to be arranged: the typed handlers are in it in the
 * order they were subscribed in, and the `onAny`s are lifted out of it first.
 */
interface Subscription<E extends DomainEvent> {
    readonly type: string | null;
    readonly handler: Handler<E>;
}

/**
 * A bus for the event union `E`, reporting a failed **presentation** handler
 * through `onHandlerError`.
 *
 * It is required and has no default: a generic service that reaches for
 * `console` has a dependency it never declared, and one that defaults to
 * swallowing has decided on its caller's behalf that a panel going dark is not
 * worth mentioning (ARC-3.2, BUS-9). It is never called for a failed rule —
 * those propagate — so a caller reading its own sink knows that everything in it
 * is a screen and not a consequence.
 */
export function createEventBus<E extends DomainEvent>(
    onHandlerError: (error: unknown, event: E) => void,
): EventBus<E> {
    const subscriptions: Record<Phase, Subscription<E>[]> = {
        orchestration: [],
        presentation: [],
    };

    /**
     * Everything published and not yet delivered — the first of the allocations
     * BUS-17 declares.
     *
     * It buys the whole of BUS-4: a queue is what makes the delivery order the
     * order things happened in, rather than the order of the recursion that
     * happened to produce them.
     */
    let queue: E[] = [];

    /**
     * Whether a flush is running, which is the whole of BUS-10's last rule.
     *
     * A handler that calls `flush()` throws rather than quietly doing nothing:
     * the reentrant call is nearly unreachable — a handler that publishes is
     * already promised delivery by the flush it is standing in (BUS-5), so there
     * is nothing a second call could add — and that is precisely why silence
     * would be wrong. Whoever wrote the call believes they forced a delivery,
     * and a no-op leaves them debugging the handler that did not run instead of
     * the line that never ran anything.
     */
    let delivering = false;

    function subscribe(phase: Phase, type: string | null, handler: Handler<E>): () => void {
        const subscribed = subscriptions[phase];
        const subscription: Subscription<E> = { type, handler };
        subscribed.push(subscription);

        return () => {
            // By identity, and idempotent: unsubscribing twice, or after
            // `dispose()` has emptied the list, finds nothing and does nothing.
            const index = subscribed.indexOf(subscription);
            if (index >= 0) {
                subscribed.splice(index, 1);
            }
        };
    }

    /**
     * One event to the rules, with an exception left to propagate (BUS-9).
     *
     * A rule that threw is a rule that did not run, and what did not run is a
     * consequence the world is now missing: the quest that did not advance, the
     * loot that was not granted. Letting the player carry on in that world is
     * the failure the drain's own refusal chose to throw over, and this is the
     * same failure arriving by a different door.
     */
    function deliverToRules(event: E): void {
        for (const handler of handlersFor(subscriptions.orchestration, event.type)) {
            handler(event);
        }
    }

    /**
     * One event to the interface, with an exception caught, reported, and left
     * behind (BUS-9).
     *
     * By the time anything here runs the domain has finished moving and is
     * intact, so a handler that failed cost a panel and nothing else — and the
     * panels standing behind it are unrelated screens that would otherwise go
     * dark for somebody else's bug. The error goes to `onHandlerError` **with
     * the event that caused it**, which is the half a stack trace cannot supply:
     * the trace names the handler, the payload says why this run and not the
     * last one.
     *
     * The difference between this function and the one above is the whole of the
     * failure policy. It is a difference between two phases, not between two
     * builds: there is no mode in which a panel propagates or a rule is
     * swallowed, because a build that behaves differently is a build nobody
     * tested (ARC-9.1).
     */
    function deliverToInterface(event: E): void {
        for (const handler of handlersFor(subscriptions.presentation, event.type)) {
            try {
                handler(event);
            } catch (error) {
                // `unknown`, and passed on unwrapped: `throw 'a string'` is
                // legal, and a bus that assumed an `Error` here would fail in
                // the one place left to report anything.
                onHandlerError(error, event);
            }
        }
    }

    /**
     * The orchestration pass: the queue drained to quiescence, returned as the
     * tick it delivered.
     *
     * It leaves the queue **empty** whichever way it ends. On the way out
     * through the cascade that is BUS-12 and costs nothing — the drained queue
     * is the tick, and a fresh one takes its place. On the way out through an
     * exception it is a decision, and the same one either kind of failure gets:
     * the tick has failed and is over. Keeping its queue would have the next
     * flush redeliver events that already ran once, and would leave the bus
     * sitting outside a flush with something in it.
     */
    function drainToQuiescence(): readonly E[] {
        // One pass over the queue, with a cursor rather than by taking from the
        // front: an event published by a handler is appended to this same array
        // and is picked up by this same loop, which is the whole of BUS-5. The
        // loop ends when the cascade has nothing left to say.
        let cursor = 0;

        // The generation boundaries the rail counts. Generation 0 is everything
        // queued before the flush, and it ends where the queue ended when the
        // flush began; each later generation ends wherever the queue has grown
        // to by the time the previous one is spent. `generationsOpened` is a
        // count and not an index: it starts at one because generation 0 is
        // already open.
        let generationsOpened = 1;
        let generationEnd = queue.length;

        // The whole cost of the diagnostic while the flush is healthy: two
        // indices, rolled forward as each generation opens. Nothing is recorded
        // and nothing is allocated — the types in the message are read off the
        // queue itself, at the moment it trips, because every event delivered is
        // still in it.
        let startOfCurrent = 0;
        let startOfPrevious = 0;

        try {
            while (cursor < queue.length) {
                if (cursor === generationEnd) {
                    generationsOpened += 1;

                    if (generationsOpened > MAX_GENERATIONS) {
                        // Built here and not in the catch below, because it is
                        // read off the queue the catch is about to drop:
                        // `cursor` is where the generation that went too far
                        // begins, and the two indices are where the two before
                        // it began.
                        throw causalDepthError(queue, startOfPrevious, startOfCurrent, cursor);
                    }

                    startOfPrevious = startOfCurrent;
                    startOfCurrent = cursor;
                    generationEnd = queue.length;
                }

                const event = queue[cursor];
                cursor += 1;
                deliverToRules(event);
            }
        } catch (failure) {
            // Both ways out: the refusal above, and a rule that threw. A failed
            // tick is over, and its queue goes with it (BUS-12).
            queue = [];

            throw failure;
        }

        // The tick's accumulated stream — BUS-17's third allocation, which here
        // costs nothing: every event delivered is already in the queue, in
        // delivery order, so the drained queue *is* the stream. A fresh one
        // takes its place, which is what leaves the queue empty between ticks
        // (BUS-12) before the interface sees anything.
        const tick = queue;
        queue = [];

        return tick;
    }

    return {
        on(phase, type, handler) {
            // The registry holds the handlers of every type at once, so it
            // cannot keep the narrowing `on` promised its caller. The cast is
            // where that promise is honoured instead: a handler is looked up
            // **by the event's own type**, so it is only ever given an event
            // whose discriminant it was written against.
            return subscribe(phase, type, handler as Handler<E>);
        },

        onAny(phase, handler) {
            return subscribe(phase, null, handler);
        },

        publish(event) {
            queue.push(event);
        },

        publishAll(events) {
            for (const event of events) {
                queue.push(event);
            }
        },

        flush() {
            if (delivering) {
                // Named for what the caller already has rather than only for
                // what they may not do: the flush they are standing inside of
                // will deliver what they published before it ends (BUS-5), so
                // there is nothing this call could have added.
                throw new Error(
                    'the event bus is already delivering: a handler may not call flush(). ' +
                        'Publish and return — the flush already running delivers what you ' +
                        'published, in the same tick, before it hands anything to the interface.',
                );
            }

            delivering = true;

            try {
                const tick = drainToQuiescence();

                // Only now, with the world finished moving. A panel woken during
                // the drain would query the domain about a state that never
                // officially existed (BUS-6), and it would see the cascade one
                // level at a time instead of once.
                //
                // A presentation handler that published would land in the fresh
                // queue and be delivered by the *next* flush. Nothing here
                // refuses it: BUS-3 says the interface does not publish at all —
                // it deposits intents that the orchestration pulls at a fixed
                // point in the tick — so a handler that breaks that is a bug in
                // the game's wiring, not something the bus has an answer for.
                for (const event of tick) {
                    deliverToInterface(event);
                }
            } finally {
                // In a `finally`, because the flush that aborts is exactly the
                // flush after which somebody wants to try again: a flag left
                // standing would turn one failed tick into a bus that refuses
                // every flush for the rest of the run.
                delivering = false;
            }
        },

        dispose() {
            if (delivering) {
                // BUS-11 puts "outside a flush" on the caller, and the flag that
                // refuses a reentrant flush already knows the answer, so the
                // precondition is checked rather than merely written down. The
                // failure it replaces is the bad kind: `dispose()` swaps the
                // queue the drain is reading, so the cascade would stop
                // mid-sentence with every consequence after it silently
                // dropped, and the tick would look like it simply ended.
                throw new Error(
                    'the event bus is already delivering: dispose() must be called outside ' +
                        'a flush(). Let the flush finish and tear down between ticks — a ' +
                        'context that decides to close while a rule is running is still owed ' +
                        'the rest of that tick.',
                );
            }

            // Emptied in place, not replaced: an unsubscribe function handed out
            // earlier still holds this array, and must go on finding nothing in
            // it rather than removing from a list the bus no longer reads.
            subscriptions.orchestration.length = 0;
            subscriptions.presentation.length = 0;
            queue = [];
        },
    };
}

/**
 * The refusal, read off the queue that produced it.
 *
 * The three generations the message names are three stretches of the queue, and
 * this is the one place their arithmetic is written down: the generation that
 * went too far begins at `startOfNext` and runs to the end of everything queued,
 * and the two before it are bounded by the indices the drain rolled forward as
 * it went.
 *
 * A function rather than four lines inside the loop, because a reader following
 * the *delivery* has no business being handed the index arithmetic of a
 * diagnostic on the way past. It allocates, and that is free: it is called from
 * the failure path and from nowhere else, on a flush that is already over.
 */
function causalDepthError<E extends DomainEvent>(
    events: readonly E[],
    startOfPrevious: number,
    startOfCurrent: number,
    startOfNext: number,
): CausalDepthError {
    return new CausalDepthError(MAX_GENERATIONS, [
        typesBetween(events, startOfPrevious, startOfCurrent),
        typesBetween(events, startOfCurrent, startOfNext),
        typesBetween(events, startOfNext, events.length),
    ]);
}

/**
 * The event types in one stretch of the queue, each named once however many
 * events carried it, in the order they first appear.
 *
 * Once, because a generation is hundreds of events wide in a fan-out and three
 * types deep, and a message listing every event is a wall nobody reads to the
 * end of. In first-appearance order, because the alternative — sorting — would
 * make `[a] [b] [a]` depend on the alphabet rather than on what happened.
 *
 * Called only from the failure path, which is what makes the linear scan for a
 * duplicate the right shape here: it runs once, on a flush that is already over.
 */
function typesBetween<E extends DomainEvent>(
    events: readonly E[],
    from: number,
    to: number,
): readonly string[] {
    const types: string[] = [];

    for (let index = from; index < to; index += 1) {
        const type = events[index].type;
        if (!types.includes(type)) {
            types.push(type);
        }
    }

    return types;
}

/**
 * The handlers of one event, in the order BUS-7 fixes: every `onAny` of the
 * phase first, then the typed handlers in subscription order.
 *
 * The array it returns is the second allocation BUS-17 declares, and it is the
 * snapshot BUS-10 is made of: the set of handlers for an event is fixed when
 * delivery of **that event** begins, so a handler unsubscribed by an earlier
 * handler still receives the current event and stops from the next, and a
 * handler subscribed mid-delivery misses the current event and receives the
 * next. Reading the live list while iterating it would make *who received this
 * event* depend on what the handlers before it happened to do — which cannot be
 * reasoned about at a subscription site, and which ordinary play reaches: a
 * panel subscribes when it opens and unsubscribes when it closes, and it opens
 * and closes in reaction to events.
 *
 * This is an allocation per event on the hottest path in the game, and ARC-13.3
 * is a **MUST**. It stays: at the order of magnitude the service declares — some
 * 10³ events a second — it is the *unavoidable* kind that rule permits, because
 * it is the price of the guarantee above and there is no cheaper way to buy that
 * guarantee. It is also the one allocation here that may become copy-on-write —
 * snapshot only when the list changes during a delivery — if profiling ever
 * asks, **without changing a single observable rule**. Written down because
 * otherwise somebody profiling on day 200 removes a copy from a dispatch loop
 * and silently deletes the guarantee.
 */
function handlersFor<E extends DomainEvent>(
    subscribed: readonly Subscription<E>[],
    type: string,
): readonly Handler<E>[] {
    const snapshot: Handler<E>[] = [];

    for (const subscription of subscribed) {
        if (subscription.type === null) {
            snapshot.push(subscription.handler);
        }
    }

    for (const subscription of subscribed) {
        if (subscription.type === type) {
            snapshot.push(subscription.handler);
        }
    }

    return snapshot;
}

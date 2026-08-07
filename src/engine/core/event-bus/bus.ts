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
 */

import type { DomainEvent, EventBus, Phase } from './types';

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
 * A bus for the event union `E`, reporting a failed handler through
 * `onHandlerError`.
 *
 * `onHandlerError` is required and has no default, from the first line, though
 * nothing here calls it yet: until the failure policy exists an exception from a
 * handler simply propagates. It is taken now so that no call site changes shape
 * when it starts being called, and because a generic service that reaches for
 * `console` has a dependency it never declared (ARC-3.2, BUS-9).
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

    function deliver(phase: Phase, event: E): void {
        for (const handler of handlersFor(subscriptions[phase], event.type)) {
            handler(event);
        }
    }

    return {
        on(phase, type, handler) {
            // The registry holds the handlers of every type at once, so it
            // cannot keep the narrowing `on` promised its caller. The cast is
            // where that promise is honoured instead: `deliver` looks a handler
            // up **by the event's own type**, so a handler is only ever given an
            // event whose discriminant it was written against.
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
            // One pass over the queue, with a cursor rather than by taking from
            // the front: an event published by a handler is appended to this
            // same array and is picked up by this same loop, which is the whole
            // of BUS-5. The loop ends when the cascade has nothing left to say.
            let cursor = 0;
            while (cursor < queue.length) {
                const event = queue[cursor];
                cursor += 1;
                deliver('orchestration', event);
            }

            // The tick's accumulated stream — BUS-17's third allocation, which
            // here costs nothing: every event delivered is already in the queue,
            // in delivery order, so the drained queue *is* the stream. A fresh
            // one takes its place, which is what leaves the queue empty between
            // ticks (BUS-12) before the interface sees anything.
            const tick = queue;
            queue = [];

            // Only now, with the world finished moving. A panel woken during the
            // loop above would query the domain about a state that never
            // officially existed (BUS-6), and it would see the cascade one level
            // at a time instead of once.
            //
            // A presentation handler that published would land in the fresh
            // queue and be delivered by the *next* flush. Nothing here refuses
            // it: BUS-3 says the interface does not publish at all — it deposits
            // intents that the orchestration pulls at a fixed point in the tick
            // — so what a bus owes a handler that breaks that belongs with the
            // rest of the failure policy, not here.
            for (const event of tick) {
                deliver('presentation', event);
            }
        },

        dispose() {
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
 * The handlers of one event, in the order BUS-7 fixes: every `onAny` of the
 * phase first, then the typed handlers in subscription order.
 *
 * The array it returns is the second allocation BUS-17 declares, and it is the
 * snapshot BUS-10 is made of: the set of handlers for an event is fixed when
 * delivery of **that event** begins, so a handler unsubscribed by an earlier
 * handler still receives the current event and stops from the next. Reading the
 * live list while iterating it would make *who received this event* depend on
 * what the handlers before it happened to do — which cannot be reasoned about at
 * a subscription site.
 *
 * It is the allocation that may become copy-on-write if profiling ever asks,
 * **without changing a single observable rule**. It is written down because
 * otherwise somebody removes a copy from a dispatch loop on day 200 and silently
 * deletes the guarantee.
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

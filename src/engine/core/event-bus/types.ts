/**
 * The vocabulary of the bus: what an event is allowed to be, who it is
 * delivered to, and the surface a caller sees.
 *
 * Nothing here names an event of this game — or of any game. The union is a
 * type parameter supplied by whoever constructs the bus, assembled in `game/`
 * from the types each service exports on its own surface (BUS-14). The service
 * could not import one even if it wanted to: it lives under `engine/`, and rule
 * 4 of the boundary check fails the build on `engine/ → game/`.
 */

/**
 * Plain data, as the compiler understands it (BUS-2).
 *
 * This is the whole of the rule that a payload carries no references. It is a
 * *type* rather than a prohibition anyone can break: an entity of the renderer,
 * a keyed collection, a set, a clock reading and a function all carry methods,
 * and a method is not one of the alternatives below. A branded `number` goes
 * through, being a `number`, which is how an event refers to an entity
 * (ARC-5.2).
 *
 * The three reasons are in BUS-2 and none of them is persistence: nothing in
 * this system ever serializes an event. A payload holding a live reference
 * hands the domain a door into the presentation; one holding a keyed collection
 * makes an iteration order undefined (ARC-9.4); one holding service state lets
 * a handler mutate the domain through something the contract calls immutable.
 */
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | readonly JsonValue[]
    | { readonly [key: string]: JsonValue };

/**
 * A fact that has already happened, discriminated by `type` (BUS-1, BUS-3).
 *
 * Event types **must be declared as `type` aliases, never as `interface`s**.
 * Only the former gets the implicit index signature this constraint requires,
 * so an `interface` fails to satisfy it however impeccable its fields — and the
 * compiler's error explains none of that. The rule is asserted, with the
 * reason, in `types.spec.ts`.
 */
export type DomainEvent = { readonly type: string; readonly [key: string]: JsonValue };

/**
 * The two families of subscriber ARC-4.3 permits, and the two passes of a flush
 * (BUS-6).
 *
 * `orchestration` is the game's rules: they run inside a half-finished
 * transaction, which is their job, and what they publish joins the same
 * cascade. `presentation` is the interface: it runs once the world has stopped
 * moving, so that a panel asking `STAT` a question gets an answer about a state
 * that really existed.
 */
export type Phase = 'orchestration' | 'presentation';

/**
 * The bus's whole surface (ARC-2.1).
 *
 * `phase` is an explicit first argument at every subscription and has **no
 * default**: the two phases are exactly the two subscriber families, and a
 * default would be silently wrong half the time.
 */
export interface EventBus<E extends DomainEvent> {
    /**
     * Subscribes to one event type, in one phase. Returns the unsubscribe
     * function.
     *
     * The handler is given the member of the union that carries `type`, already
     * narrowed: a subscriber reads the payload's own fields with no cast at the
     * call site, and a type that is not in the union is a compile error (BUS-1).
     */
    on<T extends E['type']>(
        phase: Phase,
        type: T,
        handler: (event: Extract<E, { type: T }>) => void,
    ): () => void;

    /**
     * Subscribes to every event of the phase, delivered before the typed
     * handlers of each event (BUS-7).
     *
     * It exists for logging and for the development overlay, and it belongs to
     * a phase like any other subscription: a trace registered in the
     * presentation phase sees each event of the tick once, not once per pass
     * (BUS-13).
     */
    onAny(phase: Phase, handler: (event: E) => void): () => void;

    /** Queues an event for delivery. Runs no handler (BUS-4). */
    publish(event: E): void;

    /** Queues a whole batch, in the order given — the shape a command returns (ARC-4.2). */
    publishAll(events: readonly E[]): void;

    /** Drains the queue: the orchestration cascade to its end, then the presentation, once. */
    flush(): void;

    /** Drops every subscription and discards the queue. Called outside a flush (BUS-11). */
    dispose(): void;
}

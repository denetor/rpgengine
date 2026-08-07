/**
 * What a cascade that will not stop looks like on the way out (BUS-8).
 *
 * Two rules that publish each other compile perfectly and drain forever. The
 * only thing that separates that bug from a hung tab is this exception and what
 * it manages to say, so the message is written for somebody who is looking at a
 * frozen game and has no idea which two rules are talking to each other.
 *
 * `ConfigError` is the precedent, down to carrying the same information twice:
 * the `message` is enough on its own, from a stack trace and nothing else, and a
 * caller that wants to render it — the testbed overlay will — reads
 * `generations` as data instead of parsing prose.
 */

/**
 * How the generations are written into the message: `[a] [b] [a]`, oldest
 * first.
 *
 * Brackets rather than arrows because the contents of a bracket is a *set of
 * types delivered together*, not one event handing over to the next. A `→`
 * would claim a causality between two named types that the bus never observed.
 */
function describeGeneration(types: readonly string[]): string {
    return `[${types.join(', ')}]`;
}

/**
 * A cascade that exceeded the limit on causal depth, with the tail of it named.
 *
 * `generations` holds the event types present in each of the last three
 * generations, oldest first, each type once however many events carried it: a
 * ping-pong reads as `[a] [b] [a]`, which is the whole point of listing three
 * rather than one.
 */
export class CausalDepthError extends Error {
    /** The types of each of the last three generations, oldest first. */
    readonly generations: readonly (readonly string[])[];

    constructor(limit: number, generations: readonly (readonly string[])[]) {
        super(
            `a flush exceeded ${limit} generations of events: the last three carried ` +
                `${generations.map(describeGeneration).join(' ')}. ` +
                'A type appearing twice in that list is a cycle — two rules publishing each ' +
                'other, or one publishing its own event. The limit is fixed and there is no ' +
                'setting for it: raising it would ship the cycle.',
        );
        this.name = 'CausalDepthError';
        this.generations = generations;
    }
}

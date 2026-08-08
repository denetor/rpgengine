/**
 * The pending timers, as a binary heap keyed by `(deadline, id)`.
 *
 * A heap because TIME-12 asks for logarithmic insertion and expiry with no
 * linear scan per advance: hundreds of pending timers are the declared order of
 * magnitude, and an advance must touch only what came due.
 *
 * The key is the whole reason no second structure exists. Ordering by deadline
 * and, at an equal deadline, by the id — which is drawn from a monotonic
 * counter, and *is* therefore the registration order (TIME-8) — satisfies
 * TIME-4 exactly, so the batch comes out of the queue already in the order it
 * must be returned in. It is also what makes the layout below unobservable: the
 * order the queue comes due in is fully determined by that key, so ticket 03 can
 * write a save as a sorted list and rebuild it without reproducing any of this.
 *
 * The three functions **mutate the array they are given**, which is what buys
 * the logarithm: a version returning a new array would copy the whole queue on
 * every push. Nothing else in the service touches the array, and nothing outside
 * the service can see it.
 */

/** What the queue orders by. Anything with a deadline and an id will do. */
export interface Keyed {
    readonly at: number;
    readonly id: number;
}

/**
 * Whether `a` comes due before `b`: earlier deadline first, and at an equal
 * deadline the smaller id — the one registered first.
 *
 * A pure function of the two entries, and the single place the ordering rule of
 * TIME-4 is written down.
 */
function comesFirst(a: Keyed, b: Keyed): boolean {
    if (a.at !== b.at) {
        return a.at < b.at;
    }

    return a.id < b.id;
}

/** The next entry to come due. The caller checks that there is one. */
export function peek<T extends Keyed>(heap: readonly T[]): T {
    return heap[0];
}

/** Adds an entry, in logarithmic time. */
export function push<T extends Keyed>(heap: T[], entry: T): void {
    heap.push(entry);

    // Up from the last position, swapping with the parent for as long as the
    // entry comes due before it.
    let child = heap.length - 1;

    while (child > 0) {
        const parent = (child - 1) >> 1;

        if (!comesFirst(heap[child], heap[parent])) {
            break;
        }

        swap(heap, child, parent);
        child = parent;
    }
}

/** Removes and returns the next entry to come due, in logarithmic time. */
export function pop<T extends Keyed>(heap: T[]): T {
    const first = heap[0];
    const last = heap.pop() as T;

    if (heap.length > 0) {
        // The hole at the root is filled with the entry that was last, which is
        // then sunk to where it belongs.
        heap[0] = last;
        sink(heap, 0);
    }

    return first;
}

/** Moves the entry at `index` down until both its children come after it. */
function sink<T extends Keyed>(heap: T[], index: number): void {
    let parent = index;

    for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let first = parent;

        if (left < heap.length && comesFirst(heap[left], heap[first])) {
            first = left;
        }

        if (right < heap.length && comesFirst(heap[right], heap[first])) {
            first = right;
        }

        if (first === parent) {
            return;
        }

        swap(heap, parent, first);
        parent = first;
    }
}

function swap<T>(heap: T[], a: number, b: number): void {
    const held = heap[a];
    heap[a] = heap[b];
    heap[b] = held;
}

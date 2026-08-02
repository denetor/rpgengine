/**
 * The one comparison of names the service makes.
 *
 * Streams, saved channels and eviction victims are all ordered by name, and
 * they are ordered the same way for the same reason: the result must not depend
 * on where the game is being played. `localeCompare` would order the same two
 * names differently under different locales, so the same game saved on two
 * machines would produce different bytes, and two services that had seen the
 * same draws would evict different channels.
 *
 * Comparing with `<` is a comparison by UTF-16 code unit: fixed, specified, and
 * of no interest to a reader — which is exactly what is wanted of it.
 */
export function byName(one: string, other: string): number {
    if (one === other) {
        return 0;
    }
    return one < other ? -1 : 1;
}
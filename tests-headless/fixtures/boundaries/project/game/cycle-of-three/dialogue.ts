// The link that closes the ring: quest → inventory → dialogue → quest.

import { grant } from './inventory';

export function openDialogue(): string {
    return `you receive ${grant()}`;
}

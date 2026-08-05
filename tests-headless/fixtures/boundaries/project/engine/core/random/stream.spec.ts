// A spec sitting beside the code it tests, importing the internals directly —
// which is how every spec in `src/engine/core/random/` is written. Rule 2 has to
// let this through, or the project's own test suite would be the first thing it
// broke.
//
// It is never run: `vitest.config.ts` excludes the fixture tree.

import { describe, expect, it } from 'vitest';

import { drawFrom } from './stream';

describe('the stream', () => {
    it('answers with the number of sides it was given', () => {
        expect(drawFrom(6)).toBe(6);
    });
});

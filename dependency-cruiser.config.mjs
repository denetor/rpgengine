import { boundaryConfiguration } from './dependency-cruiser.boundaries.mjs';

/**
 * The project's boundary check, run by `npm run boundaries` — from the build,
 * so that ARC-14.3 is satisfied literally, and from the fast unit lane, so that
 * a developer finds out before the build does.
 *
 * The rules and why the check is a tool of its own live in
 * `dependency-cruiser.boundaries.mjs`, shared with
 * `dependency-cruiser.fixtures.config.mjs`. Only the root is decided here.
 *
 * `src` is the whole of the checked surface. The browser entry point sits
 * inside it and belongs to no layer, which is a declared hole: `src/main.ts`
 * matches no rule's `from`, and is kept to a call to the bootstrap and a call
 * to the boot so that reading it is the whole audit.
 */
export default boundaryConfiguration('src');

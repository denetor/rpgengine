import { boundaryConfiguration } from './dependency-cruiser.boundaries.mjs';

/**
 * Fixture configuration: a miniature project that crosses the frontiers on
 * purpose.
 *
 * It is never part of `npm run boundaries` — that command is pointed at `src`.
 * Only the meta test in `tests-headless/boundaries.spec.ts` starts it, in a
 * separate process, to check that the check really reports the crossing and
 * really says which one.
 *
 * The fixtures are a project rather than a handful of loose files because the
 * tool resolves real paths: a rule about `engine/` has nothing to bite on
 * unless there is an `engine/`. So they bring their own root, and are the real
 * configuration with that root substituted — which is also why they cannot
 * prove the project is inside the rules. That half is the zone assertions in
 * the same spec.
 */
export default boundaryConfiguration('tests-headless/fixtures/boundaries/project');

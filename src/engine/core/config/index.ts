/**
 * `CFG` — parameter composition and validation. Public surface (ARC-2.1):
 * nothing outside this file is visible to the rest of the project.
 *
 * One pure function that runs once during bootstrap and disappears (CFG-15). It
 * is handed the sections — one per service, each carrying its key, its fallback
 * and its own check — and the sources, already read and parsed by whoever has a
 * file system (CFG-14). It applies the declared precedence, overlays partial
 * sources one level deep, runs each service's check on the merged result, and
 * either returns every slice or throws with every problem it found (CFG-3).
 */
export { composeConfig } from './compose';
export { ConfigError, describeIssue } from './errors';
export type { Composed, ConfigIssue, ConfigSource, Problem, SectionShape } from './types';

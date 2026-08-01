/**
 * `RND` — the randomness service. Public surface (ARC-2.1): nothing outside
 * this file is visible to the rest of the project.
 */
export { Random } from './random';
export { RANDOM_STATE_VERSION } from './state';
export type { RandomState, RandomStreamState } from './state';
export type { RandomStream, StreamId, Truncation, WeightedEntry } from './types';

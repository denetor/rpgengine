/**
 * `RND` — the randomness service. Public surface (ARC-2.1): nothing outside
 * this file is visible to the rest of the project.
 */
export { UNFILTERED_PROFILE } from './filter';
export { NOISE_MAX_SLOPE } from './noise';
export { Random } from './random';
export { RANDOM_STATE_VERSION } from './state';
export type { RandomChannelState, RandomState, RandomStreamState } from './state';
export type {
    ChannelReport,
    FbmOptions,
    FilterConfig,
    FilterProfile,
    FilterRule,
    NoiseOptions,
    RandomStream,
    StreamId,
    Truncation,
    WeightedEntry,
} from './types';

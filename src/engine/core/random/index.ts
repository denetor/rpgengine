/**
 * `RND` — the randomness service. Public surface (ARC-2.1): nothing outside
 * this file is visible to the rest of the project.
 */
export { UNFILTERED_PROFILE } from './filter';
/**
 * The golden vectors are the one part of the test scaffolding that is exported
 * (RND-4). They are not a service primitive and no game code should call them:
 * they are here because the same measurement has to be taken by the headless
 * suite and by a page loaded into three browsers, and ARC-2.1 allows a service
 * exactly one door.
 */
export { GOLDEN_VECTORS, goldenMismatches, measureGolden } from './golden';
export type { GoldenFile, GoldenVectors } from './golden';
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

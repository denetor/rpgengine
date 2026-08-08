/**
 * `TIME` — the game clock and its scheduler. Public surface (ARC-2.1): nothing
 * outside this file is visible to the rest of the project.
 *
 * The service is the domain's single source of time, and it does not know what
 * real time is: it advances by exactly the amount it is given and returns what
 * came due, ordered. Who decides that amount — a frame, a combat turn, a
 * fast-forward — is the caller's business (TIME-2), and pause is that caller
 * choosing not to advance it at all.
 *
 * It publishes nothing (ARC-4.2): the batch `advance()` returns belongs to the
 * orchestration, which is its only caller and the only thing that publishes.
 */
export { createClock } from './clock';

/**
 * `JsonValue` and `DomainEvent` are exported because whoever constructs a clock
 * writes against them, exactly as they do for the bus. They are a **second
 * declaration** of the same two types and not a re-export: rule 3 of the
 * boundary check forbids one service to import another, types included
 * (TIME-14), and structural typing makes the two declarations interchangeable.
 */
export type {
    Clock,
    DayPhase,
    DomainEvent,
    GameTimeMs,
    JsonValue,
    TimeConfig,
    TimerId,
    TimerState,
    TimeState,
    WorldTime,
} from './types';

/**
 * The version of the state format, and the door back in.
 *
 * `TIME_STATE_VERSION` is on the surface because `SAVE` reads it to decide
 * whether it can migrate a state it has found (TIME-13). `restoreClock` is a
 * **factory** and deliberately not a method that reloads a live clock: a clock
 * that could be reloaded would briefly hold one game's elapsed time and
 * another's queue, and every `TimerId` handed out before it would point at a
 * stranger's timer (CTX-9).
 */
export { restoreClock } from './clock';
export { TIME_STATE_VERSION } from './state';

/**
 * The calendar a clock nobody configured runs on: a day of 24 real hours and a
 * single phase named `day`, so that an unconfigured clock has no day/night
 * cycle rather than somebody else's (TIME-11).
 */
export { DEFAULT_TIME_CONFIG } from './calendar';

/**
 * The expected shape of the calendar (TIME-11, ARC-7.2), with two doors onto
 * one check, as `RND` has.
 *
 * Whoever **composes** the parameters is handed `TIME_SECTION`, which carries
 * the key and the fallback with it, and stamps the source on itself, being the
 * only thing that saw the value arrive (CFG-3). The **constructor's** caller
 * gets `validateTimeConfig` and `assertTimeConfig`, which take a file name
 * because that caller may well know one, and which refuse rather than report.
 */
export {
    assertTimeConfig,
    describeIssue,
    TIME_SECTION,
    timeConfigProblems,
    TimeConfigError,
    validateTimeConfig,
} from './config';
export type { TimeConfigIssue, TimeConfigProblem } from './config';

/**
 * The three event types the world clock produces, for `game/` to fold into its
 * union — the first events that union receives from a service (TIME-10).
 *
 * They are on the public surface because that is the only way a game can name
 * them: a service declares its own event types and the game unions them
 * (BUS-14). `TimeEvent` is the three together, so folding them in stays one
 * line the day there is a fourth.
 */
export type { DayChanged, DayPhaseChanged, HourChanged, TimeEvent } from './types';

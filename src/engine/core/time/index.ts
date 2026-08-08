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
export type { Clock, DomainEvent, GameTimeMs, JsonValue, TimerId } from './types';

/**
 * `BUS` — the event bus. Public surface (ARC-2.1): nothing outside this file is
 * visible to the rest of the project.
 *
 * The bus is the system's only channel of *indirect* communication, and it takes
 * exactly one construction argument: where to report a handler that failed. It
 * has no configuration, no section and no modes — the only service in the
 * catalogue that declares none (BUS-15) — so it behaves identically in every
 * build, which is the right property for the one piece every other piece depends
 * on for its ordering.
 *
 * Who may hold one is decided elsewhere and needs no check here: a service that
 * took an `EventBus` parameter would have to import this file, and rule 3 of the
 * boundary check (`services-may-not-import-each-other`) already fails the build
 * on that, with no allowlist (BUS-16).
 */
export { createEventBus } from './bus';

/**
 * `JsonValue` and `DomainEvent` are exported because whoever assembles the
 * game's union writes against them: a service declares its own event types as
 * `type` aliases, `game/` unions them, and the constraint is what refuses a
 * payload carrying anything but plain data (BUS-2, BUS-14).
 */
export type { DomainEvent, EventBus, JsonValue, Phase } from './types';

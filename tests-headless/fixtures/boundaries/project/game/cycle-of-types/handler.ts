// Rule 6 closing a ring made only of types, which is caught — and is the one
// case where being caught is worth arguing about, so it is pinned here rather
// than left to be discovered.
//
// `tsPreCompilationDeps` is on (ticket 04), and story 29 of the spec asks for
// type-only imports to be "checked like any other": a frontier that could be
// crossed by importing a type across it would not be a frontier. The cost is
// this shape — two files whose interfaces name each other, routine in
// TypeScript, with nothing going round at runtime because the imports are
// erased. The rule's message says so outright, because the fix (a third module
// holding both types) is not obvious to whoever meets it at 6pm.

import type { Model } from './model';

export interface Handler {
    handle(model: Model): void;
}

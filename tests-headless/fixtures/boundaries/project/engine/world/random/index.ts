// A second service called `random`, in a second family. Two services may share
// a name — the catalogue groups them by family, and `core/random` and
// `world/random` are as different as any other pair.
//
// It exists so that rule 3's capture can be wrong in a way something notices:
// were the rule to capture the service's *name* rather than its whole path,
// "another service" would quietly come to mean "another name", and the fixture
// next door that imports this file would be waved through.

export function worldNoise(): number {
    return 1;
}

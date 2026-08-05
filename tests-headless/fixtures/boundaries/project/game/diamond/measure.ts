// The shared module of the diamond, and the legal case rule 6 must not mistake
// for a cycle: two unrelated files import this one, and a round of combat
// imports both of them. Every path through the graph reaches this file twice.
//
// A cycle detector that confuses "reached again" with "reached back" fires here,
// and would block the project on its first real service — every service has a
// types module that half its files import.

export function clamp(value: number): number {
    return value < 0 ? 0 : value;
}

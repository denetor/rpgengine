import tsParser from '@typescript-eslint/parser';

/**
 * The prohibitions that hold up ADR 0001, as flat-config objects.
 *
 * They live apart from `eslint.config.mjs` because two configurations apply
 * the very same objects: the real one, over the project, and
 * `eslint.fixtures.config.mjs`, over files that break each prohibition on
 * purpose so that `tests-headless/lint.spec.ts` can watch the check fail. A
 * rule copied into both would drift, and the test would then prove nothing
 * about the rule the project actually runs.
 *
 * Every message says **why**, and names the ADR: a rule that looks arbitrary
 * gets turned off by the next person who trips over it.
 */

const ADR = 'ADR 0001, docs/adr/0001-bit-for-bit-reproducibility.md';

const EXACT_OPERATIONS =
    'The deterministic path may use + - * /, Math.floor, Math.sqrt and Math.imul only';

/**
 * `Math.random()` cannot be seeded and cannot be replayed: one call is enough
 * to make a save unrestorable and a bug unreproducible.
 */
const MATH_RANDOM = [
    {
        object: 'Math',
        property: 'random',
        message:
            'Math.random() breaks reproducibility: RND-1 and ARC-9.2 promise that the same seed ' +
            'always gives back the same game, and this call cannot be seeded, saved or replayed. ' +
            'Take a stream from the Random service (src/engine/core/random) instead. See ' +
            `${ADR}.`,
    },
];

/**
 * ECMAScript leaves these *implementation-approximated*: V8, SpiderMonkey and
 * JavaScriptCore each answer with their own last bits. The code works
 * perfectly on the machine of whoever writes it and diverges in someone
 * else's browser — which is why no test on one engine can catch this.
 */
const TRANSCENDENTAL_NAMES = [
    'log',
    'log2',
    'log10',
    'log1p',
    'exp',
    'expm1',
    'pow',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'atan2',
    'sinh',
    'cosh',
    'tanh',
    'asinh',
    'acosh',
    'atanh',
    'cbrt',
    'hypot',
];

const TRANSCENDENTAL = TRANSCENDENTAL_NAMES.map((name) => ({
    object: 'Math',
    property: name,
    message:
        `Math.${name} is implementation-approximated: ECMAScript lets each JavaScript engine ` +
        'differ in the last bits, so the same seed would produce a different game in a different ' +
        `browser — invisibly, since it agrees with itself on any one engine. ${EXACT_OPERATIONS}. See ` +
        `${ADR}.`,
}));

/**
 * Same problem, without a function call in sight: the standard specifies these
 * constants only to "approximately" the value it prints.
 */
const APPROXIMATE_CONSTANT_NAMES = [
    'E',
    'LN2',
    'LN10',
    'LOG2E',
    'LOG10E',
    'PI',
    'SQRT2',
    'SQRT1_2',
];

const APPROXIMATE_CONSTANTS = APPROXIMATE_CONSTANT_NAMES.map((name) => ({
    object: 'Math',
    property: name,
    message:
        `Math.${name} is specified only approximately, so an engine may disagree in the last bit ` +
        'and the same seed would produce a different game elsewhere. Write the decimal literal ' +
        'instead: the standard does pin down that a literal is parsed to the nearest double, so ' +
        `it is the same number everywhere. See ${ADR}.`,
}));

/**
 * `**` is `Math.pow` spelled differently, and is approximated in exactly the
 * same way. Without this the property rule above is one keystroke away from
 * being sidestepped.
 */
const EXPONENTIATION_MESSAGE =
    'The ** operator is Math.pow under another name, and is approximated in the same way: each ' +
    'JavaScript engine may answer with its own last bits, so the same seed would produce a ' +
    `different game in a different browser. ${EXACT_OPERATIONS}. See ${ADR}.`;

const EXPONENTIATION = [
    { selector: "BinaryExpression[operator='**']", message: EXPONENTIATION_MESSAGE },
    { selector: "AssignmentExpression[operator='**=']", message: EXPONENTIATION_MESSAGE },
];

/** `no-restricted-properties`, configured with the given groups of entries. */
function forbidProperties(...groups) {
    return { 'no-restricted-properties': ['error', ...groups.flat()] };
}

const forbidExponentiation = { 'no-restricted-syntax': ['error', ...EXPONENTIATION] };

/** Everywhere in the project, the randomness service included. */
const everywhere = forbidProperties(MATH_RANDOM);

/**
 * Any path that produces deterministic values. Wider than the randomness
 * service on purpose: a map generator that reaches for `Math.cos` breaks the
 * same promise as the service itself would.
 */
const deterministicPath = {
    ...forbidProperties(MATH_RANDOM, TRANSCENDENTAL, APPROXIMATE_CONSTANTS),
    ...forbidExponentiation,
};

/**
 * The randomness service: the one place allowed to call `Math.random()`
 * (ARC-9.2), and still held to everything else.
 */
const randomnessService = {
    ...forbidProperties(TRANSCENDENTAL, APPROXIMATE_CONSTANTS),
    ...forbidExponentiation,
};

/**
 * The three zones, as flat-config objects, over the globs given for each.
 *
 * The layout is shared for the same reason the rules are: the fixture
 * configuration has to be the real one with different globs, or the meta test
 * would prove the rules right while the zones they are attached to drifted.
 *
 * `zones.everywhere` must come first — a later object's `rules` replaces an
 * earlier one's for the same rule name, and the two narrower zones are meant
 * to win over it.
 */
export function determinismZones(zones) {
    return [
        {
            files: zones.everywhere,
            languageOptions: {
                parser: tsParser,
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            rules: everywhere,
        },
        {
            files: zones.deterministicPath,
            // ADR 0001 admits no exception here, so neither does the linter: a
            // rule that the file breaking it can switch off protects nothing,
            // and this is the rule most likely to be switched off — its
            // violation looks harmless on the machine of whoever writes it.
            linterOptions: { noInlineConfig: true },
            rules: deterministicPath,
        },
        {
            files: zones.randomnessService,
            // Stated again rather than inherited from the zone above: in the
            // real configuration the service globs sit inside the
            // deterministic ones and would pick this up anyway, but the
            // fixture globs are disjoint, and a zone that only holds when it
            // happens to be nested is a zone nothing tests.
            linterOptions: { noInlineConfig: true },
            rules: randomnessService,
        },
    ];
}
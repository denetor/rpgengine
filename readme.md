# Excalibur TypeScript & Vite template

Check out the full documentation @ https://excaliburjs.com

You can use the excalibur cli to generate this template

```sh
npm create excalibur
```

## Getting Started

1. [Generate a repository](https://github.com/excaliburjs/template-ts-vite/generate) from this template
2. Modify the `package.json` with your own details
3. Run `npm install` to install dependencies
4. Run `npm run dev` to start the Vite server!
5. Have fun!

## Tests

One linter and two separate suites:

| Command | Suite | What it does |
|---|---|---|
| `npm run lint` | linter (ESLint) | Enforces the prohibitions of [ADR 0001](docs/adr/0001-bit-for-bit-reproducibility.md): no `Math.random()` outside the Random service, no transcendental `Math` function on the deterministic path. It runs as part of `npm run test:unit` and of `npm run build`, so a violation fails the build, not production. |
| `npm run test:unit` | headless (Vitest) | Lints and typechecks the project, then runs the `*.spec.ts` files under `src/` and `tests-headless/` in Node. No browser, no server. |
| `npm run test:integration` | integration (Playwright) | Builds the project, serves it and drives a real browser over `tests/`. |
| `npm test` | both | Headless first, integration after. |

Snapshots of the integration suite are updated with `npm run test:integration-update`.

### Continuous integration

Every push to `master` and every pull request runs `npm ci && npm run test:unit` on GitHub Actions
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)), on the Node version declared in `.nvmrc`.
CI runs the same scripts a developer runs — it adds none of its own.

The integration suite is **not** run there: it would need browsers provisioned on the runner. A green
tick on a pull request therefore says nothing about Playwright; that suite still runs on demand,
locally.

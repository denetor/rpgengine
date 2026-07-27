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

Two separate suites:

| Command | Suite | What it does |
|---|---|---|
| `npm run test:unit` | headless (Vitest) | Typechecks the project, then runs the `*.spec.ts` files under `src/` and `tests-headless/` in Node. No browser, no server. |
| `npm run test:integration` | integration (Playwright) | Builds the project, serves it and drives a real browser over `tests/`. |
| `npm test` | both | Headless first, integration after. |

Snapshots of the integration suite are updated with `npm run test:integration-update`.

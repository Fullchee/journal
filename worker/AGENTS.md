The Worker API behind the app. Run its tests with `bun run test:api <file>` from the repo root.

## Failure log

- Jest runs each suite in a vm realm, so JSON from Node's `Response`/`Request` and rows from `node:sqlite` fail `node:assert`'s strict `deepEqual` on identical data; `test/setup.ts` and `test/helpers/d1.ts` copy them into the test realm, so keep new worker test helpers going through them.

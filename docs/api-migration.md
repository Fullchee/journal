# API migration (#38)

The API from `journal/functions` now lives in `worker/`, with its tests and D1 migrations. The `journal` Worker (`journal.fullchee.workers.dev`) serves `/api/*` for web and Android. Both it and `journal`'s Pages API (`fullchee-dashboard.pages.dev`) share one D1 database.

Source: `journal@077ddae`. Until Android moves over, copy every `journal` API change or migration across.

## Layout

| Path                 | Holds                                                                          |
| -------------------- | ------------------------------------------------------------------------------ |
| `worker/index.ts`    | The deployed Worker: routes each `/api` path to its module                     |
| `worker/api/`        | One module per route, exporting `onRequestGet`/`Post`/… as Pages Functions did |
| `worker/lib/`        | Auth, D1 stores, Todoist, Google Calendar, the log box, zod/mini schemas       |
| `worker/migrations/` | The 31 D1 migrations (`0001`–`0032`; `journal` never had a `0002`), unchanged  |
| `worker/test/`       | The API tests, run by `bun run test` (`bun run test:api`)                      |

Pages Functions' bracketed file names became plain ones: `log/[id]/undo.ts` → `log/undo.ts`, `attachments/[[path]].ts` → `attachments.ts`, `notes/[type]/[[id]].ts` → `notes.ts`, `connections/[[id]].ts` → `connections.ts`.

## What changed in the port

- **Imports**: `@worker/*` for worker code and `@/core` for shared logic, instead of `journal`'s `#lib/*`.
- **Server-only code** that core dropped lives in `worker/lib`: the Log box's model and request schemas (`log-thread.ts`) and the Session brief prose call (`session-brief-prose.ts`).
- **Parsing**: request bodies, Workers AI replies, Access JWTs and Todoist and Google responses go through zod/mini schemas. Model output stays lenient: a wrong-typed field reads as missing, as before.
- **Tests**: `node:test` became Jest (`worker/jest.config.ts`, ts-jest, Node environment). `worker/test/setup.ts` and the D1 stub copy JSON and SQLite rows into Jest's realm so strict `deepEqual` works.
- **Lint debt**: the tests still read response bodies untyped. `.oxlintrc.json` turns off the `no-unsafe-*` rules for `worker/test/**` only. Parsing those bodies with core's schemas would remove the override.

## Switch-over steps

Done: token, bindings, secrets, router, migrations in deploy, proxy removal, the web check and backups. Left: Android (9).

1. **Token**: `CLOUDFLARE_API_TOKEN` has "D1 Edit" and "Workers R2 Storage Edit" (the deploy job applies migrations).
2. **Bindings**: `wrangler.jsonc` holds the D1, R2 and AI bindings and the vars copied from `journal/wrangler.toml`.
3. **Secrets**: `TODOIST_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` are set on `journal`.
4. **Router**: `worker/index.ts` matches each path to its module's `onRequest<Method>`, passes `params` like Pages Functions did, and answers 405 for a missing method.
5. **Migrations in deploy**: the `deploy` job runs `wrangler d1 migrations apply fullchee-dashboard --remote` before `wrangler deploy`. A migration `journal` already applied is skipped.
6. **Proxy**: removed. `run_worker_first: ["/api/*"]` stays.
7. **Backups**: a private repo runs the weekly backup and keeps the age-encrypted dumps; this public repo holds none. `journal`'s copy is off.
   **Garmin**: removed (#135). The sleep and activity tables keep their past rows; nothing pushes new ones. It never sent a workout, so the `workouts` table is dropped.
8. **Web check**: done; web signs in and loads from the Worker.
9. **Android**: see below.

## Android

`journal.fullchee.workers.dev` is guarded by the `fullchee-dashboard` Access app (AUD `8a5b42e9…bf90`), the same app as pages.dev, with Managed OAuth on. `POLICY_AUD` also keeps `71f531e1…55dd4`, the separate workers.dev app that guarded it first. Android asks Access for a token whose `resource` is `PRODUCTION_ORIGIN` and sends it as `Authorization: Bearer`; Access swaps it for the `Cf-Access-Jwt-Assertion` of the app that owns that hostname.

- **App side**: `PRODUCTION_ORIGIN` is the Worker. The refresh token is stored per API host, so a phone holding a pages.dev grant shows the sign-in screen once instead of retrying a refresh Access will never accept. JS-only: it ships as an EAS update, no new APK.
- **Access check** (2026-11-08): the authorize URL with `resource=https://journal.fullchee.workers.dev` and the existing client id redirects to the login page, so no new client is needed.
- **Phone check**: open the app twice (an update applies on the second launch), sign in, and load Today.

## Retiring `journal`'s API

Once Android loads Today from the Worker:

1. Stop copying `journal` API changes and migrations here; this repo owns both.
2. Done: the backups moved (step 7).
3. Done: the Maestro API (`.maestro/api/start.sh`) serves `worker` with `wrangler dev`.
4. Google OAuth Branding: replace the `fullchee-dashboard.pages.dev` home page and privacy links with `journal.fullchee.workers.dev` (`scripts/owner-gate.sh` flags this).
5. Delete `journal`'s `functions/` and migrations, then the `fullchee-dashboard` Pages project. Remove the pages.dev hostname from the `fullchee-dashboard` Access app; keep the app, which guards the Worker.

## Archiving `journal`

`journal` is now the GitHub repo `Fullchee/journal-2026-11-svelte`. Archive it only when every row below is done: archiving stops all of its workflows.

| `journal` workflow     | Status                                           |
| ---------------------- | ------------------------------------------------ |
| `backup-d1.yml`        | Done: moved to a private repo, old copy disabled |
| `garmin-sleep.yml`     | Dropped (#135): disabled                         |
| `cleanup-branches.yml` | Dropped: disabled                                |

Before archiving, run `gh workflow list -R Fullchee/journal-2026-11-svelte` and check that the table has a row for every workflow it lists.

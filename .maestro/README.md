# Smoke flows

Maestro flows for the gate screens, run on the Android emulator before a release. Not in CI (decision #41).

| Flow                    | Checks                                                  |
| ----------------------- | ------------------------------------------------------- |
| `check-in.yaml`         | A Check-in tap reaches the server                       |
| `offline-check-in.yaml` | A Check-in made in airplane mode saves once back online |
| `habit-check.yaml`      | Checking off a Habit reaches the server                 |
| `log-and-undo.yaml`     | "walked 20 min" logs to Walk, then Undo reverts it      |

## Run

1. Start the emulator with `bun run emulator` (scripts/setup.sh gives it 4 cores and 4 GB RAM; 1 core gives System UI ANRs that fail every flow).
2. Install a debug build on it: `cd android && ./gradlew installDebug`.
3. Run `bun run e2e`. Extra arguments go to `maestro test`, e.g. `bun run e2e --include-tags=…`.

The runner refuses to start if ports 8081, 8798 or 8799 are busy, so stop any other Metro or `wrangler` first. It only runs on an emulator (`E2E_DEVICE`, default `emulator-5554`): flows clear app data.

## Nothing reaches production or Cloudflare

- **Sign-in**: `JOURNAL_E2E=1` makes Metro swap `src/lib/auth/auth.ts` for `auth.e2e.ts`, which is always signed in and sends no Access token. Metro refuses to start in that mode unless `EXPO_PUBLIC_API_URL` is `localhost`, `127.0.0.1` or `10.0.2.2`.
- **API**: `api/start.sh` serves the app's Worker (`worker/`) with `wrangler dev`, keeping state in a fresh temp directory: a new local D1 (migrations plus `api/seed.sql`), a local R2 bucket and no secrets. The API takes `DEV_EMAIL` from `api/wrangler.toml` because requests carry no Access JWT, so it never fetches Access's signing keys.
- **AI**: Workers AI only runs on Cloudflare, so `api/fake-ai.ts` takes its place over a service binding. It answers "<habit> <n> min" with a log of that Habit, a new Habit's details call with fixed fields, and every other prompt with fixed text.
- **Web preview**: `scripts/web-preview.sh` (the `screenshot-web` skill) reuses `api/start.sh`. Web calls Metro's own origin, and Metro forwards `/api/*` to the local API; `metro.config.js` refuses a non-local proxy target or a set `EXPO_PUBLIC_API_URL`.
- **Telemetry**: the runner turns off wrangler's metrics, error reports, update check and `cf.json` fetch, Expo's telemetry and online checks (`--offline`), and Maestro's analytics and update check.

Checked on 2026-11-07: with packet capture on the emulator and a process-traced watch of the host, a full run opened no connection to a Cloudflare IP range from the emulator or from any process the runner started.

Each run starts from an empty database, so flows can assume a clean day.

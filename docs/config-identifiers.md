# Personal identifiers in config

What #167 removed from tracked config before the repo goes public (#160), and where each value lives now.

## Moved

| Value                 | Was in                   | Now lives in                                                           |
| --------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `OWNER_EMAIL`         | `wrangler.jsonc` `vars`  | Worker secret on `journal`; locally, `.dev.vars`                       |
| `HEVY_HABIT`          | `wrangler.jsonc` `vars`  | Worker secret on `journal`; locally, `.dev.vars`                       |
| Pages project name    | `wrangler.jsonc` comment | Dropped: the comment only named the old `journal` repo's Pages project |
| License holder (Expo) | `LICENSE`                | Replaced by Fullchee Zhang; the Expo template credit is gone           |

The Worker reads both secrets as `env.OWNER_EMAIL` and `env.HEVY_HABIT`. `GET /api/habits` sends `HEVY_HABIT` to the app, which logs Hevy workouts from Health Connect on that Habit.

A deploy never deletes secrets, so CI keeps both. To change one, run `bunx wrangler secret put <NAME>` from the repo.

A secret can't share a name with a deployed var: `wrangler secret put` fails with code 10053. To move a var, create a version with `bunx wrangler versions secret put <NAME>`, which swaps the var for the secret. Then deploy it with `bunx wrangler versions deploy <version>@100%` before pushing the config change.

`wrangler dev` reads `.dev.vars`. Without `OWNER_EMAIL` there, every signed-in local request fails with a 500. `.maestro/api/wrangler.toml` sets its own test values.

## Stays

| Value                                                   | Where                           | Reason                                                                                                        |
| ------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `dev.fullchee.journal` (Android package and URL scheme) | `app.json`                      | Changing it installs a new app beside the old one, loses its data and changes the native fingerprint.         |
| `owner: fullchee`                                       | `app.json`                      | Part of the native fingerprint: removing it stops `eas update` from reaching the installed APK.               |
| EAS `projectId` and `updates.url`                       | `app.json`                      | `eas update` and the installed APK both find the project by this id.                                          |
| `fullchee.cloudflareaccess.com`                         | `wrangler.jsonc`, `.env.schema` | The Access team domain: the app signs in against it and the Worker checks its tokens. It is public by design. |
| D1 name and id, R2 bucket name, Access AUD tags         | `wrangler.jsonc`                | Public by design; CI and the backup job name the D1 database.                                                 |
| Access client id                                        | `.env`                          | Public OAuth client (PKCE, no secret).                                                                        |

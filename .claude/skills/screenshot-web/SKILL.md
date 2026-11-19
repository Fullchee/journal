---
name: screenshot-web
description: Screenshot the web app with seeded local data. Use to see a web UI change, or to check a layout at desktop, tablet and phone widths.
---

# Screenshot web

One command serves the app on a seeded local API and shoots each route. Nothing reaches production or Cloudflare.

## Steps

1. Shoot the route you changed at 1440px:

   ```bash
   bun run screenshot:web /habits
   ```

   Pass several routes to shoot each one; no route shoots `/`. It takes about 30 seconds and prints one PNG path per shot. Done when every path printed and no `console error`, `request failed` or `HTTP 4xx/5xx` line appears.

2. Read each PNG to view it.
3. For the final check of a layout change, shoot every width once: add `--all-widths` (1440, 1024 and 390px). Add `--full-page` to capture below the fold.

## Iterating

To shoot several times in a row, keep the servers up and reuse them:

```bash
./scripts/web-preview.sh                                          # terminal 1: serves until Ctrl-C, prints PREVIEW_URL
PREVIEW_URL=http://localhost:8091 node scripts/screenshot-web.ts /   # terminal 2: one shot per run
```

Metro watches files, so each edit reaches the next shot.

## When it fails

The error names a log folder holding `api.log` and `metro.log`; read the one it names.

- **Port 8798 or 8799 busy**: another `wrangler` runs (often `bun run e2e`); stop it.
- **Blank page or a Metro error**: read `metro.log` for the bundling error.
- **"Couldn't load …" on screen**: the API answered but the app rejected it; read `api.log`, then the screen's zod schema.

## How it works

- `scripts/web-preview.sh` runs `.maestro/api/start.sh` (the app's Worker on :8798, a fresh local D1 from the migrations plus `.maestro/api/seed.sql`, a fake AI), then Metro on the first free port from 8091.
- Web leaves `EXPO_PUBLIC_API_URL` unset and calls its own origin; `JOURNAL_WEB_API_PROXY` makes Metro forward `/api/*` to the Worker, so there is no CORS.
- Given a command, the script runs it with `PREVIEW_URL` set, then stops both servers.

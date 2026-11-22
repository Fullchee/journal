---
name: log-workout
description: Log the owner's pull-ups or cardio (run, walk, row, swim, bike, erg, stairs) as rows in the dragon boat Team challenge Google Sheet, typed in or synced from Fitbit and Hevy. Use when the owner reports a workout to record, e.g. "log 40 pullups", "ran 6.2k yesterday", or asks to sync Fitbit or Hevy to the sheet.
---

# log-workout

Writes rows to the Team challenge sheet (see `GLOSSARY.md`) through the claude.ai Google Sheets connector (`mcp__claude_ai_Google_Sheets__*`). If its tools are missing, ask the owner to run `/mcp` and sign in to **claude.ai Google Sheets**.

- **Spreadsheet ID**: run `mise exec -- printenv TEAM_CHALLENGE_SHEET_ID` from the repo root. It lives in the untracked `mise.local.toml`, because this repo is public. If it prints nothing, ask the owner for the sheet's URL and offer to add the ID to `mise.local.toml` under `[env]`.
- **Athlete**: `SHEET_OWNER` in `src/core/team-challenge.ts` (exact Roster spelling; column B validates against `Roster!A2:A`).

## Tabs

The whole team shares the sheet. Write only the input columns; every other column holds a per-row formula.

| Tab                   | Input columns                                                                                                 | Computed (check after write)                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `Pull-up Log`         | A Date, B Athlete, C Exercise variation, D Reps, E Bodyweight kg, F Assistance kg, G Added weight kg, K Notes | H Multiplier, I Accepted reps (APE), J Window check |
| `Cardio Activity Log` | A Date, B Athlete, C Activity, D Quantity, H Notes                                                            | E Ratio, F Accepted REK, G Window check             |

**Pull-up variation** (column C, exact text): `Bodyweight pull-up`, `Banded pull-up — heavy assist`, `Banded pull-up — medium assist`, `Banded pull-up — light assist`, `Machine-assisted pull-up`, `Weighted pull-up`, `Negative pull-up (controlled eccentric)`.

- **E Bodyweight**: the owner's value from their most recent `Pull-up Log` row, unless they give a new one.
- **F, G**: always write a number; the sheet says "still need to put 0". Convert lb to kg (× 0.4536).
- **Weighted and machine-assisted rows**: newer rows' Multiplier formula (column H) only does `VLOOKUP(C<row>,'Pull Up Reps Explained'!$A$4:$B$11,2,FALSE)`, which has no value for these two variations, so the row scores 0 (row 134, 2026-11-08). In the Confirm step, also propose `update_formulas` on that row's H cell with row 21's full formula: `=IF(C<row>="", "", IF(C<row>="Machine-assisted pull-up", IFERROR(MAX(0, MIN(1, (E<row>-F<row>)/E<row>)), ""), IF(C<row>="Weighted pull-up", IFERROR((E<row>+G<row>)/E<row>, ""), VLOOKUP(C<row>,'Pull Up Reps Explained'!A$4:$B$10, 2, FALSE) ) ) )`.

**Cardio activity** (column C, exact text, from `'Cardio Activity Ratios Explained'!A4:A13`): `Running`, `Walking`, `Swimming`, `Indoor cycling`, `Outdoor cycling`, `Indoor rowing`, `Paddle erging`, `SkiErg`, `Stair climber`, `Hill Runs`.

- **D Quantity**: km for every activity except `Stair climber`, which takes active minutes. Convert metres and miles to km (× 1.609).
- Write minutes as a plain number (`20`). The sheet parses `20:00` as a time of day, which scored a teammate's 20 minutes as 0.13 REK instead of 3.
- **Hill Runs**: most rows' Ratio formula (column E) looks up `$A$4:$C$12`, which stops one row above Hill Runs, so the row scores 0. In the Confirm step, also propose `update_formulas` on that row's E cell with `=IFERROR(VLOOKUP(C<row>,'Cardio Activity Ratios Explained'!$A$4:$C$13,3,FALSE),"")`, the formula teammates' Hill Runs rows use.

## Steps

1. **Parse** the request into one row per activity or pull-up variation. Date defaults to today; "yesterday" and weekdays resolve to the most recent such date. Map loose wording to the exact list values above ("rowed" → `Indoor rowing`, "band" with no tier → ask which tier). For "sync Fitbit" or "sync Hevy", run **Sync** below instead. Done when every row has every input column filled.
2. **Find the target row**: `get_values` on `'<Tab>'!A1:D3000`. The API trims trailing blank rows, so the first empty row is `values.length + 1`. Read only A:D so formula columns never count as data.
3. **Confirm**: show the exact rows (date, activity or variation, quantity, target row) and wait for the owner's yes. The owner approves every edit to this shared sheet, including undo.
4. **Write** with `update_values` on `'<Tab>'!A<row>:G<row>` (pull-ups) or `'<Tab>'!A<row>:D<row>` (cardio); several rows go in one call over a taller range. Write notes in a separate `update_values` on K or H. Send the date as a **number**: a synced row's `date_serial`, or for a typed-in row `echo $(( $(date -j -u -f %F <YYYY-MM-DD> +%s) / 86400 + 25569 ))`. A date string lands as text, and Window check then misreads it. Send quantities as numbers, never strings.
5. **Verify**: `get_values` on `'<Tab>'!A<row>:K<row>`. Done when each row shows the date as `YYYY-MM-DD`, B is the Athlete, the computed APE or REK matches quantity × multiplier or ratio, and Window check reads `IN WINDOW`. If B shows another athlete, a teammate took that row at the same moment: rewrite the owner's row at the next empty row and leave theirs alone.
6. **Report** a table of the written rows with their row numbers and computed APE or REK. To undo, `batch_clear_values` on that row's input columns only (`A:G` and `K`, or `A:D` and `H`).

## Sync

One call to `POST /api/team-challenge` replaces step 1 for synced rows; steps 2–6 then run on the tab it covers. "Sync Hevy" runs `pullups` then `cardio`; "sync Fitbit" runs `cardio`. The handler is `worker/api/team-challenge.ts`; read it on any 4xx.

1. **Read the tab**: `get_values` on `'Pull-up Log'!A4:G3000` (so loads are compared) or `'Cardio Activity Log'!A4:D3000`. Save its `values` array as JSON to a scratchpad file.
2. **Call** the endpoint with `kind` (`pullups` or `cardio`), the tab's values as `sheet`, and optional `since` and `until` (`YYYY-MM-DD`; default the challenge start through today). Send no `hevy_csv` the first time:

   ```bash
   jq -n --slurpfile sheet <values.json> '{kind: "pullups", sheet: $sheet[0]}' > <body.json>
   .claude/skills/journal/scripts/journal-api.sh POST /api/team-challenge @<body.json>
   ```

   The script logs in through Cloudflare Access; when the session has expired it waits for the email PIN, so run the first call in the background and tell the owner to enter it.

3. **Hevy CSV**: a 400 whose error names `hevy_csv`, or the owner saying the Hevy sync is stale, means the endpoint lacks fresh Hevy sets. Ask the owner to export a CSV from Hevy (Profile → Settings → Export & Import Data → Export workouts) and give its path, then resend with `--rawfile csv <path>` and `+ {hevy_csv: $csv}` added to the `jq` filter. A sent `hevy_csv` always wins over the synced sets.
4. **Sort the response** into the Confirm step:
   - **`to_log`**: the rows to write, each with `date_serial`. Pull-up rows carry `reps`, `assistance_kg` and `added_kg`; fill E Bodyweight as usual. Cardio rows carry `activity` and `quantity`.
   - **`already_logged`**: on the sheet within tolerance (0.1 km, or the same reps within 0.5 kg of load). Mention the count only.
   - **`ask`**: a new row and a sheet row with the same date and activity or variation but a different quantity or load, likely the same session typed by hand (2026-10-28: 40 typed, Hevy says 38). List each pair and ask which to keep.
   - **`skipped`**: workouts the sheet won't score, each with `date`, `exercise` (the source's own name), `quantity` and `reason`. Show them as a table; a skipped workout the owner wants counted gets the activity or variation they name. A `Pull Up (Band)` set lands here when its notes don't say heavy, medium or light.

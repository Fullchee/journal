# Work-log migration plan

Moves the content of `~/personal-projects/work-log` (an Obsidian vault) into D1 tables behind this Worker's API, so one app holds todos, Check-ins, Habits and work. Plan only: nothing here is built yet.

## Fixed decisions

- **Separate repos.** Migrate the data, not the code. The vault stays the source of truth until Phase 3 ends.
- **Sole user.** The owner is the only user; work material, including work Jira and PR details, is allowed (`PRODUCT.md`). No reader views.
- **Full move into D1**, not summary Signals.

## What the source holds

The handoff guessed at the sizes; the vault holds less structure than it suggested.

| Source                              | Real size                    | Structure                                                                                       |
| ----------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `data/plan-log.jsonl`               | 4 rows (2026-11-05 to 11-11) | Structured                                                                                      |
| `data/weeks.jsonl`                  | 1 row (2026-W45)             | Structured                                                                                      |
| `data/estimate-log.csv`             | 1 row                        | Structured                                                                                      |
| `data/history-daily.csv`            | 260 rows (2025-11-10 on)     | Structured: daily PR, review and ticket counts                                                  |
| `weekly/` 2026-W39 to W47           | 9 notes                      | `#### Ddd, Mon D` days with ticket → PR bullets, **Code reviews**, **Plan — Ddd**, **Meetings** |
| `weekly/` 2026-W22 to W38           | 16 notes                     | `**Ddd, Mon D**` days with ticket and PR bullets and a "Code review" list                       |
| `weekly/` 2024, 2025, 2026-W10, W21 | 31 notes                     | Free-form checklists, no reliable day headings                                                  |
| `monthly/`, `quarterly/`, `yearly/` | 27 notes                     | Prose; only 11 `### Week NN` Weekly retros, all from 2026-07 on                                 |
| `career/`                           | 99 notes, 43 images          | Free-form                                                                                       |

## Decisions on the open questions

Decided here with reasons; the owner overrides any of them by editing this section.

| Question                                 | Decision                                                               | Why                                                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is a Ticket its own table?               | **Yes**: `tickets`, keyed by the Jira key                              | Tickets carry titles, PRs and Plan actions. A Habit is a personal action, and the One-off glossary entry rules out "task".                                          |
| Where does the Work backlog go?          | **Todoist, in the job Pool**                                           | Plan the day already triages job Pool tasks. A second todo list in D1 would split the "super todo app" in two.                                                      |
| `felt` (1–3)                             | **Import the 4 rows as a column; stop asking it**                      | Going forward, `/close-day` reads the Day's Check-ins instead. A third mood scale duplicates Check-ins.                                                             |
| `storm_to_sun` (1–6)                     | **Becomes a real Check-in**                                            | Its scale maps 1:1 onto Check-in scores 1–6. `/log-work` saves a Check-in and stores its id on the estimate row. The one historical row stays a plain column value. |
| Does `/close-day` keep writing Markdown? | **Yes in Phases 1–2; no after Phase 3**                                | After cut-over, D1 is the source and core renders the weekly Markdown on demand (standup copy, export).                                                             |
| `site/`                                  | **Stays in work-log**                                                  | Its pages are hand-written content files, not data. A later page can read the API.                                                                                  |
| `history-daily.csv` backfill             | **Script stays in work-log, writes to the API**                        | It needs work Jira and GitHub credentials, which don't belong in this repo or its CI.                                                                               |
| Work retros vs the Growth Ladder         | **One `reflections` table with a `track` column** (`growth` or `work`) | The Ladder, Rung pattern and Weekly retro already exist; a second table would copy them.                                                                            |

## Glossary additions (Phase 0)

Add a `## Work track` section to `GLOSSARY.md` before any code:

- **Work track** — the work half of the app: Work days, Tickets, Plans and work Reflections. The Growth track is everything else.
- **Work day** — a Day with work on it: its Tickets and PRs, Code reviews, meetings, counts and Anchor.
- **Ticket** — a Jira issue, named by its key (`DEV-N`).
- **Plan** and **Plan action** — the next Work day's sized list from `/close-day`; each action is a merge or fix on one PR, with a status. Distinct from Plan the day, which triages Todoist.
- **Hit rate**, **If time**, **Blocked action**, **Anchor** — copied from work-log's `CONTEXT.md`.

## Schema sketch

Each migration follows `0058`. Rows use natural keys so every import and sync is an idempotent upsert.

| Table                   | Key                   | Holds                                                                                                                                             |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work_days`             | `day`                 | Anchor, meeting hours, felt, and the history-daily counts and flags                                                                               |
| `tickets`               | `key`                 | Title, URL                                                                                                                                        |
| `pull_requests`         | `ref` (`django#4188`) | Repo, number, URL, title, Ticket, state                                                                                                           |
| `work_entries`          | `week`, `position`    | One typed bullet (done, task, blocker, meeting, review, note): day, text, Ticket, PR, done state and `parent_id`                                  |
| `code_reviews`          | `day`, `pr_ref`       | Author, title                                                                                                                                     |
| `plans`, `plan_actions` | `day`; `day`, `id`    | Plan size, size rule, written and scored times; each action's kind, PR, Ticket, `if_time` and status. Hit rate is computed in core, never stored. |
| `estimates`             | `task_id`             | Estimate, actual, blocker type, `check_in_id`                                                                                                     |
| `work_weeks`            | `week`                | Weekly metrics, forecast, and `raw_md`, the note archived as written                                                                              |
| `reflections`           | adds `track`          | Unique on `(track, period)` instead of `period`                                                                                                   |

## Phases

### Phase 0: decide and name

1. Record "the Work track lives in D1" as ADR 0014 (`/domain-modeling`).
2. Add the glossary section above.
3. Place the code (`/codebase-design`): parser and renderer in `src/core/work/`, stores in `worker/lib/work-store.ts`, routes in `worker/api/work/`.

**Done when** the ADR and glossary are on `main`.

### Phase 1: structured data

1. Migration: `work_days`, `tickets`, `plans`, `plan_actions`, `estimates`, `work_weeks`.
2. API under `/api/work/` (`days`, `plans`, `estimates`, `weeks`), behind `authorizeWriter` like the Signal routes, with `zod/mini` bodies.
3. `scripts/import-work-log.ts` reads the four `data/` files and upserts them.
4. A sync step at the end of `/close-day` and `/close-week` runs the import again. The skills keep writing the files.

**Done when** a row-by-row diff of each `data/` file against D1 is empty after a `/close-day`.

### Phase 2: weekly notes and retros

1. Migration: `pull_requests`, `work_day_items`, `code_reviews`; `track` on `reflections`.
2. `src/core/work/` gets `parseWeek(md)` and `renderWeek(rows)` for the `####` format, and a lenient parser for the `**Ddd**` format.
3. Import by era:
   - **W39 on**: full parse. Test: `renderWeek(parseWeek(md))` equals the source after whitespace normalising.
   - **W22 to W38**: lenient parse. Test: every Jira and PR link in the source appears in D1.
   - **Free-form notes**: one `work_weeks.raw_md` each, stored verbatim.
4. Import `### Week NN` blocks and the monthly, quarterly and yearly notes as `reflections` rows with `track = 'work'`.
5. The sync step re-parses the current week's note and replaces that week's rows in one D1 batch.
6. Add a read-only Work view to the app: the week's days, Tickets and PRs, and the Hit rate trend. Design it with `/impeccable`.

**Done when** both import tests pass for every note and the Work view shows the current week.

### Phase 2b: typed Work entries (#155)

The first pass stored most of the text as Markdown. Migration 0063 replaces `work_day_items` and the `*_md` sections with `work_entries`, one typed row per line, and adds `work_retros` for each retro's `/close-week` fields.

- **Extraction**: a one-off run by Claude wrote `data/extracted/weekly/<week>.json` in work-log, one entry per source line, matched by the line's exact text. From 2026-W39 the parser still types the Ticket, PR and Code review bullets.
- **Leftovers**: a line neither covers becomes a `note` entry, and the import prints it. A new free bullet from `/close-day` lands there until Phase 3 writes entries directly.
- **Kinds** (migration 0065): task, blocker, meeting, review, note and personal. Finished work is a task with done = 1; a log bullet records work done that day. An open box is done = 0 only from 2026-W39 (Plans are scored there); older open boxes stay null. Personal lines stay out of the Work view.
- **Ticket titles** come from Jira (`data/extracted/tickets.json`); a note never overwrites a stored title.

### Phase 3: cut over and archive

1. Point the skills at the API (`/writing-for-agents`): `/close-day`, `/close-week`, `/log-work` and `/work-todo` write; `/close-quarter`, `/close-year` and both standup skills read.
2. Rebuild the Obsidian-only habits in the app:
   - **Anchor**: one line on the Work day, shown on Today during work hours.
   - **Work backlog capture**: Hyper+T sends to Todoist's job Pool.
   - **Standup copy**: core renders the Work day as Markdown; the app copies it.
3. Import `career/` as a new `career` note type in the notes API, with images in R2 under `career/` served by `/api/attachments`.
4. Run both for two weeks: the skills write D1, and a nightly diff renders D1 to Markdown and compares it with the vault.
5. Archive the vault: make the repo read-only and keep its git history.

**The nightly diff (step 4, #15)** is `scripts/vault-diff.ts`. Decided here:

- **What it compares**: each week's `work_weeks.raw_md` against the vault note, line by line after whitespace normalising. The typed rows can't rebuild a note (#13), so `raw_md` is D1's rendering of the week.
- **How it runs**: a launchd agent on the owner's Mac at 22:30, after `/close-day`; launchd runs a missed night when the Mac wakes. The vault lives only on that Mac, so CI can't run it. `node scripts/vault-diff.ts <work-log path> --install` writes the agent, so the vault path stays in `~/Library/LaunchAgents`.
- **How it reports**: every run writes the full diff to `~/Library/Logs/journal-vault-diff/<day>.txt` and its result to `runs.log`. A difference or a failure shows a macOS notification. A difference also comments its weeks and line numbers on #15, never the lines' text, as the repo is public. The fourteenth empty run in a row comments that the parallel run passed.

**Done when** two weeks of diffs are empty and the work-log repo is archived.

## Risks

- **Work data leaking into review views.** The Session brief, Weekly review and search must filter `track = 'work'`. Test each one.
- **Parser drift.** `/close-day` keeps writing Markdown during Phases 1–2, so a format change breaks the sync. The sync fails loudly instead of skipping a day.
- **Two sources of truth.** Phases 1–2 write D1 only through the sync, never by hand, so the vault always wins a conflict.

## Next step

Chart these phases as a `wayfinder:map` issue, one `wayfinder:task` per numbered step.

# The Work track lives in D1

The `work-log` vault's data moves into D1 tables behind `/api/work/*`, and the app becomes the one place for todos, Check-ins, Habits and work. The vault stays the source of truth until the cut-over; the plan is `docs/work-log-migration.md`.

## Considered options

- **Summary Signals only**: a daily row of counts (PRs, reviews, Hit rate) pushed like sleep. Cheap, but the Tickets, Plans and retros stay in Obsidian, so the app can't replace the vault.
- **Full move into D1** (chosen): Tickets, PRs, Plans and retros become rows the app and the skills share.

## Consequences

- Work retros share `reflections` with a `track` column, so the Ladder stays one concept. Every review-facing reader filters to `growth`.
- `felt` stops being asked; `/close-day` reads the Day's Check-ins. `/log-work`'s storm-to-sun reading becomes a real Check-in.
- The Work backlog stays in Todoist's job Pool, so Plan the day triages it with the other job tasks.
- Code stays in its repo: work-log's Python scripts and `site/` don't move.

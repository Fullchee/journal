---
name: journal
description: Read, search or write the owner's live journal. Use when the owner asks what their notes say, or wants to add, edit or delete a Habit, Goal, Check-in, Reflection, Connection or any other journal record.
---

# Journal

Every write goes to **production**: the phone app shows it at once. Call the journal Worker with `.claude/skills/journal/scripts/journal-api.sh METHOD PATH [JSON | @file]` from the repo root. The script logs in through Cloudflare Access as the owner. When the session has expired it opens the browser and waits for the email PIN, so run the first call as its own background command and tell the owner to enter the PIN.

## Vocabulary

Use the words in `GLOSSARY.md`. Read it before drafting a Habit or Goal: it defines kind, stage, target, record and why each Habit names a felt **why**.

## Steps

1. **Draft.** Turn the conversation into the fields below. Ask only for what you can't infer; take the defaults for the rest.
2. **Read before you change.** For an edit or delete, GET the current row first. For a bulk write, re-read every row right before writing and diff it against your scan: another session can rewrite the same rows in between.
3. **Gate.**
   - **Create**: write straight away.
   - **Edit or delete**: show a before/after (or the row being deleted) and wait for the owner's OK.
4. **Write**, then report the result in one line: what changed and its id. The step is done when the API returns 2xx; on 4xx, read the handler named below for the rule that failed, fix the payload, and retry.

Checking off a Habit for a day stays in the app; leave the `check` change to it.

## Endpoints

The handlers in `worker/api/` are the source of truth for validation; Habit fields are checked in `worker/lib/habit-records.ts`. For a record the table leaves out, find its path in `worker/index.ts` and read its handler before calling it.

| What         | Read                                                                                                                                                                                                                                                                                                   | Write                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Search       | `GET /api/search?q=<text>` matches Check-ins (note and detail fields) and Habits (name, description, usual when and where), returning `{habits, checkIns}`. Notes and other records need their own GET.                                                                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Habits       | `GET /api/habits?view=tracker` (all Habits plus Goals)                                                                                                                                                                                                                                                 | `POST /api/habits` with `{"type": "habit", ...}`; add `"id"` to edit. Delete: `{"type": "delete-habit", "id"}`                                                                                                                                                                                                                                                                                                                                   |
| Goals        | `GET /api/notes/goals[/<id>]`                                                                                                                                                                                                                                                                          | `POST` `{title, why, state, parentId}`; `PATCH /<id>` same fields; `PUT /<id>` `{body}`; `DELETE /<id>`                                                                                                                                                                                                                                                                                                                                          |
| Reflections  | `GET /api/notes/reflections[/<id>]` (`?track=work` lists work retros; default `growth`)                                                                                                                                                                                                                | `POST` `{track?: growth\|work, periodKind: week\|month\|quarter\|year, period: "2026-W45", body}`; `PUT /<id>` `{body}`; `DELETE /<id>`                                                                                                                                                                                                                                                                                                          |
| Check-ins    | `GET /api/check-ins`                                                                                                                                                                                                                                                                                   | `POST` `{score: 1-8, note}`; `PATCH` `{id, …}` with the detail fields `worker/api/check-ins.ts` accepts; `DELETE` `{id}`                                                                                                                                                                                                                                                                                                                         |
| Connections  | `GET /api/connections[/<id>]` (`lastContactedOn` is the newest Interaction's day; the detail adds `interactions`, newest first); `GET /api/connections?q=<text>` searches names, notes, follow-ups, Interaction notes, meetups, date labels and Circle names, returning `{found: [{id, name, match}]}` | `POST` `{name}`; `PATCH /<id>` any of `{name, closeness: ""\|close\|friend, circles: ["Mahjong"], cadenceDays: null\|7\|14\|30\|90, followUps, growCloser: bool, meetups: [{label, days: [0-6], time?: "HH:MM"}], dates: [{label, date: YYYY-MM-DD, yearly}], planChecked: true}` (`meetups`, `dates` and `circles` replace all; a new Circle name makes that Circle; 0 = Sunday); `PUT /<id>` `{body}` (notes on lasting facts); `DELETE /<id>` |
| Interactions | Through the Connection detail                                                                                                                                                                                                                                                                          | `POST /api/interactions` `{day: YYYY-MM-DD, kind: in-person\|call\|message, note?: one line, minutes?: number (in person only), connectionIds: [id, …]}` logs one time I was in touch with everyone in it; `PATCH /<id>` any of those fields; `DELETE /<id>`                                                                                                                                                                                     |
| Circles      | `GET /api/circles` returns `{circles: [{id, name, habitId, followsFrom, members: [{id, name}]}]}`                                                                                                                                                                                                      | `POST` `{name, habitId?, memberIds?}` (follows that Habit from today); `PATCH /<id>` `{habitId: <id>\|null}`. Each counted day of a followed Habit logs one in-person Interaction (`circle` names it) for the newest Circle's members; never log those by hand                                                                                                                                                                                   |

## Habit payload

An edit sends `id` plus only the fields to change; the API keeps the rest. When you set `stackedAfter`, also send `cueType: "stacked"` (or `""` when clearing it).

Fields and defaults come from `blankHabit` in `src/core/habits-view.ts`. The ones the owner usually means:

- `name`, `description` (Markdown), `why`, `usualWhere`; `usualWhen`: `"HH:MM"` or `""` (the API refuses free text)
- `kind`: `good` or `bad`. `stage`: `seed`, `sprout`, `plant`, `tree`. `priority`: `high`, `normal`, `low`. `active`: false puts it in the Backlog. `autoLogged`: true keeps an imported Habit off Today.
- `target`: `{type: "daily" | "weekly" | "days" | "once" | "none", count: 1-7, days: [0-6]}`. `none` makes a Reference Habit; `once` a One-off due on `startDate`.
- `record`: `check`, `count` or `duration` (needs `targetMinutes`: 1-1440). `goals`: Goal ids. `alarm`: `null` or `{time: "HH:MM", kind: "alarm" | "persistent"}`.

## Goal payload

A Goal `PATCH` replaces `title`, `why` and `state`: missing ones reset (`why: ""`, `state: "active"`). Read the Goal first. Leave out `parentId` to keep the current parent; send `null` to make the Goal top-level.

- `parentId`: the id of the Goal this one serves, or `null` for a top-level Goal. Any depth works; about three levels reads best.
- The API answers 400 `invalid parent` for a missing Goal, the Goal itself or one of its descendants.
- Deleting a Goal makes its children top-level.

## Long bodies

For a Markdown body, write the JSON to a file in the scratchpad and pass `@path`; shell quoting mangles long text.

# Work versus personal Habits and todos

Researched 2026-11-13. How should the app tell work-specific Habits and todos from the rest, without adding routine input?

## Answer

**Reuse the Pool. Give each Habit a Pool (`personal` by default, `job` with one tap), pre-picked from its Places. Leave todos as they are.**

- **The split already exists for todos.** Plan the day sorts Todoist tasks into a `personal` or `job` Pool by project, with no tagging (`src/core/plan-day.ts`). The app has no todo type of its own: One-offs are personal Habits, and job tasks stay in Todoist.
- **Habits have no split yet.** Tags were dropped in migration `0015`. The nearest signal is Places: two active Habits name the Office.
- **Places alone misclassify work-from-home.** "Working trance for discomfort aversion" lists Home, Office, Library and two more. A Places-only rule calls it personal.
- **Apps that split work from life ask once per container, never per day.** Things has Areas, Sunsama has contexts, Todoist has projects or workspaces, TickTick has lists and folders. None switch on their own by time or place.
- **The phone can't tell the app it is "at work".** Android Modes and the work profile hide their state from other apps. Google Calendar working hours need a work account.

## What the app has today

| Concept                | Where                                                | Work/personal signal                                                                                                      |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Pool**               | `GLOSSARY.md` (Planning), `src/core/plan-day.ts`     | `personal` (07:00–22:00) or `job` (09:00–17:00, weekdays). Derived from one hard-coded Todoist project ID.                |
| **Habit**              | `habits` table, `Habit` in `src/core/habits-view.ts` | No category, area or tag field. Has `places`, `usualWhen`, `usualWhere`, `cueType`, Frequency (`days` = fixed weekdays).  |
| **Places**             | `PLACES` in `src/core/check-in-view.ts`              | Home, Office, Gym, Library, 220 Vic, 120 Parl, 61 Hunt, Transit. Migration `0054` renamed "Work" to "Office".             |
| **Place guess**        | `GLOSSARY.md`                                        | Pre-fills a Check-in's place from GPS and past Check-ins, on Android.                                                     |
| **One-off**            | `GLOSSARY.md`, ADR 0012                              | A Habit due once, "for myself". _Avoid_: task, to-do.                                                                     |
| **Tags**               | Migrations `0006` (created), `0015` (dropped)        | Gone. A `work` tag existed on `ref-body-doubling` (`0009`). The glossary lists "tag" and "context" under Places' _Avoid_. |
| **Calendar busy time** | `worker/lib/calendar.ts`                             | Reads only the personal `primary` calendar's free/busy.                                                                   |

Live data on 2026-11-13: 39 active Habits, 5 with Places, 2 naming Office, no open One-offs. Of 15 Check-ins with a place, 2 say Office.

Two rules from the repo shape every option:

- **"Design features for zero routine input: a default plus one optional tap, never a weekly entry"** (`AGENTS.md`, Failure log).
- **"The app holds no work material"** (`PRODUCT.md`). Work-specific Habits are Growth material about how I work. Job tasks themselves stay out.

## How other apps model the split

### Task managers

| App              | Unit of the split                                                                          | Automatic switching?                                                                     | Source                                   |
| ---------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Todoist**      | Personal projects ("My Projects") versus team projects in a workspace                      | No. Filters such as `workspace: My projects` or `today & !#Work` are manual.             | [glossary][td-gloss], [filters][td-filt] |
| **Things**       | **Areas**: "for grouping all of your projects and to-dos that support an ongoing ambition" | No. Areas "narrow your focus" when you open one.                                         | [guide][things-guide]                    |
| **TickTick**     | Lists, grouped into folders; up to 5 `#tags` per task                                      | No.                                                                                      | [folders][tt-folder], [tags][tt-tags]    |
| **Sunsama**      | **Contexts** (usually Work and Personal) holding channels                                  | No. A filter (`Shift F`) shows one context. A personal context skips the workload count. | [channels][sun-ctx]                      |
| **Akiflow**      | Time Slots: calendar containers for "admin, marketing, fundraising, personal time"         | No. A slot can lock to one calendar account.                                             | [time slots][aki-slots]                  |
| **Google Tasks** | Separate lists, or separate Google accounts                                                | No.                                                                                      | [add a list][gt-list]                    |

Fit:

- **Every split is a container chosen once**, when the item is made. Nobody re-labels items daily.
- **Sunsama's personal context changes behaviour**: its tasks don't count toward the workday's load ([source][sun-ctx]). That matches the Pool's separate hours.
- **Todoist location reminders fire on arrival or departure** ([source][td-loc]). They remind; they don't change what a view shows.

### Habit trackers

| App               | Split                                                                                                | Source                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Loop**          | Added a free-text `category` on 2026-10-21: one per Habit, shown as headers in the list. Unreleased. | [commit][loop-cat], [changelog][loop-log]    |
| **Loop**, earlier | Rejected a groups PR because it "tackles too many issues at the same time"                           | [PR #2020][loop-2020]                        |
| **Habitica**      | Many tags per task; new users get "Work", "Exercise", "Health + Wellness", "School" and more         | [defaults][hab-tags], [task model][hab-task] |
| **Streaks**       | Pages of tasks ("24 tasks … 4 pages of 6"); no work/personal field                                   | [App Store][streaks]                         |

Fit:

- **Habit trackers use one flat label at most.** Loop chose a single category, not tags, to keep the model small.
- **None switch Habits by time or place.**

### Operating system contexts

| Mechanism                         | What it does                                                                                              | Can the journal read it?                                                                      | Source                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Android work profile**          | Separates "work apps and data" from personal ones. Paused, "work apps won't run, generate notifications". | No. Intents and storage don't cross profiles by default.                                      | [android.com][wp], [pause][wp-pause], [dev][wp-dev] |
| **Work apps schedule**            | Digital Wellbeing turns the work profile on for set "hours and days of the week"                          | No API for other apps.                                                                        | [pause][wp-pause]                                   |
| **Android Modes** (15+)           | Named modes with a time schedule, or "While driving"                                                      | Only its own rules: `getAutomaticZenRules()` "Returns AutomaticZenRules owned by the caller". | [Pixel help][modes], [API][nm]                      |
| **Google Calendar working hours** | A weekly schedule for availability                                                                        | Only on "a work or school account"; the app reads the personal calendar.                      | [help][gcal-wh]                                     |
| **iOS Focus filters**             | A Focus can show only chosen calendars; apps adapt via `SetFocusFilterIntent`                             | iOS is out of scope.                                                                          | [Apple][focus-cal], [API][focus-api]                |

Fit:

- **iOS Focus is the only automatic context that filters content**, and it is iOS-only.
- **On Android the app must own the clock itself.** The Pool's hours already do this, on Toronto Days (ADR 0013).

## Design options

| Option                                  | Shape                                                                                               | Routine input                           | Pros                                                                            | Cons                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **A. Pool on each Habit (recommended)** | `pool: "personal" \| "job"`, default `personal`. Pre-picked `job` when every Place is a work place. | None. One optional tap per Habit, once. | Reuses the glossary word and the Pool's hours. Right for work-from-home Habits. | A migration and a form chip.                                                                      |
| **B. Derive from Places**               | A Habit is `job` when every Place is a work place (Office). No new field.                           | None                                    | No schema change.                                                               | Misclassifies work-from-home Habits. Needs a list of work places.                                 |
| **C. Time-only mode**                   | During job hours, Today shows a "Job" heading. No per-Habit data.                                   | None                                    | Mirrors Android's work apps schedule.                                           | Can't say which Habits are work. Holidays and sick days look like workdays.                       |
| **D. Location**                         | Place guess at Office switches Today to job Habits.                                                 | None                                    | Uses the existing GPS guess.                                                    | Android only. Wrong at home on remote days. Office has 2 Check-ins: little history to learn from. |
| **E. Infer from source**                | Work = from the job Todoist project, Jira or the work calendar.                                     | None                                    | Already how Pools work for Todoist.                                             | Habits have no source. Work calendar and Jira are work material and need a wider grant.           |
| **F. Tags, Areas or separate lists**    | Free tags or an Area on each Habit.                                                                 | A label per new item                    | Familiar from Things and Habitica.                                              | Tags were dropped once (`0015`). The glossary avoids "tag" and "context". Splits Today into tabs. |

Judged against the rules:

- **Zero routine input**: A, B, C, D and E pass. F asks for a label on every new item.
- **Owner is the only user**: no need for workspaces, sharing or per-person rules (Todoist, Sunsama).
- **Android and web**: D works only in the Android app. C and A work on both.
- **Toronto Day**: A and C compare job hours in Toronto minutes, as `freeWindows` already does.
- **No work material**: E pulls job data into the app. A stores only a flag on my own Habits.

## Recommendation

1. **Pool on each Habit (A).** Add `pool` to `habits`, default `personal`. The Habit form shows one chip, pre-picked `job` when its Places are only work places. Today lists `job` Habits under their own heading during job hours and folds them away outside them. Backfill: set `job` on the two Office-only Habits; ask about the rest.
2. **Derive from Places (B).** Ship this first if A's migration feels early. Add a `WORK_PLACES` constant beside `PLACES`. Switch to A when a work-from-home Habit lands in the wrong group.
3. **Time-only heading (C).** Use only if the goal is quiet evenings, not grouping. Fixed-weekday Frequency already keeps weekday-only Habits off weekends.
4. **Leave todos alone.** Job tasks stay in the Todoist job project, and Plan the day keeps splitting them by Pool. One-offs stay personal by definition. Don't add a todo type.

Not recommended: tags or Areas (F), location switching (D) and pulling Jira or the work calendar (E).

## Open questions for the owner

- **What should the split do?** Group on Today, quiet job Habits after hours, or split the Weekly retro and Session brief?
- **Which Places are work places?** Office for sure. What about 220 Vic, 120 Parl, 61 Hunt and Library?
- **Do work-from-home days count as job time?** If yes, B is not enough.
- **Should job hours skip Ontario statutory holidays?** `freeWindows` skips only weekends today.
- **Should readers see the split?** The Session brief could show work Habits as their own group.

[aki-slots]: https://product.akiflow.com/help/articles/3089241-time-slots
[focus-api]: https://developer.apple.com/documentation/appintents/setfocusfilterintent
[focus-cal]: https://support.apple.com/guide/calendar/icld13f9da17/mac
[gcal-wh]: https://support.google.com/calendar/answer/7638168?hl=en
[gt-list]: https://support.google.com/tasks/answer/7675771
[hab-tags]: https://github.com/HabitRPG/habitica/blob/develop/website/common/locales/en/defaultTasks.json
[hab-task]: https://github.com/HabitRPG/habitica/blob/develop/website/server/models/task.js
[loop-2020]: https://github.com/iSoron/uhabits/pull/2020
[loop-cat]: https://github.com/iSoron/uhabits/commit/82c1ff287
[loop-log]: https://github.com/iSoron/uhabits/blob/dev/CHANGELOG.md
[modes]: https://support.google.com/pixelphone/answer/6111295?hl=en
[nm]: https://developer.android.com/reference/android/app/NotificationManager
[streaks]: https://apps.apple.com/us/app/-/id963034692
[sun-ctx]: https://help.sunsama.com/docs/usage-guides/channels-and-contexts
[td-filt]: https://www.todoist.com/help/articles/introduction-to-filters-V98wIH
[td-gloss]: https://www.todoist.com/help/articles/todoist-glossary-cA60laWMH
[td-loc]: https://todoist.com/help/articles/use-location-reminders-in-todoist-uGcwH2AJ6
[things-guide]: https://culturedcode.com/things/guide/
[tt-folder]: https://blog.ticktick.com/2015/04/11/ticktick-gets-a-brand-new-feature-list-folder/
[tt-tags]: https://blog.ticktick.com/2014/05/23/group-your-tasks-by-using-tags-on-ticktick/
[wp]: https://www.android.com/intl/en_us/enterprise/work-profile/
[wp-dev]: https://developer.android.com/work/managed-profiles
[wp-pause]: https://support.google.com/work/android/answer/7029561?hl=en

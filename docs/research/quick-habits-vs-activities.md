# Quick habits versus activities: naming the split

Researched 2026-11-10 for [#95](https://github.com/Fullchee/journal-native/issues/95), which feeds [#85](https://github.com/Fullchee/journal-native/issues/85).

> **Update 2026-11-17**: the Garmin push is gone ([#135](https://github.com/Fullchee/journal-native/issues/135)). Fitbit data now reaches the app through Health Connect, filtered by `FITBIT_PACKAGE` in `src/core/fitbit-auto-complete.ts`. To switch back to Garmin, set that filter to Garmin Connect's package, `com.garmin.android.apps.connectmobile`. The Garmin parts below describe the removed push.

## Answer

**Call it a Timed Habit, and let `record: duration` be the signal. Add no new field.**

- **The literature calls the time-filling kind an "activity"**: time-use research asks "what were you doing?" and records activities or episodes that fill a stretch of the day. A one-second act has no slot there.
- **Habit apps have no name for the quick kind**: none of them split by how long a habit takes. They split by how you record it: yes/no, a number, or a timer.
- **The nearest app concept is the timer**: Streaks has "timed tasks", and this repo already has `TimedHabit` and `isTimed` for `record: duration`.
- **`record: duration` is the signal**: a Habit worth timing is one that fills time, so it can answer "What were you doing?". Taking a vitamin is a `check`; a walk or a workout is a `duration`.
- **Avoid "activity" as the term**: `activity` already names the Garmin activity Signal (`GLOSSARY.md`, Signal), so a second meaning would collide.

## The question

A Check-in's "What were you doing?" offers every active Habit's name (`useHabitNames` in `src/lib/data/habits.ts`). Some Habits take a second, such as taking a vitamin. Others fill time, such as a walk or a workout. Only the second kind answers the question.

Today a Habit has `record` (`check`, `count` or `duration`) and `targetMinutes`, which is set only for `duration` (`src/core/habits-view.ts`).

## What time-use research calls it

Surveys that ask "what were you doing?" record **activities that occupy time**. Instant acts fall below their grain.

| Method                                                 | Unit                 | What a unit is                                                                                          |
| ------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------- |
| American Time Use Survey (BLS)                         | Primary activity     | "The main activity a respondent was doing at a specified time"; 24 hours of them from 4 a.m.            |
| Day Reconstruction Method (Kahneman et al., 2004)      | Episode              | A scene in the day with a start and an end time; episodes "usually last between 15 minutes and 2 hours" |
| Experience Sampling Method (Csikszentmihalyi & Larson) | Activity at the beep | The main thing you were doing when the pager went off                                                   |

Fit:

- **Duration is the criterion**: each unit has a start and an end. A pill fits no episode and no diary slot.
- **One main thing**: ATUS asks for one main activity when two overlap and drops secondary ones. That matches a Check-in naming one thing you were doing.
- **"Activity" is the field's word**, but the repo already uses it for the Garmin Signal.

## What habit apps call it

No habit app splits Habits by how long they take. They split by how a Habit is recorded.

| App                       | Types                                                                    | Time concept                                                 |
| ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Loop Habit Tracker        | `YES_NO`, `NUMERICAL` (with a free-text `unit`, `AT_LEAST` or `AT_MOST`) | None; minutes are just a unit                                |
| Habitica                  | `habit`, `daily`, `todo`, `reward`                                       | None; types split by schedule and scoring                    |
| Streaks                   | Positive, negative and **timed** tasks                                   | A timed task runs for a set time, such as 10 minutes of yoga |
| Daylio                    | One flat list of "activities" ticked on a mood entry                     | None; "activity" means any tag, a pill included              |
| Toggl Track, Apple Health | Time entry; sample with start and end date                               | Every record has a start and a duration                      |

Fit:

- **Loop and Habitica** map to this repo's `record` and `target`, not to the split.
- **Streaks' timed task** is the closest match, and it is what `record: duration` already is.
- **Daylio** shows the trap: it calls everything an activity, so "taking meds" sits beside "workout". That is the bug #85 reports.
- **Time trackers** record only things that fill time. That is the same criterion as the surveys.

## Is `record: duration` already the signal?

**Yes, with one rule: a Habit that fills time is recorded as `duration`.**

- **Covers both examples**: a vitamin is a `check`; a walk or a workout is timed.
- **Covers `bad` Habits too**: a `duration` ceiling Habit such as scrolling also answers "What were you doing?". That is correct: scrolling is what I was doing.
- **`count` stays out**: a count logs each time something happens, such as a glass of water. Each one is a moment, not a stretch.
- **The edge case is a time-filling Habit kept as a `check`**, such as a walk I only tick. The fix is to switch it to `duration`, which also gives the Check-in a Duration entry to log.
- **Only add a field if that fix fails**: if a time-filling Habit must stay a `check`, add `takesTime: boolean`, backfilled from `record === "duration"`. Wait until a real Habit needs it.

## Options

| Option                                 | Shape                                                              | Pros                                                                            | Cons                                                                        |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Derive from `record` (recommended)** | No schema change; the Check-in lists Habits where `isTimed(habit)` | One concept; the code already names it; a picked Habit can log a Duration entry | A time-filling Habit must be timed to appear                                |
| Boolean field                          | `takesTime: boolean` on `habits`                                   | Independent of how a Habit is recorded                                          | A second fact that can disagree with `record`; a migration and a form field |
| Enum field                             | `scale: "moment" \| "activity"`                                    | Room for more kinds later                                                       | Same as the boolean, plus a word that clashes with the Garmin Signal        |

## What this changes

- **Glossary**: add "**Timed Habit** — a Habit with a `duration` Record. It fills time, so it can answer a Check-in's "What were you doing?". _Avoid_: activity (the Garmin Signal), session."
- **Check-in**: `useHabitNames` keeps only active Timed Habits.
- **Data**: no migration. Before shipping, list active `check` Habits that fill time and switch them to `duration`.
- **Follow-up**: picking a Timed Habit in "What were you doing?" could log a Duration entry instead of a check.

## Sources

- U.S. Bureau of Labor Statistics, [ATUS Handbook of Methods: Concepts](https://www.bls.gov/opub/hom/atus/concepts.htm) (primary and secondary activity) and [Data sources](https://www.bls.gov/opub/hom/atus/data.htm) ("At 4 a.m. yesterday, what were you doing?").
- Daniel Kahneman, Alan B. Krueger, David A. Schkade, Norbert Schwarz and Arthur A. Stone, "A Survey Method for Characterizing Daily Life Experience: The Day Reconstruction Method", _Science_ 306 (2004): 1776-1780, [doi:10.1126/science.1103572](https://doi.org/10.1126/science.1103572).
- Mihaly Csikszentmihalyi and Reed Larson, "Validity and reliability of the Experience-Sampling Method", _Journal of Nervous and Mental Disease_ 175 (1987): 526-536.
- Loop Habit Tracker source: [`HabitType.kt`](https://github.com/iSoron/uhabits/blob/dev/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models/HabitType.kt), [`NumericalHabitType.kt`](https://github.com/iSoron/uhabits/blob/dev/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models/NumericalHabitType.kt), [`Habit.kt`](https://github.com/iSoron/uhabits/blob/dev/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models/Habit.kt).
- Habitica source: [`website/server/models/task.js`](https://github.com/HabitRPG/habitica/blob/develop/website/server/models/task.js) (`tasksTypes`).
- Streaks, [App Store listing](https://apps.apple.com/app/streaks/id963034692) (positive, negative and timed tasks).
- Daylio, [daylio.net](https://daylio.net/) (mood plus activities).
- Toggl Track, [time entries API](https://engineering.toggl.com/docs/api/time_entries); Apple, [`HKSample`](https://developer.apple.com/documentation/healthkit/hksample) (`startDate`, `endDate`).

# What makes a good Android habit tracker

Research for building on HabitNow inside the journal. Single user, Android and web. HabitNow's screens are documented elsewhere; this file compares apps, users, science and Android surfaces. Researched 2026-11-13.

## Answer

- **Score habit strength, don't just count streaks.** Loop's decaying score treats one miss as a dip, not a reset. That matches Lally 2010: one missed day did not hurt habit formation.
- **Forgive by design.** Skip, rest days and streak freezes are the most praised features. Punishment (Habitica damage, reset-to-zero) is the most common complaint.
- **Logging must take one tap from outside the app.** Widgets and notification actions are what Loop and HabitNow users praise most. Auto-completion from Health Connect removes the tap entirely.
- **Cues beat reminders.** Reminders drive repetition but slow automaticity (Stawarz 2015). Ask "after what?" and fade reminders as a habit matures.
- **Keep one Habit model; leave chores to Todoist.** A separate "recurring task" type earns its keep only when the app is also the to-do list. See [Habit vs recurring task vs task](#habit-vs-recurring-task-vs-task).

The journal already has most of this: Skip with a cause, Freeze, Repair, Rest mode, Opt-out, Seasons, Stage, Cue and Health Connect auto-logging (`GLOSSARY.md`). The gaps are flexible frequencies, notification Done actions and a habit widget. See [Ranked feature list](#ranked-feature-list).

## Feature comparison

### Habit types and scheduling

| App                                   | Platforms                  | Habit types                                                                                         | Scheduling                                                                                                     |
| ------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **HabitNow** ([Play][p-habitnow])     | Android                    | Yes/no, numeric, timer (stopwatch, countdown, interval), checklist                                  | Daily, weekly, monthly goals; fixed days; "some days per period"; repeat every N days                          |
| **Loop** ([repo][loop-repo])          | Android                    | Yes/no; measurable with a unit and an **at least** or **at most** target ([code][loop-habit])       | One rule: **X times per N days** ([code][loop-freq]). Covers daily, 3/week, every other day. No fixed weekdays |
| **Habitica** ([Play][p-habitica])     | Android, iOS, web          | Habits (+/− counters), Dailies (with checklists), To-dos                                            | Dailies repeat daily, weekly on chosen days, monthly or yearly, every N                                        |
| **TickTick** ([help][tt-habit])       | Android, iOS, web, desktop | "Complete all" (one tap); amount with **Auto** (fixed step per tap) or **Manual** (type the amount) | Daily on chosen days, N times a week, custom intervals ([blog][tt-blog-2020])                                  |
| **Habitify** ([help][hf-checkin])     | Android, iOS, web          | Good habits with a goal in times, minutes or custom units; timer and Pomodoro; bad habits           | Daily, weekly, monthly and yearly goals ([weekly][hf-weekly], [yearly][hf-yearly])                             |
| **everyday** ([Play][p-everyday])     | Android, iOS, web          | Yes/no; "break habit" chains for bad habits                                                         | Daily board                                                                                                    |
| **Way of Life** ([App Store][as-wol]) | iOS only                   | Yes / No / **Skip** per day, with notes; good and bad habits                                        | Daily                                                                                                          |
| **Streaks** (Crunchy Bagel)           | iOS only                   | Check, timed and negative tasks; auto-complete from Apple Health                                    | Daily, N per week, fixed days                                                                                  |

HabitNow's types come from its Play listing (timer, daily/weekly/monthly goals) and the app itself. Way of Life and Streaks have no Android build; they matter as design references only.

### Logging, model and money

| App             | Reminders                                                                       | Widgets                                                                             | Streak / score model                                                                     | Stats                                                       | Backup / export                                                                  | Price                                                             |
| --------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **HabitNow**    | Many per habit, notification or alarm                                           | Yes                                                                                 | Streaks                                                                                  | Charts per habit, calendar, daily notes                     | Local backup; cloud backup is Premium ([privacy][habitnow-privacy])              | Free tier limited; one-time Premium ([privacy][habitnow-privacy]) |
| **Loop**        | One per habit; **check or dismiss from the notification** ([README][loop-repo]) | Several; also shown on unlock                                                       | **Habit strength score** (decay) plus streaks                                            | Score, history, calendar, frequency                         | CSV and SQLite export; Tasker; no sync (closed as not planned, [#702][loop-702]) | Free, GPLv3, no ads                                               |
| **Habitica**    | Per Daily                                                                       | Yes                                                                                 | Missed Dailies **deal HP damage**; per-Daily streak; Rest in the Inn / Pause Damage      | RPG levels, little else                                     | Data export                                                                      | Free with ads; subscription                                       |
| **TickTick**    | Many per habit; habits appear on the calendar timeline                          | Today's habits, heat map ([help][tt-habit])                                         | Streak; back-fill a missed day from the monthly table                                    | Check-in overview, monthly table, per-check-in mood and log | Account sync                                                                     | Free; Premium subscription for the wider app                      |
| **Habitify**    | Per habit                                                                       | List, 7/14/30-day chain, heatmap; tap opens a check-in sheet ([changelog][hf-2025]) | Streak; **Skip** (planned day off) vs **Fail** (planned but missed) ([help][hf-checkin]) | Rich; mood                                                  | Cloud account                                                                    | Free for 3 habits; tiered subscription ([pricing][hf-pricing])    |
| **everyday**    | Yes                                                                             | Yes                                                                                 | Chains; current vs longest streak                                                        | Completion rates                                            | Cloud account                                                                    | Free + Premium                                                    |
| **Way of Life** | Custom messages                                                                 | n/a (iOS)                                                                           | Chains; Skip keeps a chain                                                               | Trends over weeks to years                                  | Export is Premium                                                                | Free for 3 habits                                                 |

### Loop's data model, worth copying

Loop is open source, so its model is the one we can read rather than guess ([`models/`][loop-models]).

- **`HabitType`**: `YES_NO` or `NUMERICAL`. A numerical habit has `unit`, `targetValue` and `targetType` (`AT_LEAST` or `AT_MOST`).
- **`Frequency`**: a fraction, `numerator / denominator` repetitions per days. Daily is 1/1, 3× a week is 3/7.
- **`Entry` values**: `YES_MANUAL`, `YES_AUTO` (not due today, so filled in), `NO`, `SKIP`, `UNKNOWN`. Tapping cycles yes → skip → no → unknown.
- **Score formula** ([`Score.kt`][loop-score]): each day, `multiplier = 0.5 ^ (√frequency / 13)`, then `score = previous × multiplier + completion × (1 − multiplier)`.
  - **Half-life is 13 / √frequency days**: 13 days for a daily habit, about 34 days for a weekly one.
  - **Completion** is the share of the target met inside a rolling window of `denominator` days ([`ScoreList.kt`][loop-scorelist]). A numerical habit gets partial credit.
  - **Skip freezes the score**: skipped days are left out of the window entirely.
  - **Non-daily yes/no habits double the window** (3/7 becomes 6/14) to smooth uneven weekdays.

## What users praise and complain about

Reddit itself blocks fetching, so this draws on an aggregate of 243 Reddit reviews across 27 subreddits ([GummySearch][gummy]), store reviews and vendor help forums.

### Praised

- **Loop's no-limits, offline, open model**: "free, doesn't have restrictions on how many habits or skips you can add" ([GummySearch][gummy]). It's the top AlternativeTo alternative to HabitNow ([AlternativeTo][alt-habitnow]).
- **Strength score over streak**: a few misses after a long run don't erase progress ([Loop README][loop-repo]).
- **Widgets**: Loop's "great widgets" come up repeatedly ([GummySearch][gummy]). Habitify rebuilt its Android widgets in 2025 after complaints ([changelog][hf-2025]).
- **HabitNow's scheduling and timers**: reviewers single it out for advanced scheduling plus timers, and for a one-time price instead of a subscription.
- **Skip as a first-class state**: Way of Life users sum it up as "mark yes/no/skip for the day and jot down notes" ([r/getdisciplined][wol-reddit]).

### Complained about

- **Streak anxiety and reset-to-zero**: one miss wipes a visible number, and people quit the app. This is the abstinence-violation ("what the hell") effect from relapse research (Marlatt & Gordon, 1985). Vendor posts cite large quit numbers, but none trace to a primary study; treat them as anecdote.
- **Punishment**: Habitica's HP damage pushes users to the Inn or to "Pause Damage", or to fake checklists that excuse a Daily ([wiki][habitica-inn]).
- **No skip or rest day**: users ask for skips on recurring tasks in plain to-do apps ([Akiflow][akiflow-skip]).
- **Friction to log**: needing to tap Done after a HabitNow timer finishes is a noted quirk. TickTick users find amount-per-week goals awkward ([r/ticktick][tt-reddit]).
- **Data lock-in and paywalls**: subscription-only sync, 3-habit free caps (Habitify, Way of Life), and Habitify silently dropping Health Connect in 2025 ([changelog][hf-2025]).
- **Rigid units**: Habitify can't switch a goal from km to hours after creation, and ties the timer to the unit ([feedback][hf-units]).

## Behaviour science that should shape features

| Principle                                | Evidence                                                                                                                                                                                                                                                | Feature it implies                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Habits form on a curve, not a count**  | Lally 2010: automaticity rises steeply, then plateaus. Median 66 days to 95% of plateau, range 18–254 (39 of 82 participants fit the model). **Missing one opportunity did not materially affect formation** ([BPS summary][bps-lally], [paper][lally]) | A decaying strength score (Loop-style). Never show "Day 1" after a single miss.                                   |
| **Never miss twice**                     | Clear: "One mistake is just an outlier. Two mistakes is the beginning of a pattern" ([Clear][clear-second])                                                                                                                                             | Flag the second consecutive miss, not the first. The journal's Repair already rewards the comeback.               |
| **Cues beat reminders**                  | Stawarz, Cox & Blandford 2015 (CHI, 4 weeks): reminders supported repetition but **hindered** habit development; event-based cues raised automaticity. Of 115 apps, none supported event cues ([UCL][stawarz])                                          | Ask "after what?" when creating a Habit. Fade reminders as Stage advances; tree Habits never ring.                |
| **Implementation intentions**            | "If X, then I will Y" plans: d = 0.65 over 94 tests (Gollwitzer & Sheeran 2006). A 2024 update with 642 tests is smaller after bias correction (d ≈ 0.15–0.35) ([summary][ii-summary])                                                                  | A when and where on every Habit. The journal's Cue, usual time and spot already cover this.                       |
| **Tiny habits and celebration**          | Fogg: "Behavior happens when Motivation, Ability, and a Prompt come together at the same time" ([behaviormodel.org][fogg-bmap]). Recipe: after my anchor, I will do a tiny behaviour, then celebrate ([Tiny Habits][fogg-tiny])                         | A "minimum version" target, an anchor field, and a moment of celebration on Done (see `check-in-celebration.md`). |
| **Forgiveness keeps people going**       | Duolingo says Streak Freezes keep learners going "even when they need to skip a day or two", and lets them hold two ([Duolingo][duo-streak]). Churn numbers quoted online are unsourced                                                                 | Freezes, outside Skips and Rest mode, already in the journal.                                                     |
| **Positive reinforcement alone is weak** | Stawarz 2015 found it ineffective for habit formation ([UCL][stawarz])                                                                                                                                                                                  | Badges and confetti are decoration, not the engine. Spend effort on cues and low friction instead.                |

## Habit phases, reminder fading and decay

Researched 2026-11-22 for Stage (#34). Every claim below was checked against the paper itself unless marked **unverified**.

### Phases: named stages over a continuous curve

| Source                                                  | What it says                                                                                                                                                                                                                                                        | Limits                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Gardner, Lally & Wardle 2012** ([BJGP][gardner-bjgp]) | Three phases. **Initiation**: pick the behaviour and its context. **Learning**: repeat it in that context to strengthen the link. **Stability**: "strength has plateaued, so that it persists over time with minimal effort or deliberation." Expect about 10 weeks | A GP-facing essay, not a study. The phases describe Lally 2010's curve; no test shows discrete stages |
| **Lally & Gardner 2013** ([HPR][lally-gardner])         | Review of strategies to initiate a behaviour, support context-dependent repetition, and build automaticity. Same three steps                                                                                                                                        | **Unverified** beyond the abstract                                                                    |
| **Baretta et al. 2025, HabitWalk** ([PMC][habitwalk])   | Daily SRBAI over 105 days. Habit trajectories were "highly idiosyncratic" and "only seldom characterized by asymptotic growth." Repetition raised habit strength, not the reverse                                                                                   | N = 24 inactive Swiss adults; one behaviour (a cued 15-minute walk)                                   |
| **Lally 2010** (already above)                          | Only 39 of 82 participants fit the smooth curve                                                                                                                                                                                                                     | See the table above                                                                                   |

- **Phases are a description, not a mechanism.** Habit strength rises on a curve that varies by person.
- **Missing many days lowers the plateau.** The BPS summary of Lally 2010 says misses, "even if spread out over time, had a cumulative effect" ([BPS][bps-lally]). **Unverified** against the paper.

### Reminders build dependency; fading is untested

| Source                                                          | Finding                                                                                                                                                                                                                                                                              | Limits                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Renfree et al. 2016** ([CHI EA][renfree], [PDF][renfree-pdf]) | Lift users relied on reminders and streaks: "ongoing use was required to maintain behaviors." All 16 stopped using the app at some point. During non-use, several dropped their habits; one said they "collapsed." Time-only reminders were often ignored when the context was wrong | 16 interviews, one iOS app. Observational: support was never removed on purpose |
| **Pinder et al. 2018** ([TOCHI][pinder])                        | Design guideline: reminders "should decrease over time as behavioural automaticity emerges to avoid technological dependence." A habit persists only if its cues don't include the app                                                                                               | A theory review. The guideline is not tested                                    |
| **Klasnja et al. 2019, HeartSteps** ([ABM][heartsteps])         | Walking suggestions raised 30-minute steps by 107% at the start of the study. The effect shrank over 6 weeks                                                                                                                                                                         | N = 44; outcome is steps, not automaticity                                      |
| **Stawarz 2015** (already above)                                | Reminders support repetition but hinder automaticity                                                                                                                                                                                                                                 | See the table above                                                             |

- **No study tests a fading schedule.** Searches found no trial of gradual thinning, contingent "only if not done" reminders, or timing.
- **A registered pilot tests withdrawal** of a cue-based app ([NCT04691596][nct-cued]). No results were found.

### How established habits break

| Source                                                                                                | Finding                                                                                                                                                                               | Limits                                                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Wood, Tam & Witt 2005** ([JPSP][wood-2005], [PDF][wood-pdf])                                        | Students moving university kept exercise, newspaper and TV habits "only when aspects of the performance context did not change." Once cues changed, intentions guided behaviour again | 115 transfer students; self-report one month before and after        |
| **Verplanken & Roy 2016** ([JEP][verplanken-roy])                                                     | Habit discontinuity hypothesis: an intervention worked better on people who had moved recently. The window lasted about three months after the move                                   | 800 participants; self-reported frequency of 25 green behaviours     |
| **Judah, Gardner & Aunger 2013** ([BJHP][judah]), as summarised in Gardner 2015 ([HPR][gardner-2015]) | Flossing automaticity "partially eroded six months after cessation of a habit formation procedure." Gardner calls habit decay "underexplored"                                         | N = 50, exploratory                                                  |
| **Edgren, Baretta & Inauen 2025** ([ABM][edgren])                                                     | When people tried to drop a habit, daily SRBAI fell on a decelerating curve. It levelled off after 1 to 65 days                                                                       | N = 194; deliberate breaking of bad habits, not drift from good ones |

- **Context change breaks habits fastest.** Renfree's users lapsed after holidays, moves, new jobs and babies.
- **Drift is slower and less studied.** Gains erode partly after support stops; many misses lower the plateau.

### Measuring automaticity

- **SRBAI** (Gardner, Abraham, Lally & de Bruijn 2012, [IJBNPA][srbai]): "[Behaviour X is something…]" "I do automatically", "I do without having to consciously remember", "I do without thinking", "I start doing before I realise I'm doing it."
- **Validity**: it correlates r = .92 with the 12-item SRHI (k = 45, N = 11,257). Alpha was .80 or higher in 40 of 45 tests.
- **Frequency is a partial proxy.** Habit strength tracks frequency only "where associated contexts are consistently encountered and remain stable." Frequency items "can inflate habit-behaviour associations."
- **Behaviour logs miss the cue.** Gardner 2015 notes frequency-times-stability measures "assess the likelihood that habit has formed, not the automaticity" ([HPR][gardner-2015]).
- **A one-item check exists.** Gardner 2012's patient tool asks weekly how automatic it feels, from 1 to 10 ([BJGP][gardner-bjgp]).

### Self-monitoring after a habit forms

| Source                                          | Finding                                                                                                                             | Limits                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Michie et al. 2009** ([Health Psych][michie]) | Self-monitoring explained the most variation between studies (13%). With another control-theory technique, d = 0.42 vs 0.26         | 122 evaluations, N = 44,747; diet and activity                 |
| **Harkin et al. 2016** ([Psych Bull][harkin])   | Monitoring goal progress raised goal attainment, d = 0.40. Effects were larger when progress was physically recorded or made public | 138 RCTs, N = 19,951; mostly short-term                        |
| **Samdal et al. 2017** ([IJBNPA][samdal])       | Goal setting and self-monitoring predicted effects at 12 months and beyond                                                          | 48 RCTs in adults with obesity                                 |
| **Wing et al. 2006** ([NEJM][wing])             | A daily self-weighing programme cut weight regain over 18 months. 72% of controls regained 2.3 kg or more, vs 46% face-to-face      | N = 314 after weight loss; weighing is an outcome, not a habit |
| **Kwasnicka et al. 2016** ([HPR][kwasnicka])    | 100 theories explain maintenance through motives, self-regulation, resources, habits and environment                                | Theory synthesis, no effect sizes                              |

- **No study tested stopping tracking of an automatic habit.** The nearest evidence is Renfree (lapses after leaving the app) and Wing (regain without weighing).

### Implications for Stage

- **Named stages: yes, as labels.** Seed maps to initiation, sprout and plant to learning, tree to stability. Present them as a reading of a continuous score, not real thresholds.
- **Strength as the gate: necessary, not enough.** Strength measures consistent repetition, which drives habit. It can't see the cue or automaticity.
- **Add a time floor and a one-tap check.** Require about 66 days (Lally's median) before tree. At promotion, ask the SRBAI or the 1–10 item once.
- **Tree stops ringing: supported.** Reminders build dependency and lose effect. Thin them through plant rather than cutting them all at tree.
- **Tree can't be logged: not supported.** Self-monitoring is the strongest maintenance technique found. Without logs, Strength can't detect decay.
- **Instead, take trees off Today, but keep them loggable.** Auto-logging, the log box and an occasional check keep the signal at zero routine input.
- **Fall back on context change and on decay.** Drop a tree to plant after a move, trip, new job or Rest mode. Also drop it when Strength falls below a lower threshold than the one that promoted it, then resume reminders.

## Android surfaces

| Surface                            | What the platform allows                                                                                                                                                                                                               | Use in a habit tracker                                                                                                                        | Journal today                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Home-screen widget**             | One primary use case per widget ([design guide][w-design]). Android 12+ widgets hold real checkboxes and switches ([enhance][w-enhance]). Periodic refresh at most every 30 min; push an update after each change ([Glance][w-glance]) | A "due today" list with tap-to-check; a heatmap for one Habit. Redraw on every log, not on a timer.                                           | Check-in, Alarms and Log widgets (`modules/journal-android`). No habit checklist widget                    |
| **Notification actions**           | Up to **three action buttons**, handled by a `BroadcastReceiver` without opening the app. Direct reply takes text ([notifications][n-build]). Android 13+ needs `POST_NOTIFICATIONS`                                                   | **Done** and **Skip** on each reminder, as Loop does. A reply field for a count or minutes.                                                   | Alarms ring but have no Done action; ongoing alarms never reach the watch ([wear-os.md](wear-os.md))       |
| **Quick Settings tile**            | For frequent, fast actions; at most two per app; not for launching the app or showing info only. `requestAddTileService()` prompts to add one on Android 13+ ([tiles][qs-tiles])                                                       | "Log the current Timed Habit" start/stop toggle, or one pinned Habit. Low priority.                                                           | None                                                                                                       |
| **Wear OS**                        | Bridged phone notifications keep their actions; a Tile needs Kotlin                                                                                                                                                                    | Done from the wrist, for free, once notifications carry actions.                                                                              | Planned in [wear-os.md](wear-os.md)                                                                        |
| **Health Connect auto-completion** | Records for steps, exercise sessions, sleep, hydration, mindfulness, weight and more. Background and >30-day reads need extra permissions ([data types][hc-types])                                                                     | Mark a Habit done when a matching record lands: a walk from steps, meditation from a mindfulness session, a workout from an exercise session. | Calm via Health Connect (`calm-auto-log.android.ts`); Hevy via the Worker. Both are **Auto-logged** Habits |

## Habit vs recurring task vs task

### How apps split them

| App          | Habit                                                                                   | Recurring task                                                                    | One-off task      |
| ------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------- |
| **HabitNow** | Repeats; tracked with streaks, stats and a score                                        | Repeats; no tracking or stats                                                     | Once; no tracking |
| **TickTick** | A separate module you switch on; check-ins, goals, streaks, heat map ([help][tt-habit]) | A task with a repeat rule, in the task lists                                      | A task            |
| **Lunatask** | Streaks, auto-placed on the calendar; daily-ish schedules                               | Richer rules (monthly, every few weeks); no streaks ([docs][lunatask])            | A task            |
| **Loop**     | Everything is a Habit                                                                   | n/a                                                                               | n/a               |
| **Todoist**  | n/a                                                                                     | Every repeat is a recurring due date ([help][todoist-recur]); no per-task history | A task            |

HabitNow's split shows in its create dialog; AlternativeTo lists "Habit Tracker" and "Recurring Tasks" as separate features ([AlternativeTo][alt-habitnow]). No HabitNow help page explains the reasoning.

### Why they split

- **Different questions**: a habit asks "how consistent am I?"; a chore asks "is it done?". Stats on "take out the recycling" are noise.
- **Different failure handling**: a missed habit is history; a missed chore stays **overdue** until done.
- **Different schedules**: chores need "every 3 months" or "first Monday"; habit trackers keep frequencies simple so a score or streak makes sense (Lunatask states this trade-off directly).
- **Different home**: TickTick hides habits behind a tab switch so a to-do-first user isn't faced with streaks.

### Trade-offs for a single-user tracker

| Option                                               | Gain                                                                              | Lose                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Split into three types** (HabitNow, TickTick)      | Clean stats; chores never dilute a score; each type gets the right controls       | Three create flows; deciding the type up front; moving an item between types loses or forks history |
| **One Habit model only** (Loop)                      | One list, one log, one history; a chore can graduate to a habit with no migration | Every item pays for stats and streaks; complex chore schedules don't fit                            |
| **Recurring tasks only** (Todoist)                   | Best scheduling; overdue semantics                                                | No consistency signal, no score, no skip with a reason                                              |
| **One model, tracking as a property** (Griply-style) | One flow; hide stats per item; same Today list                                    | One flag to explain, and code that branches on it                                                   |

### Recommendation

**Keep one Habit model, and keep chores in Todoist.**

- **The journal already chose this**: a One-off is a Habit (ADR 0012), and `GLOSSARY.md` lists "task, to-do, errand" under _Avoid_.
- **Todoist already owns chores**: Plan the day triages Todoist tasks into Blocks. A second recurring-task store would split that planning.
- **"No tracking" already has homes**: a tree Habit leaves the tracker, and an Auto-logged Habit leaves Today. Add a no-Streak property only if a real Habit needs one.
- **Revisit if** the owner starts logging chores in the journal instead of Todoist. Then add a `tracked: false` property, not a new type.

## Ranked feature list

Ranked within each tier, most valuable first. "Journal" shows what `GLOSSARY.md` and the code already have.

### Must have

| #   | Feature                                                                   | Why                                                     | Journal                                                            |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | **One-tap logging off-app**: Done and Skip on reminder notifications      | Friction is the top complaint; Loop's most loved detail | Missing: alarms have no actions                                    |
| 2   | **Forgiving misses**: Skip with a reason, rest days, freezes              | Lally 2010; streak anxiety                              | Done: Skip cause, Freeze, Repair, Rest mode, Opt-out, Season       |
| 3   | **Yes/no, count and duration types**, each with a minimum or a limit      | Every leading app has them                              | Done: `record` check, count, duration; `good` minimum, `bad` limit |
| 4   | **Flexible frequency**: daily, fixed weekdays, N per week                 | Table above                                             | Done                                                               |
| 5   | **History you can read at a glance**: hit rate plus a calendar or heatmap | Most-used stats view in every app                       | Partly: History has bars and periods; no calendar heatmap          |
| 6   | **Own your data**: backups and export                                     | Lock-in complaints                                      | Done: weekly encrypted D1 backups                                  |

### Nice to have

| #   | Feature                                                                   | Why                                           | Journal                                   |
| --- | ------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| 1   | **Habit widget**: due-today checklist with tap-to-check                   | Second most praised logging path              | Missing                                   |
| 2   | **Strength score** (Loop formula, skips freeze it)                        | Rewards consistency; no cliff after a miss    | Done: Strength on History and the card    |
| 3   | **More frequencies**: N per month, every N days                           | HabitNow and Loop support them                | Missing                                   |
| 4   | **Health Connect auto-complete** for more Habits (steps, sleep, exercise) | Zero routine input (AGENTS.md failure log)    | Partly: Calm and Hevy                     |
| 5   | **Back-fill a missed day** from a calendar                                | TickTick, Loop; forgetting to log ≠ not doing | Partly: the log entry screen takes a date |
| 6   | **Quick Settings tile** for a Timed Habit                                 | Fast start/stop                               | Missing                                   |

### Differentiators

These come from the journal itself; no compared app does them.

1. **Cue-first Habits that shed reminders as they mature.** Stage drives alarm fading, following Stawarz 2015. No app reviewed does this.
2. **Skip and Reschedule causes for a coach.** Outside vs avoidance turns a habit log into a useful signal.
3. **Habits linked to Check-ins and Goals.** "What were you doing?" and mood tie habits to how the day felt, which standalone trackers can't do.
4. **Opt-out and Season Habits.** Dragon boat counts as done unless skipped, and only in season. No app compared has either.
5. **The log box.** One typed sentence logs several Habits; no tapping through lists.

[akiflow-skip]: https://akiflow.featurebase.app/p/skip-option-and-streak-metrics-for-recurring-tasks
[alt-habitnow]: https://alternativeto.net/software/habitnow/about/
[as-wol]: https://apps.apple.com/us/app/-/id393159800
[bps-lally]: https://bps.org.uk/research-digest/how-form-habit
[clear-second]: https://jamesclear.com/second-mistake
[duo-streak]: https://blog.duolingo.com/how-duolingo-streak-builds-habit
[edgren]: https://doi.org/10.1111/aphw.12612
[fogg-bmap]: https://behaviormodel.org/
[fogg-tiny]: https://tinyhabits.com/
[gardner-2015]: https://doi.org/10.1080/17437199.2013.876238
[gardner-bjgp]: https://doi.org/10.3399/bjgp12X659466
[gummy]: https://gummysearch.com/tools/best-products/habit-tracker/
[habitica-inn]: https://habitica.fandom.com/wiki/Rest_in_the_Inn
[habitnow-privacy]: https://habitnow.app
[habitwalk]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11635918/
[harkin]: https://doi.org/10.1037/bul0000025
[hc-types]: https://developer.android.com/health-and-fitness/guides/health-connect/plan/data-types
[heartsteps]: https://doi.org/10.1093/abm/kay067
[hf-2025]: https://feedback.habitify.me/changelog/fitbit-integration-new-expended-widgets-habitify-for-windows
[hf-checkin]: https://intercom.help/habitify-app/en/articles/9387661-check-in-on-a-good-habit
[hf-pricing]: https://feedback.habitify.me/changelog/new-tiered-pricing
[hf-units]: https://feedback.habitify.me/p/decouple-tracking-logic-from-goal-units
[hf-weekly]: https://intercom.help/habitify-app/en/articles/9728009-how-to-track-a-weekly-habit
[hf-yearly]: https://intercom.help/habitify-app/en/articles/12469189-how-to-track-a-yearly-habit
[ii-summary]: https://www.thebehavioralscientist.com/glossary/implementation-intentions
[judah]: https://doi.org/10.1111/j.2044-8287.2012.02086.x
[kwasnicka]: https://doi.org/10.1080/17437199.2016.1151372
[lally-gardner]: https://doi.org/10.1080/17437199.2011.603640
[lally]: https://doi.org/10.1002/ejsp.674
[loop-702]: https://github.com/iSoron/uhabits/issues/702
[loop-freq]: https://github.com/iSoron/uhabits/blob/dev/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models/Frequency.kt
[loop-habit]: https://github.com/iSoron/uhabits/blob/dev/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models/Habit.kt
[loop-models]: https://github.com/iSoron/uhabits/tree/dev/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models
[loop-repo]: https://github.com/iSoron/uhabits
[loop-score]: https://github.com/iSoron/uhabits/blob/dev/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models/Score.kt
[loop-scorelist]: https://github.com/iSoron/uhabits/blob/dev/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models/ScoreList.kt
[lunatask]: https://lunatask.app/docs/features/habits
[michie]: https://doi.org/10.1037/a0016136
[n-build]: https://developer.android.com/develop/ui/views/notifications/build-notification
[nct-cued]: https://clinicaltrials.gov/study/NCT04691596
[p-everyday]: https://play.google.com/store/apps/details?id=com.everydaycheckmobile
[p-habitica]: https://play.google.com/store/apps/details?id=com.habitrpg.android.habitica
[p-habitnow]: https://play.google.com/store/apps/details?id=com.habitnow
[pinder]: https://doi.org/10.1145/3196830
[qs-tiles]: https://developer.android.com/develop/ui/views/quicksettings-tiles
[renfree-pdf]: https://research-information.bris.ac.uk/en/publications/dont-kick-the-habit-the-role-of-dependency-in-habit-formation-app/
[renfree]: https://doi.org/10.1145/2851581.2892495
[samdal]: https://doi.org/10.1186/s12966-017-0494-y
[srbai]: https://doi.org/10.1186/1479-5868-9-102
[stawarz]: https://discovery.ucl.ac.uk/id/eprint/1468224/
[todoist-recur]: https://www.todoist.com/help/articles/introduction-to-recurring-due-dates-YUYVJJAV
[tt-blog-2020]: https://blog.ticktick.com/2020/05/22/a-healthier-life-with-ticktick-habit/
[tt-habit]: https://help.ticktick.com/articles/7055781896457814016
[tt-reddit]: https://www.reddit.com/r/ticktick/comments/1hmryxc/weekly_monthly_habits
[verplanken-roy]: https://doi.org/10.1016/j.jenvp.2015.11.008
[w-design]: https://developer.android.com/design/ui/mobile/guides/widgets
[w-enhance]: https://developer.android.com/develop/ui/views/appwidgets/enhance
[w-glance]: https://developer.android.com/develop/ui/compose/glance/glance-app-widget
[wing]: https://doi.org/10.1056/NEJMoa061883
[wol-reddit]: https://www.reddit.com/r/getdisciplined/comments/1igicn7/an_effective_simple_daily_habit_tracker_way_of
[wood-2005]: https://doi.org/10.1037/0022-3514.88.6.918
[wood-pdf]: https://dornsife.usc.edu/wendy-wood/wp-content/uploads/sites/183/2023/10/Wood.Tam_.GuerreroWitt.2005_Changing_circumstances_disrupting_habits.pdf

# HabitNow: screens and features

A screen-by-screen record of HabitNow (`com.habitnow`, Android), so the journal can build its habit tracker on HabitNow's ideas. Explored on an emulator with Premium unlocked, 2026-11-06 to 2026-11-20. Screenshots are in [`habitnow/`](habitnow/).

For the comparison with other trackers, behaviour science and Android surfaces, see [What makes a good Android habit tracker](habit-tracker-best-practices.md).

## Answer

- **Three activity types share one list.** Habit (tracked, with stats), Recurring Task (repeats, no stats) and Task (one-off). All of them show on Today, sorted by priority and then time.
- **Four ways to measure a habit.** Yes/No, Numeric, Timer and Checklist. Each type gets its own log dialog, but they share the circle, the long-press sheet and the stats.
- **Logging works from outside the app.** The notification has DONE, DISMISS and POSTPONE buttons, and a Premium widget can tick items off.
- **Flexible frequencies.** Specific weekdays, month days or year days, N per week, month or year, every N days, alternate days, and "Flexible" (shown each day until done).
- **Goals above the daily one.** Extra goals (weekly, monthly, yearly, all-time, single-time) appear in the log dialog and in Statistics.
- **Filter lists** group activities (by type and category) for Today, Habits and the widget.
- **The data is open.** CSV export is one row per activity per day. The `.hn` backup is plain text.

## Activity types

Tap the `+` button on Today: `01-launch.png`.

| Type           | App's description                                         |
| -------------- | --------------------------------------------------------- |
| Habit          | Repeats over time, with detailed tracking and statistics. |
| Recurring Task | Repeats over time, without tracking or statistics.        |
| Task           | Single instance, no tracking over time.                   |

## Creating a habit

The wizard has 4 steps, with dots at the bottom.

1. **Category**, `05-category.png`: 14 defaults (Quit a bad habit, Art, Meditation, Study, Sports, Entertainment, Social, Finance, Health, Work, Nutrition, Home, Outdoor, Other). The free tier allows 5 custom categories.
2. **Evaluation**, `03b.png` and `c46-eval.png`: "WITH A YES OR NO", "WITH A NUMERIC VALUE", "WITH A TIMER", "WITH A CHECKLIST" (Premium).
3. **Define**: the fields depend on the type.
4. **Frequency**, then **When**.

### Define step by type

| Type      | Fields                                                                                                                                                                     | Logged by                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Yes/No    | Name, description.                                                                                                                                                         | Tapping the circle cycles Pending, Done (tick), Fail (red X), Pending.                                       |
| Numeric   | Name, condition (At least / Less than / Exactly / Any value), goal, unit, "a day", description, Extra goals. Live example: "Go running. At least 3 miles a day." `08c.png` | Stepper dialog: − / value / +, with "0 / 3 km" progress. `28-log-numeric.png`                                |
| Timer     | As Numeric, but the goal is an `00:00` h/m/s picker.                                                                                                                       | h/m/s dialog with a goal strip and a stopwatch icon that opens the Timer tab. An unfinished day shows `...`. |
| Checklist | Name, "Item name" rows with "ADD ITEM", "Success condition": **All items** or **Custom** ("N item(s)"), description. `c89-cl-define.png`                                   | A sheet of items to tick. Today shows `1/2`.                                                                 |

### Frequency

- Every day.
- Specific days of the week.
- Specific days of the month: 1–31 plus "Last", or "Use days of the week". `13-radioSomedaysMonth.png`
- Specific days of the year.
- Some days per period: N days per WEEK, MONTH or YEAR. `13-radioSometimes.png`
- Repeat every N days, `13-radioRepeat.png`, with "Alternate days" (N days on, M days off). `14-alternate.png`
- **Flexible** switch: "It will be shown each day until completed."

### When

`16-when.png`: start date, optional end date (a date, or N days), Time and reminders, Priority.

- **Reminder**, `19-new-reminder.png`: a time (Material picker, or typed via the keyboard icon). Type is Don't remind, Notification or **Alarm**. Schedule is Always enabled, Specific days of the week, or N days before.
- **Priority**, `23-priority.png`: an integer stepper, default 1. A higher number sorts first.

### Extra goals

`09-extra-goals.png`. Saving one failed on the free tier; it works with Premium.

- Five rows: **Weekly**, **Monthly**, **Yearly**, **All time**, **Single time**. Each starts as "No goal" with a `+`.
- The dialog has a condition (At least / Less than / Exactly, no "Any value") and a goal, then CANCEL / CONFIRM. A set row reads "At least 20:00" and has a trash icon.
- In Edit, each row also has a "Goal history" icon.
- **Where they show**: arrows in the log dialog cycle "Today 00:00 / 05:00" and "Weekly goal 00:00 / 20:00". Statistics totals read "00:05 / 20:00".

### Celebration and tutorial

- **After the first save**: a 4-page gesture tutorial. Tap completes or updates. Long-press opens reminders, notes and stats. Hold the icon to drag. Swipe right sets priority; swipe left edits.
- **First Done**: "Well done!" with a medal, "New best streak 1 day", "Next Award: 7 days", then SHARE / CLOSE. The "Show Awards" setting turns it off.

## Recurring Tasks and Tasks

- **Recurring Task wizard**: Category, then Yes/No or Checklist only, then "Define your task" (name, "Note (optional)"), then the habit's Frequency and When steps. It has no Extra goals and no stats.
- **Task** is one form, not a wizard, `c137-task-form.png`. Fields: name, Category (default "Task"), Date (default "Today"), Time and reminders, Checklist (subtasks), Priority, Note, and a **"Pending task"** switch ("It will be shown each day until completed.", on by default). The edit form adds Delete.
- **Tasks tab**: sub-tabs **Single tasks** (grouped by date) and **Recurring tasks** (name plus a frequency chip). Empty state: `c272-tasks-empty.png`.
- **Recurring task sheet**, `c118-recurring-options.png`: Calendar, Edit, Archive, Delete. It has no Statistics.
- **Archive icon** (top right) switches the list to "Archived". An archived item offers Unarchive.

## Today screen

`27-today-run.png`, `29-run-logged.png`

- **Week strip**: tap a day to view it. The **calendar icon** opens a month picker with CLOSE / TODAY.
- **Row**: category icon, name, logged value ("4 km"), type chip, reminder time, status circle.
- **Long-press**, `30-longpress.png`: a sheet with the day's value and goal (or Pending / Done / Fail), reminders, Add note, Skip, Reset entry, and Calendar / Statistics / Edit.
- **Swipe right**: a flag tile, then "Set a priority" (− / `1` / +, a "Default - 1⚑" chip, CLOSE / OK).
- **Swipe left**: a pencil tile, then Edit.
- **Drag to reorder**: hold the icon about 2 s. The row lifts but snaps back when the sort criteria fix the order (see [Settings](#settings)).
- **`?`** replays the gesture tutorial.
- **Search**: a type spinner (All / Habits / Tasks), a category picker and a name field, plus pin (keep filters), trash (clear) and close. Searching with type "Tasks" returned nothing, even though a matching task existed; the cause is unknown.
- **Premium pill**: floats bottom-left and can be dismissed.

### Filter lists

- **First use** shows an explainer: "sets of filters designed to organize your activities into smaller, manageable groups", with examples like routines, goal lists and shopping lists.
- **Chip row** under the week strip: the main list, "New list", settings, `?` and close.
- **New list**: a name, an icon, **Activities** (All / Habits / Tasks), and **Categories** (multi-select with a "Hide selection" switch to exclude them).
- **Limits**: the free tier allows 3 lists. The same lists filter the Habits tab and the widget.

## Habits tab

`33-habits-tab.png`

- **Card**: name, category icon, frequency chip, and the last 7 days as tappable circles. Grey is before the start date; a green ring is done; amber is in progress. Below are the streak, the success % (`-` until a period ends), then Calendar, Statistics and `⋮`.
- **`⋮` sheet**: Calendar, Statistics, Edit, **Archive**, **Delete**.
- **Archive icon** (top right) switches the title to "Archived", with slim cards showing only streak and %. **Unarchive** asks "Do you want to select a new end date?", because archiving sets an end date.
- **Start date**: days before it can't be logged. Moving it warns "Entries recorded before the new date will be deleted."

### Habit detail: Calendar, Statistics, Edit

- **Calendar**, `46-cal-filled.png`: a month grid. Green means the goal was met, red means logged below the goal, amber means no entry, and grey-blue means skipped. The streak and dated notes sit below.
- **Statistics**, `35-stats.png`, `37-stats3.png`, `49-successfail.png`:
  - **Habit score** ring, 0–100. It is weighted over time, not a plain %: it fell to 14 after the start date moved back a month with sparse entries.
  - **Streak**, current and best. An "N days per week" habit counts its streak in weeks.
  - **Totals** and Times completed, for this week, month, year and all time.
  - **Bar chart** by Week, Month or Year, as a Total or a Daily average.
  - **Success/Fail donut**: "Successful periods" vs "Incomplete periods".
  - **Streak challenge badges**: 1, 5, 15, 25, 50, 75… periods.
- **Edit**, `39-edit.png`: every wizard field, plus Archive, **Restart habit progress** and Delete habit. Restart asks "Confirm restart the habit progress?", then wipes the entries and keeps the habit.

## Timer

`c273-timer-clean.png`. It opens from the drawer, the bottom tab, or a Timer habit's log dialog.

- **Header**: vibrate and sound switches. The app remembers the last mode.
- **Stopwatch**: START, then PAUSE, then RESUME and STOP. While it runs, a notification offers Resume and Stop.
- **Countdown**: hour, minute and second pickers.
- **Intervals** (Premium):
  - **Rows**: each is `mm:ss`, optionally tagged "Break". "ADD INTERVAL" opens `c03-add-interval.png`; tap a row to edit it.
  - **Presets**: save (overwrite one, or "SAVE AS NEW TIMER") and load, `c19-load-list.png`. Built in: "Pomodoro", "Pomodoro (short)", "Pomodoro (intensive)".
  - **Loops**: "0 = Infinite", default 1.
- **Activity link**: "No activity selected" picks a habit. When the timer stops, a dialog shows "Total time".
  - **Timer habit linked**: it offers "Save time record", which adds the time to today's progress.
  - **Other habits**: it offers Pending / Done / Fail.
  - **Any habit**: "Save time as note" is also offered.
- **Last record**: shown below the timer, and can be reassigned to another activity or deleted.

## Logging from outside the app

### Notifications

- **Notification reminder**, `c230-notif-actions.png`: the habit name and time, with **DONE**, **DISMISS** and **POSTPONE**. DONE marks it Done. There is no Skip or Fail button.
- **Alarm reminder**, `c232-alarm.png`: a heads-up banner with **DISMISS** and **SNOOZE**, and no Done button. It goes full-screen only on a locked screen with the full-screen permission granted; that case was not tested.
- **Snooze length**: set in Settings (10 min default).

### Widgets

| Widget                   | Size  | Look                                |
| ------------------------ | ----- | ----------------------------------- |
| List Widget              | 3 × 2 | Light list                          |
| Compact List Widget      | 3 × 2 | Dark, compact rows                  |
| Premium Dark List Widget | 3 × 2 | Dark, with category-coloured bars   |
| New Task                 | 1 × 1 | A `+` tile that opens the Task form |

- **Settings**, `c240-widget-settings.png`: a filter list, theme (Light / Dark / System), a compact switch and opacity (default 90%).
- **Placed widget**, `c243-widget-home.png`: "Today • <list>", a `+` add-task button, `<` `>` to change the day, a pencil to reconfigure, and one row per activity.
- **Check-off** (Premium), `c244-widget-tap.png`: tapping a circle marks the item Done.

## Drawer and Settings

`50-drawer.png`. The drawer holds News and events, Categories, Timer, Customize, Settings, Account and Backups, Get premium, Rate and Contact. The Settings index: `51-settings.png`, `c252-settings.png`.

### Settings

- **To-do and Habit lists**, `54-todo-habits.png`, `c275-todo-habit.png`: Sorting options, first day of the week, hide completed ("Send to bottom"), text size, swap tap and long tap, vibration, collapse habit cards, animations, awards, show priorities.
- **Sorting options**, `c101-sort.png`: a First and a Second criterion per group.

  | Group                     | Default (First / Second)   | Options                                                                    |
  | ------------------------- | -------------------------- | -------------------------------------------------------------------------- |
  | To-do list order          | By priority / By time      | By priority, By time, Alphabetical, By category, Tasks first, Habits first |
  | 'Habits' section          | By priority / Alphabetical | By priority, By time, Alphabetical, By category                            |
  | 'Recurring tasks' section | By priority / Alphabetical | Same four                                                                  |
  | Checklist sorting         | By priority / Alphabetical | By priority, Alphabetical, Creation date                                   |

- **Notifications and Alarms**, `56-notifs.png`:
  - Separate Android channels for notifications and alarms, and a snooze interval.
  - "Remind even when completed".
  - A daily-agenda notification (08:00) and "remind me to use the app" (20:00).
  - Reprogram reminders, the full-screen alarm permission, and "Reminders are not working" help.
- **Customize**, `58-set-569.png`, `c264-customize.png`, `c265-light-theme.png`:
  - Theme: Light, Dark or System; Ultra Dark is Premium.
  - Category icon style: Classic or Simple.
  - Accents: 4 free colours and 30 Premium ones, some two-tone. Changes apply at once, with no confirmation.
- **Lock Screen**, `c254-lock.png`, `c255-pin.png`: a PIN, entered twice, with the warning "If you lose your PIN you will have to reset the application data." Fingerprint is Premium. The unlock screen was not tested.
- **Language**, `c253-language.png`: English, Español, Português, Deutsch, Italiano, Français, 한국어, 日本語, and "System language".

### Data export and backups

- **CSV export**, `c259-csv.png`:
  - **Scope**: "Activity entries" (filtered by type, list or activity) or "Activities", with an optional date range.
  - **Header**: `"ID","Activity name","Date","State","Goal type","Goal","Value","Unit","Note","Checklist"`.
  - **Rows**: one per activity per day, every field quoted. `Date` is `M/D/YY`.
  - **Values**: State is Done, Fail, Pending or In progress. Timer values are `mm:ss`. Checklist rows append item and state pairs.
  - **Example**: `"44","Test focus","11/20/26","In progress","At least","05:00","00:05","","",""`.
- **Local backup**, `58-set-863.png`: `HabitNow Backup <date>.hn`, plain unencrypted text.
  - **Structure**: sections split by `{`, rows by `|`, fields by `;`.
  - **Sections (inferred)**: C categories, H habits, S checklist items, X entries, R reminders, O extra goals, F filter lists, P timer presets.
- **Cloud backup** needs sign-in plus Premium. The quotas: 5 imports and 3 uploads a day. It keeps all habit entries, plus scheduled tasks and the last 30 days of completed tasks. Auto backup is Premium.

### Categories

`62-categories.png`: a grid with an entry count per category and a "NEW CATEGORY" button. Default categories can be edited only with Premium.

### News and events

`c268-news.png`, `c269-news-card.png`: cards such as "HabitNow Tracking Starter Pack", which hold habit templates ("Daily water intake", "Exercise regularly") with `+`. Adding one requires accepting the template terms; that step was not tested.

## Premium

`60-premium.png`, `60b.png`: $8.99 one-time (list price $17.99).

- **Free tier**: 7 habits and recurring tasks, unlimited tasks, 5 custom categories, 3 filter lists, one CSV export.
- **Premium adds**: checklists, unlimited everything, widget check-off, the interval timer, cloud backup, fingerprint lock, and extra themes and accents.

## Not tested

- **Lock PIN**: setting one and the unlock screen. A wrong PIN wipes the app data.
- **Full-screen alarm**: needs a locked screen.
- **Templates**: adding one from News.
- **Statistics for other types**: Yes/No and Checklist habits.
- **Calendar**: the one for recurring tasks.

## Re-checking a screen

`habitnow/snap.sh <name>` takes a screenshot and prints the UI nodes with bounds; tap with `adb shell input tap X Y`. The emulator's HabitNow holds the owner's real habits. Test on items named `Test …`, delete them afterwards, and commit only screenshots without real names.

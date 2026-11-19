# Handoff: document HabitNow's UI and features

## Goal

The owner likes HabitNow (`com.habitnow`, Android) and wants to build their own habit tracker on top of its ideas, inside journal-native.

Deliverable: `docs/research/habitnow.md`, a screen-by-screen record of HabitNow's UI and features, and what makes it a good tracker. Link the screenshots in this folder.

Related, already done: [`docs/research/habit-tracker-best-practices.md`](../habit-tracker-best-practices.md). It compares Android habit trackers, covers behaviour science, Android-specific features, and habit vs recurring task vs task. Don't repeat it; link it.

## Status

- **Done**: habit-creation wizard, numeric habit logging, habit card, calendar, statistics, edit screen, side drawer, most of Settings, paywall, Categories.
- **Not done** (owner will log in with their Premium account first, which unlocks the rest):
  1. Timer tab (countdown, stopwatch, Premium interval timer).
  2. Yes/no, timer and **checklist** (Premium) habits: creation and logging.
  3. Recurring Task and Task creation flows; the Tasks tab (Single / Recurring sub-tabs).
  4. Today screen: swipe right (priority) and swipe left (edit), drag-to-reorder, search, filter lists, the calendar icon, `?` help.
  5. Habits tab: `⋮` more menu, archive, "Restart habit progress", the download/archive icon top right.
  6. Home-screen widgets (list widget; Premium lets you check off from it).
  7. Notification actions: does a reminder offer Done/Skip buttons?
  8. Settings: Language, Lock PIN flow, "Sorting options" criteria, CSV export format, backup file format.
  9. News and events, Customize (theme/accent colours).
  10. Extra goals (weekly/monthly/yearly/all-time/single-time): setting one failed to save; retry with Premium.

## Findings so far

Screenshots are in this folder; filenames below.

### Activity types (FAB `+` on Today) — `01-launch.png`

| Type           | App's description                                         |
| -------------- | --------------------------------------------------------- |
| Habit          | Repeats over time, with detailed tracking and statistics. |
| Recurring Task | Repeats over time, without tracking or statistics.        |
| Task           | Single instance, no tracking over time.                   |

### New-habit wizard (4 steps, dots at the bottom)

1. **Category** — `05-category.png`. 14 defaults (Quit a bad habit, Art, Meditation, Study, Sports, Entertainment, Social, Finance, Health, Work, Nutrition, Home, Outdoor, Other). Free tier: 5 custom categories.
2. **Evaluation** — `03b.png`. Yes/No; Numeric value; Timer; Checklist (Premium).
3. **Define** — `08c.png`. Name, condition (At least / Less than / Exactly / Any value), goal, unit, "a day", description, Extra goals (`09-extra-goals.png`: weekly, monthly, yearly, all-time, single-time). Timer type swaps goal for `00:00`. Live example text, e.g. "Go running. At least 3 miles a day."
4. **Frequency** — Every day; Specific days of the week; Specific days of the month (1–31 + "Last", option "Use days of the week") `13-radioSomedaysMonth.png`; Specific days of the year; N days per WEEK/MONTH/YEAR `13-radioSometimes.png`; Repeat every N days `13-radioRepeat.png` with "Alternate days" (N activity × M rest) `14-alternate.png`.
   - **Flexible** toggle: "It will be shown each day until completed."
5. **When** — `16-when.png`. Start date, optional end date (date or N days), Time and reminders, Priority.
   - Reminder `19-new-reminder.png`: time; type Don't remind / Notification / **Alarm**; schedule Always / Specific weekdays / N days before.
   - Priority `23-priority.png`: integer stepper, default 1; higher sorts first.

After the first save, a 4-page gesture tutorial: tap = complete/update; long-press = reminders, notes, stats; hold icon to drag; swipe right = priority, swipe left = edit.

### Today screen — `27-today-run.png`, `29-run-logged.png`

- Week strip of days; tap a day to view it.
- Row: category icon, name, logged value ("4 km"), type chip, reminder time, status circle on the right.
- Tap a numeric habit → stepper dialog with − / value / + and "0 / 3 km" progress (`28-log-numeric.png`).
- Long-press → bottom sheet (`30-longpress.png`): today's value and goal, reminders, Add note, Skip, Reset entry, and Calendar / Statistics / Edit buttons.
- "Premium" pill floats bottom-left, dismissible.

### Habits tab — `33-habits-tab.png`

- One card per habit: name, frequency chip, last 7 days as tappable circles, streak, success %, Calendar / Stats / `⋮` buttons.
- Days before the start date are greyed out and can't be logged. Moving the start date warns "Entries recorded before the new date will be deleted."

### Habit detail: Calendar / Statistics / Edit tabs

- **Calendar** `46-cal-filled.png`: month grid. Green = goal met, red = logged below goal, amber = no entry, grey-blue = skipped. Streak below; notes list with dates.
- **Statistics** `35-stats.png`, `37-stats3.png`, `49-successfail.png`:
  - Habit score ring (0–100). It fell to 14 after back-dating the start a month with sparse entries, so it's weighted over time, not a plain %.
  - Streak (current/best). For an "N days per week" habit, it counts in **weeks**.
  - Total of the unit and Times completed, for this week / month / year / all.
  - Bar chart, by Week/Month/Year, Total or Daily average.
  - Success/Fail donut, by period ("Successful periods" vs "Incomplete periods").
  - Streak challenge badges: 1, 5, 15, 25, 50, 75… periods.
- **Edit** `39-edit.png`: every wizard field, plus Archive and "Restart habit progress".

### Drawer and Settings — `50-drawer.png`, `51-settings.png`

- Drawer: News and events, Categories, Timer, Customize, Settings, Account and Backups, Get premium, Rate, Contact.
- **To-do and Habit lists** `54-todo-habits.png`: sorting criteria (to-do list, Habits, Recurring tasks), first day of week, hide completed (send to bottom), text size, swap tap/long-tap, vibration, collapse habit cards, animations, awards, show priorities.
- **Notifications and Alarms** `56-notifs.png`: separate Android channels for notifications and alarms; snooze interval (10 min); remind even when completed; daily-agenda notification (08:00); "remind me to use the app" (20:00); reprogram reminders; full-screen alarm permission; "Reminders are not working" help.
- **Customize** `58-set-569.png`: dark theme, Ultra Dark (Premium), icon style Classic/Simple, accent colours.
- **Lock screen**: PIN; fingerprint is Premium.
- **Backups** `58-set-863.png`: cloud upload/import (sign-in plus Premium), auto cloud backup (Premium), local backup file export/import, CSV export (one free use).

### Premium — `60-premium.png`, `60b.png`

$8.99 one-time (list price $17.99). Free tier: 7 habits/recurring tasks, unlimited tasks, 5 custom categories, 3 filter lists. Premium adds checklists, unlimited everything, widget check-off, interval timer, CSV, cloud backup, fingerprint, extra themes.

### Categories — `62-categories.png`

A grid with an entry count per category; "NEW CATEGORY" button; default categories are editable only with Premium.

## How to drive the emulator

- Emulator `emulator-5554`, 1080×2400. Launch: `adb shell monkey -p com.habitnow -c android.intent.category.LAUNCHER 1`.
- `snap.sh <name>` in this folder: takes a screenshot and prints UI nodes with bounds and resource-ids. Tap the centre of a node's bounds with `adb shell input tap X Y`.
- Gotchas:
  - Wait about 3s after each tap. Screen transitions animate, and early screenshots catch half-drawn frames.
  - `uiautomator dump` can return a stale file, so `snap.sh` deletes `/sdcard/ui.xml` first.
  - Numeric dialog: the value field is pre-selected. Tap `+` (≈800,1150) instead of typing.
  - Layouts shift when a radio expands, so look up bounds by resource-id before tapping.
  - Don't drive the emulator while the owner is using it; they did once mid-session.
- Test data in the app: one "Run" habit (Sports, numeric ≥3 km, 3 days/week, starts 2026-10-01, a few November entries, one skip, one note). Delete it or reuse it.

## Suggested skills

- `/research`: format and source standards for `docs/research/*.md`.
- `/frontend-ui-engineering` or `/impeccable`: when turning findings into journal-native screens. `apps/native/DESIGN.md` and `PRODUCT.md` hold the design system.
- `/domain-modeling`: map HabitNow terms (Recurring Task, Flexible, Extra goals, Habit score) onto `GLOSSARY.md` terms before ticketing.
- `/grilling`: decide which HabitNow features journal-native should adopt.

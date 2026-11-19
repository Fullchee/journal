# Logging Habits from Google Calendar events

Research for #145: log some Habits from the events already on the owner's Google Calendar. The owner reviews the day in the evening and marks events that didn't happen. Researched 2026-11-16.

## Answer

Link a Habit to one or more **calendar event series**. The evening review lists the day's events from those series. The owner confirms them or marks a Skip, and only confirmed rows are stored.

| Choice                               | Pick                                                                         | Why                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **How to match an event to a Habit** | Series ID (`recurringEventId`) plus calendar ID                              | Titles drift ("🧘True Peace Meditation" vs "🧘True Peace online Meditation"). A moved or renamed instance keeps its series ID. |
| **How many series per Habit**        | Many                                                                         | Nine meditation series feed one Habit.                                                                                         |
| **When to read Google**              | On demand, when the review opens                                             | No cron, no events table. `searchEvents` already lists one calendar's events with `singleEvents=true`.                         |
| **What to store**                    | Only confirmed Duration entries, keyed by a unique `calendar_event_id`       | The Hevy sync's `hevy_workout_id` pattern: re-confirming is idempotent.                                                        |
| **"Didn't do it"**                   | A **Skip** with its cause (outside or avoidance)                             | Reuses Skip, so History, Streaks and the coach's avoidance flags work unchanged.                                               |
| **Default per link**                 | "Assume done" or "Ask"                                                       | Commitments (a booked class) default to done; drop-in options (daily Zoom sits) default to not logged.                         |
| **No review that day**               | "Assume done" events log on their own the next day; "Ask" events log nothing | Follows the zero-routine-input rule: a default plus one optional tap (`AGENTS.md` failure log, #126).                          |
| **After confirming**                 | Locked                                                                       | A later calendar edit or deletion never rewrites a confirmed day.                                                              |

## The owner's recurring events

Six weeks around 2026-11-16, read through the claude.ai Google Calendar connector. The personal calendar holds 138 events in that window.

| Calendar event series                                                              | Calendar    | Count     | Suggested Habit                                                 |
| ---------------------------------------------------------------------------------- | ----------- | --------- | --------------------------------------------------------------- |
| Morning / Evening Meditation on Zoom                                               | personal    | 29 / 20   | New: **Group meditation** (default "Ask")                       |
| MBSR, Pape, True Peace (in person and online), CEC, Theravada, Mindful Pause, UCLA | personal    | 1–10 each | **Group meditation**                                            |
| 💪 120 Parl workout                                                                | shared FuYi | 14        | **Group condo gym workouts (dragon boat)**, already Auto-logged |
| 🏃 Albert x Fullchee Run, TAG Workout                                              | personal    | 2–8 each  | **Exercise**                                                    |
| Pilates at Jimmie Simpson                                                          | shared FuYi | 5         | **Exercise**                                                    |
| Support groups                                                                     | personal    | 1–3 each  | New Habit, if the owner wants one                               |
| Commutes, Drive to Scarden Park, Update Spreadsheet, birthdays                     | personal    | —         | Not Habits                                                      |

Public calendars the owner subscribes to (Wake Up Toronto, MPC Events) list every session, attended or not. The owner copies the ones they plan to attend onto the personal calendar ("Bike to Multi Faith Centre"), so link the personal copies.

## Deleted instances

Deleting one instance of a recurring event can mean three things, so a deletion never logs a Skip by itself.

| Why it was deleted            | Example                          | What the review offers                   |
| ----------------------------- | -------------------------------- | ---------------------------------------- |
| **Cancelled by someone else** | The organizer cancels a sit      | Skip, cause pre-filled as **outside**    |
| **The owner chose not to go** | Deleted 120 Parl on a low day    | Skip, cause asked (outside or avoidance) |
| **Calendar cleanup**          | Removed a Zoom sit never planned | Nothing (the default)                    |

- **Google API**: a default listing omits a deleted instance. With `showDeleted=true` it comes back with `status: "cancelled"`, its `recurringEventId` and its `originalStartTime`.
- **Who deleted it**: `organizer.self` is false on a calendar someone else owns, so the deletion came from them. On the owner's own calendars, only the owner deletes, so the review asks.
- **Does it matter**: a Habit due that day counts a deletion without a Skip as a miss, as any not-done due day does today. On an N-times-a-week Habit, one deletion changes nothing.
- **Review layout**: deleted instances sit in a "Removed from calendar" section that logs nothing unless tapped.

## Gaps

- **Scope**: the Worker's token (`scripts/setup-google-calendar.sh`) has `calendar.events` and `calendar.freebusy`. `calendar.events` reads events on any calendar by ID, including the shared FuYi calendar. A picker that lists the owner's calendars and series needs `calendar.calendarlist.readonly` too, so the owner re-runs the setup script once.
- **Work calendar**: "Shockwave Hill Runs" is on the work Google account, which the Worker cannot read. Copy it to the personal calendar or leave it out.
- **Hevy overlap**: never link a series to the Habit the Hevy sync logs (`HEVY_HABIT`, "Lift weights"), or one workout logs twice.
- **Time zone**: some FuYi instances carry `timeZone: "UTC"` with a `-04:00`/`-05:00` offset. Place an entry on its Toronto Day from the offset timestamp (`torontoDay`), never from the `timeZone` field.

## Rejected

- **Title keyword match**: breaks on renames and emoji edits, and catches unrelated events.
- **Cron that logs every matched event**: logs drop-in sessions the owner never attended and leaves no place to say "didn't happen".
- **Mirroring all events into D1**: a second copy of the calendar to keep in sync, for no gain over reading on demand.

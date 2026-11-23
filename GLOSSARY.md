# Glossary

The app's vocabulary. Use these terms word for word in code, UI copy and docs.

## The roll-up

- **Ladder** — the close workflows as a whole. Each rolls one period's material up into the next: Check-ins → week → quarter → year.
- **Rung pattern** — the invariant every close workflow obeys: it finalizes its own period's note **and** emits a summary into the level above.
- **Close out** — to finalize a period's note. What a close workflow does to the period that just ended.
- **Weekly retro** — the weekly Reflection written at the weekly close. The material a quarterly review skims instead of reconstructing.

## Core

- **Day** — a Toronto calendar day, midnight to midnight, wherever I am. Every Check-in, Habit check, Duration entry, Streak and close belongs to one Day.
  _Avoid_: local date, device day
- **Signal** — a trend from a wearable: sleep, activity (steps, intensity minutes, resting heart rate and stress per day) or workouts (each recorded ride, run and so on, with its type, start time and duration). A Signal is shown only when it has data.
- **Screen time** — screen-on minutes per Day: each device (both phones, both Macs) sends its own after a one-time setup, and the app shows the total across devices. Totals only, never per app. An idle screen counts until it sleeps. A Target can measure it as the average Day.
  _Avoid_: usage, phone time, device time
- **Fitbit session** — one workout the Fitbit watch recorded, uploaded from Health Connect when the app opens: its type, title, start Day, duration and, when Fitbit wrote Distance during it, its km. Manual Fitbit logs are not Fitbit sessions.
  _Avoid_: activity, exercise log
- **Team challenge** — the dragon boat team's Pull up and Cardio Challenge: a Google Sheet the whole team logs to, one tab of pull-up sets scored in APE and one of cardio scored in REK. My rows come from Fitbit sessions and Hevy sets; `/api/team-challenge` turns them into rows to log, and `/log-shockwave-pull-ups-and-cardio` writes them after I approve. The sheet, not the journal, keeps the score.
  _Avoid_: workout sheet, challenge log
- **Goal** — a durable, forward-looking **direction**: the _where-to + why_ that Habits (the _how_) point toward. Holds: direction, felt **why**, **state** (active, achieved or retired), an optional **parent Goal** it _serves_ (any depth, about three levels encouraged), the Habits that serve it, "what movement looks like" prose and at most one optional **Target**. Without a Target it is directional and never graded; a second number is a child Goal. Weekly review _surfaces_ it; quarterly and yearly review revise it.
- **Target** — the measurable part of a Goal: a **measure** (the summed times or minutes of Habits that serve the Goal, a Signal, or Screen time), an optional number, a minimum or a **limit**, and a period: repeating weekly or monthly, or one **deadline**. With no number it is an **open Target**, shown as a trend. It shows progress ("95 / 150 min this week"), never pass or fail, and never touches a Habit's Streak, Strength or History hits. Different from a Habit's **Frequency**, which is its schedule.
- **Keep, Adjust, Let go** — the Weekly review's three answers to a Target whose period ended short: keep the number, change it, or drop it so the Goal is directional again. At a deadline, **Achieved** is a fourth. Nothing else prompts about a Target.
- **Pillar** — one of the six lifestyle-medicine pillars (sleep, activity, connection, substances, stress, nutrition), each a top-level Goal marked by its `pillar` field, not its title. Its **Pillar bar** scores the last 7 Days 0–100, full at "enough" and never past it: a guideline line for sleep, activity and connection, the linked Habits' own Frequency or Limit for the rest. Separate from the Pillar Goal's Target, which shows plain progress. Shown on Notes (Goals) and the Weekly review only; never a total, never on Today or in the Session brief.
- **Health plan** — the support layer that sits on top of Storm to Sun: who helps me and when to ask for more. It holds only the support team and next actions; history lives in Health records, and coping habits are Habits. Written so it can be used while in Storm: readable in under a minute, with one action at a time, and other people do the heavy lifting where possible.
  _Avoid_: care plan, wellness plan
- **Health record** — one document behind the Health plan: Medical History, a visit's prep, Finding a Coach.
  _Avoid_: medical note, history page
- **Check-in** — one Storm to Sun reading: a zone, a score and a timestamp, plus optional **details** added after saving: where I was, what I was doing (typed in the log box, so Enter also logs it as a Habit), how I felt (a feeling word, plus the quadrant: pleasant or unpleasant, high or low energy), who was in control and which Parts were present, a note, and three rows, **Tense**, **Low** and **Tired**, each None, Some or A lot. An untouched row is no answer, not None. **Tired but wired** is a Check-in with Tense and Tired both A lot; it has no chip of its own.
  _Avoid_: mood entry, log
- **Part** — one side of me, such as the Worry wolf or the Doer, with its own page: a name, a **role** (manager, firefighter, exile, protector when it guards but its kind isn't clear yet, or unknown), what it wants for me, what it fears would happen if it stopped, where I feel it in my body, and a description of how it shows up. A Check-in names the one **in control** (a Part, or **Self**, which is not a Part) and the Parts **present**, by reference to the Part. A Part is retired, never deleted, so past Check-ins keep it.
  _Avoid_: persona, mood, voice
- **Place guess** — the place pre-filled on a Check-in when the place is empty, learned only from my past Check-ins. A past Check-in within 150 m of the GPS reading wins at any age, preferring the place I usually log at this time. With none nearby, a place logged at least twice in the last 90 days within an hour of this time, on the same kind of day (weekday or weekend), wins. A new guess replaces only the previous guess, never a place I picked. A Check-in moved more than an hour from when it was saved loses its GPS reading.
  _Avoid_: location, geocode
- **Session brief** — a walkthrough of the week's Check-ins, written for my coach: highs, lows, patterns, what helped, and one thing to raise. Part of the Health plan layer. Not the Weekly retro, which is my own reflection and feeds the quarterly review.
  _Avoid_: coaching summary, weekly report
- **Habit** — an action or how-to: a name, description, usual when, its **Places**, a **kind**, a **stage**, a **Frequency**, a **cue**, a **record** style and the Goals it serves. The felt why lives on the Goal it serves. Checked off in the Habit tracker. The only type for actions and how-tos, One-offs included.
  _Avoid_: routine, goal, practice, tool, guide, strategy, technique
- **Places** — the Check-in places where a Habit can be done, such as Home or Gym, picked from the same list as "Where were you?". No Places means anywhere. Different from the Habit's usual **spot** (such as Bedroom or Smart phone), which is free text in the habit loop sentence.
  _Avoid_: location, context, tag
- **Reference Habit** — a Habit with no Frequency: a framework or how-to (Storm to Sun, Working Without Freezing) held as prose. Never in the Habit tracker; listed in the Library. Research that backs it sits under its `## Research` heading.
- **Library** — the view of reference Habits, one list by name.
- **Backlog** — Habits I'm not working on now (inactive). Off the Habit tracker until I make them active.
- **Auto-logged** — a Habit an import logs for me, such as Hevy workouts or Insight Timer sessions as Duration entries. Off Today, since there is nothing to tick; still on the Habits tab with its history.
  _Avoid_: automated, synced
- **Opt-out** — a recurring Habit that counts as done on each due day unless I Skip it, such as Dragon boat practice. It counts once its time passes, or at the end of an untimed day; a Duration Habit logs its usual length. Stays on Today so I can Skip.
  _Avoid_: auto-logged, default done
- **Calendar link** — a Habit's link to one recurring event series on my Google Calendar, such as the 120 Parl workout, with a default: **assume done** (a commitment I booked) or **ask** (a drop-in I may skip). Several series can feed one Habit; a series feeds one Habit. Matched by the series, never by the event's title.
  _Avoid_: calendar sync, event rule
- **Evening review** — the day's events from linked series, to confirm in one tap. Assume done ones start ticked, ask ones unticked; unticking one offers a Skip. Events I deleted from the calendar sit under "Removed from calendar" and log nothing unless I tap them. Confirming logs each ticked event (a Duration entry, or the day's check) and locks the day: later calendar edits never change it. A day I don't review logs its assume done events the next morning. It never overrides a Day already answered, a Skip included. Below them, **Other events** lists the Day's primary-calendar events no series links; tapping "Didn't: delete" deletes one from Google Calendar at once, with no confirm. Today shows the review's row from 5 PM.
  _Avoid_: day review, end-of-day sync
- **Tiny version** — the smallest form of a good recurring Habit, written once and optional, such as "Put on running shoes" for Run 5 km. When the Day's newest Check-in is Rain or Storm, Today shows it under the Habit's row as "Tiny: …". Doing it is an ordinary Done: the same hit for the Streak, History and Strength. Bad Habits, One-offs and Reference Habits have none.

- **Season** — a date range when a recurring Habit is due, such as dragon boat from about April to October. I start and end it on the day; Today asks whether it started from two weeks before last year's start. Outside a Season the Habit isn't due: its Streak neither grows nor breaks and no alarm rings. A single Season ends a Habit for good.
  _Avoid_: active period, end date
- **Kind** — good (a habit I want) or bad (a habit I'm trying to stop). A good Habit's Frequency is a minimum; a bad Habit's is a **limit**: every day allows one log a day, N times a week N logs that week.
- **Problem** — a bad Habit I bring to a coach. Not a separate type: the bad Habits.
  _Avoid_: issue, symptom
- **Stage** — a recurring good Habit's growth in the garden metaphor, read from its Strength: **seed** (below 50%, just started), **sprout** (50–80%, taking hold), **plant** (80% and up, mostly steady) and **tree** (automatic: it leaves Today and stops ringing, but stays loggable). A Habit becomes a tree only when I answer yes to "Do you do this without thinking?", asked once its Strength reaches 95% and it is at least 66 days old. A tree falls back to its Strength's Stage after a Rest mode, when its Season starts again, or when I tap Slipped. One-offs, Reference Habits and bad Habits have no Stage.
  _Avoid_: level, phase
- **Frequency** — how often a Habit is due: every day, N times a week on any days, N times a month on any days, fixed weekdays, every N days, once (a One-off) or never (a Reference Habit). A bad Habit's Frequency is called its **limit**. **N× a month** counts the Toronto calendar month, as N× a week counts the Monday-to-Sunday week, so its Streak and History count months. **Every N days** is due on the start date and every N days after it, like fixed weekdays; doing it on another day moves nothing.
  _Avoid_: target, schedule
- **Cue** — what a Habit comes after, its anchor (Fogg), asked as "After what?": **Scheduled** (its time of day), a stacked Habit, a previous action, an emotional state or people, from Duhigg's habit loop. A Scheduled cue needs a time; a Habit with any other cue may still have a usual time.
  _Avoid_: trigger
- **One-off** — a Habit due once: one thing I plan to do for myself on one date, such as a run or a portaging trip. It holds a name, a date and an optional why, without the habit loop. It shows on Today from its date and stays **overdue** until I mark it done or not done, or Reschedule it.
  _Avoid_: task, to-do, errand, event
- **Reschedule** — moving a One-off to a new date. Each one keeps the old date and a **cause**: **outside** (weather, a cancellation, someone else's plans) or **avoidance** (I put it off), plus an optional note. My coach sees every Reschedule, with the avoidance ones flagged.
  _Avoid_: postpone (Plan the day's word for Todoist tasks), snooze, defer
- **Skip** — choosing not to do a recurring Habit on a day, with a **cause** like a Reschedule's: **outside** or **avoidance**, plus an optional note. On a recurring Habit, Skip replaces Not done: a Skip with no cause is a plain not-done day. An outside Skip keeps a **Streak** going for free; an avoidance Skip, or one with no cause, counts as a missed day. My coach sees avoidance Skips flagged, as with Reschedules. Logging the Habit later that Day replaces the Skip.
  _Avoid_: snooze, miss, excuse
- **Streak** — the number of due days in a row I did a recurring good Habit (for every N days, its due days); for a Habit due N times a week or a month, the number of weeks or months in a row I met N. Days the Habit isn't due neither grow nor break it. A separate **Check-in Streak** counts days with at least one Check-in. A day covered by a Freeze, an outside Skip or Rest mode keeps a Streak from breaking but adds nothing. My **longest Streak** never goes down. One-offs, Reference Habits and bad Habits have none. The Session brief never shows it.
  _Avoid_: chain, run
- **History** — how a recurring Habit went since its start date, one period at a time: a due day (for every N days, each due day), or a week or a month for a Habit due N times a week or a month (hit means the period met N). It shows hits, misses and the hit rate, the last 7 periods as bars and every period, newest first. A Skip of either cause, a Rest mode day, a day outside a Season and today or this week while still open count as neither; a not-done day without a Skip is a miss. A bad Habit's History shows how many times it was logged instead, never hit or missed. One-offs and Reference Habits have none. Opened by tapping a Habit on the Habits tab; kept out of the Session brief, like the Streak.
  _Avoid_: record, log, stats
- **Strength** — how established a recurring Habit is, from 0 to 100%, read from its History periods with Loop Habit Tracker's decaying score: each hit moves it toward 100% and each miss toward 0%, so one miss is a dip, not a reset. A Skip, a Rest mode day, a day outside a Season, an open period and a tree's day without a log freeze it. A bad Habit's period is a hit when it stayed within its limit. Shown as "Strength 64%" on History and as a thin bar on the Habit card's details; never red. Kept out of the Session brief, like History.
  _Avoid_: score, habit score, consistency
- **Freeze** — a free credit that covers one missed due day of a Habit's Streak, used automatically. Each Habit starts with 2, earns 1 per 7 done due days in a row and holds at most 3.
  _Avoid_: streak freeze, shield
- **Repair** — restoring a Habit's latest broken Streak by doing it on 2 due days within 7 days of the break; the Streak becomes the old count plus the done days since.
  _Avoid_: restore, recover, earn back
- **Rest mode** — a pause of 1 to 30 days that I start and can end early from Settings. Every Streak neither grows nor breaks, Freeze earning pauses and Habit reminders stay quiet; a Habit I still do adds to its Streak.
  _Avoid_: vacation mode, pause, holiday
- **Record** — how a Habit's occurrences are logged: **check** (once a day), **count** (each time) or **duration** (each **Duration entry**, against a minutes-a-day bar: a minimum for good, a limit for bad).
- **Duration entry** — one timed occurrence of a duration Habit: a Day, a start time, minutes and an optional one-line **note** on what the time was spent on, such as "Android wrapper" under Side projects. A day's count and total come from its entries. A Habit check takes the same note.
  _Avoid_: session, stint, log
- **Alarm** — an optional field on a Habit: a time and a kind, **alarm** (rings at alarm volume with the phone's alarm sound, or one song the owner picks for every alarm on that phone) or **persistent** (quiet). It rings in the Android app only, titled with the Habit's name, and stays in the notification shade until tapped. Its Postpone rings it again 10 minutes later unless the Day is logged first. It rings on a fixed-weekday Habit's weekdays, on each due day of an every-N-days Habit (one ring per day, with no row in the alarms widget) and every day for daily, N-times-a-week and N-times-a-month Habits. Tree, Backlog and Reference Habits don't ring.
  _Avoid_: reminder (as a UI label), timer
- **Silenced alarm** — one Habit's Alarm turned off for today by hand, from its row on Today before its time, without logging the Day. It holds for that Day only and lives on the phone. A Day already logged (Done, a met count, Not done or a Skip) is silent on its own. Either way the Alarm rings again on the next due day.
  _Avoid_: snooze, mute
- **Connection** — one person I want to stay close to: a name, how we met and who introduced us, a **closeness**, the **Circles** we share, how often to reach out, one-person meetups (where, on which weekdays and from what time I usually see just them; the Android app reminds me 30 minutes before a timed one), what to ask about next time, their important dates (a yearly one may have no year), links to other Connections (such as "partner") and Markdown notes on lasting facts. When I last reached out comes from their newest **Interaction**; "Reached out" logs one: a message unless I pick another kind. Today lists who I'll see that day, suggests up to three other people past their reach-out cadence and shows dates in the next two weeks; the Android app reminds me of each date the morning before and the morning of.
  _Avoid_: contact, friend (as the type name), CRM
- **Closeness** — how close a Connection is: **close** or **friend**, or unset. Setting it on someone with no reach-out cadence suggests weekly for close and monthly for friend (Dunbar 2025). Family is a Circle, not a closeness.
  _Avoid_: circle, layer, tier
- **Circle** — a community I share with Connections, such as Shockwave dragon boat, Mahjong, Coworkers or Family. A Connection can be in many. A Circle may follow a Habit (Shockwave dragon boat follows Dragon boat practice): on that Habit's due days Today lists who I'll see. A seasonal team gets a new Circle each year (Shockwave dragon boat 2027), and the Habit follows the newest.
  _Avoid_: group, tag, label
- **Interaction** — one time I was in touch: a day, a kind (**in person**, **call** or **message**), a short note and the Connections or Circle involved; in person ones may hold minutes together. A Circle's Interaction counts for every member; I never enter who came. The AI box at the top of the Connections list turns a sentence into one for me to review; it never creates a Connection, and its follow-up joins each person's follow-ups.
  _Avoid_: conversation, encounter, activity, touchpoint
- **Grow closer** — a flag on a Connection I want to become closer friends with. Today then prompts "Make a plan with <name>" for one such person a day, skipping anyone I see at a meetup that day; answering ("Made a plan" or "Not this week") hides that person's prompt for a week. About 50 hours together moves an acquaintance to a casual friend (Hall 2019), so the prompt asks for time together, not a message. The Connection shows hours together, the sum of minutes on its in-person Interactions, up to the next mark: 50 h (casual friend), 90 h (friend) or 200 h (good friend).
- **Stress spike** — a fight/flight/freeze moment that lasts minutes to hours and can hit in any zone. It's a moment, not a Storm: Storm to Sun zones span days and are read by markers.
  _Avoid_: calling a spike a Storm

## The log box

- **Log box** — the composer: one sentence in, Habit logs out. Pinned at the foot of Today and opened as the log modal; the Check-in's "What were you doing?" sends through it too. A sentence that only logs tracked Habits, with no problem the log form would flag (no Habit picked, a missing time, a future day, an overlap), saves at once and leaves a Receipt. Anything else opens a prefilled form: the log form, the Habit editor for a new Habit, or the One-off form. Needs a connection.
  _Avoid_: chat, assistant
- **Receipt** — what a log saved, with its single-use Undo. The Log box shows its latest Receipt above the composer until the next sentence or Done; a form shows its own after Save. A refused Undo keeps its button and shows why.
- **Log thread** and **Question** — gone: the Log box drafts a form from one sentence and never asks follow-up questions.

## Planning

- **Plan the day** — three steps over my Todoist tasks: Reach for (the current zone's Storm to Sun reminders), Triage (Keep, Postpone or Drop each overdue, today and tomorrow task) and Blocks (kept tasks placed on Google Calendar). Blocks also places the planned day's pending Plan actions in the job Pool; they skip Triage, since the Plan was sized at the day's close. It plans today before 17:00 and tomorrow from then. Needs a connection.
  _Avoid_: daily plan, schedule
- **Pool** — whose time a task uses: personal or job. Each Pool has its own hours, and its Blocks never mix.
- **Block** — a sitting of kept tasks from one Pool, placed in a free calendar slot with its total minutes. Today's next one or two show on Today.
  _Avoid_: time block, event (for the plan's unit)

## Work track

Moved in from the `work-log` vault (`docs/work-log-migration.md`); the terms match its `CONTEXT.md`.

- **Work track** — the work half of the app: Work days, Tickets, Plans and work Reflections. The **Growth track** is everything else. Review views (the Session brief, Weekly review) read only the Growth track.
- **Work day** — a Day with work on it: its Tickets and PRs, Code reviews, meetings, daily counts and Anchor.
  _Avoid_: workday entry, day note
- **Work entry** — one typed bullet from a weekly note: a task (done when finished), blocker, meeting, review, note, or personal line (health, habits, feelings; the Work view hides it). It sits on its Work day, or on the week when the note names no day, and may nest under another entry.
  _Avoid_: item, bullet
- **Ticket** — a Jira issue, named by its key (`DEV-N`). Not a Habit or One-off.
  _Avoid_: task, story
- **Plan** — the next Work day's sized list of Plan actions, written at the day's close. Distinct from Plan the day, which triages Todoist tasks.
  _Avoid_: daily plan
- **Plan action** — one step in a Plan: a merge or fix on one PR, with a status (pending, done, missed or blocked).
- **Hit rate** — done Plan actions over planned ones for a Day, leaving out Blocked actions and If time actions. Kept at 70–85% by sizing the next Plan.
- **If time** — ranked Plan actions past the Plan's size. Done counts as bonus, never as a miss.
- **Blocked action** — a Plan action whose PR is open and green with a review request pending. Out of my hands, so it leaves the Hit rate.
- **Standup** — a Work day as I post it to the team: the day's section of the weekly note, ending with the next Work day's Plan, with Slack's PR emoji and no checkboxes.
- **Anchor** — the one smallest open work task I'm on right now.
  _Avoid_: focus task, current todo
- **Career note** — one note from the vault's `career/` folder (career stories, interviewing, promotions), titled by its path there. Part of the Work track: review views and search never read it.
  _Avoid_: career doc, brag doc
- **Work backlog** — work todos captured blind, read only when picking a new Anchor. They live in Todoist's job Pool.

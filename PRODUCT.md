# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Android app plus a website from one Expo codebase. iOS is out of scope.

## Users

- **Owner**: the sole user. Uses the Android app many times a day to save Check-ins, tick Habits and log through the Log box. Often uses it while in Storm, with little energy or focus.
- No one else reads or edits the app. The owner shares the Session brief with their coach outside it.

## Product Purpose

A personal journal for the Growth track: Storm to Sun Check-ins, Habits, Goals, Connections, the Health plan and notes, rolled up the Ladder from Check-ins to week, quarter and year.

Success has two equal parts:

- **Daily use**: the owner keeps using it every day, even in Storm, because each log costs seconds.
- **Better reviews and coaching**: the data feeds the Weekly retro, quarterly reviews and the Session brief, so sessions spend time on patterns, not on reconstructing the week.

## Positioning

Built for one person's personal practice, not a general habit tracker. Its model comes from that practice: Storm to Sun zones, Habits that grow through garden Stages (seed, sprout, plant, tree), directional Goals with no deadlines, Reschedules that flag avoidance, and a Session brief for coaching.

## Operating Context

- Tabs: Today, Habits, Check-ins, Connections and Notes. Notes holds the Health plan, Health records and the Library.
- Android adds Alarms, Connection reminders, the Check-in prompt and the Place guess from GPS. The Check-in prompt shows at 12:30 on a Day with no Check-in yet, outside Rest mode, with one-tap zone buttons (Bidargaddi et al. 2018); Android's channel settings turn it off.
- The Log box (one sentence in, Habit logs out) and Plan the day (Todoist plus Google Calendar) need a connection.
- The website is the wide layout: a centred page frame with a compact top tab bar.
- It replaces the older `journal` web app; every `journal` URL must keep working (`docs/url-parity.md`).

## Capabilities and Constraints

- **Terminology**: use `GLOSSARY.md` at the repo root word for word (Check-in, Habit, One-off, Reschedule, Connection, Log box and so on).
- **Data**: lives in Cloudflare D1 behind a Worker API.
- **A forgiving Strength, never shame.** A Habit's Streak and Strength stay out of the Session brief. One miss is a dip in Strength, not a reset, and a Skip freezes it. No shame copy, and a miss never shows red; only going over a bad Habit's ceiling does.
- **Nudge only when research supports it.** Reminders and repeat prompts are fine when evidence shows they help; cite the study in the issue. Today still hides Habits that aren't due, and tree-stage Habits leave the tracker.
- **Work material** is welcome: the owner may keep work data, such as the work log, in the app.

## Brand Commitments

- **Voice**: plain and neutral. Short, factual labels. No cheerleading, no self-help jargon.
- **Garden metaphor** for Habit Stages: seed, sprout, plant, tree. A bad Habit is a weed.
- **Storm to Sun** names the zones of a Check-in.
- **Botanical Folio** is the visual world, carried over from `journal`; see `DESIGN.md`.

## Evidence on Hand

- Real data lives in D1 (Check-ins, Habits, Goals, Connections, notes, sleep).
- No testimonials, users or metrics beyond the owner. Do not invent any.

## Product Principles

1. **Usable in Storm.** Every core action works with low energy and focus: one obvious next step, little reading and no guilt.
2. **ADHD-friendly.** Skimmable screens, short labels, the key action first.
3. **Log in seconds.** The cost of a log decides whether the data exists at all.
4. **Scored, never shamed.** Goals and Habits may show scores and enough-or-not bars. A miss is a dip in a forgiving Strength, never streak shame.

## Accessibility & Inclusion

- The owner has ADHD and skims: lead with the key fact, keep text short, and keep the page uncluttered.
- Screens must work at low capacity during Storm: few choices, large touch targets, no time pressure.
- Light and dark themes both ship (`userInterfaceStyle: automatic`).

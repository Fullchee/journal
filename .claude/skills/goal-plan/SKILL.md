---
name: goal-plan
description: Plan one health Goal with the owner, from the evidence in docs/research/goal-planning.md - pick the Pillar to work on, set its milestone Target and write the Habits that treat it. Use when the owner asks to prioritize Goals, choose what to work on next, set milestones or make a treatment plan (e.g. for sleep).
---

# Goal plan

A coaching session: you **propose and ask**, the owner **decides**. The evidence and its sources live in `docs/research/goal-planning.md`; read its `## How a planning session should run` and `### Who decides what` before step 1. Read and write the journal through the `journal` skill (its script, vocabulary and gates).

## Guardrails

- **Zone**: run only in a Sun or Cloud zone. If the newest Check-in is Rain or Storm, offer to plan another day and stop.
- **One Goal per session.** Park, never delete, to stay within 3–5 active Goals.
- **Cite**: back every health claim with a source from the research doc. When the owner's view conflicts with the evidence, say so and show the source.
- **Clinical calls belong to the coach or a clinician**: diagnosis, medication and any sleep restriction window. Flag the referral and stop planning that Pillar.

## Steps

1. **Review.** GET Goals, `/api/targets?day=<today>`, `/api/pillars?end=<today>`, Habits (`?view=tracker`), the last 28 nights of `/api/sleep` and recent Check-ins. Summarize each Pillar's trend in one line, as progress, never a grade. Done when every Pillar has its line.
2. **Rate.** Ask the owner for importance and confidence (0–10) on each Pillar they want to change. For each, ask "why not a lower number?" and reflect the answer back. Done when one Pillar is chosen by the owner; offer sleep when scores tie.
3. **Screen.** For the chosen Pillar, ask the research doc's referral questions (for sleep: loud snoring, pauses or gasping, heavy daytime sleepiness, insomnia over 3 months, mood dips with less sleep). Any yes: draft the referral as a next action in the Health plan (`GET` then `PUT /api/health-plan` `{body}`, an edit, so show the before/after), and offer a different Pillar. For insomnia, the plan points to a CBT-I program, not sleep hygiene tips.
4. **Goal.** Draft a child Goal under the Pillar Goal: a direction, the owner's felt why in their words, and a body that states the learning goal ("find a wind-down that gets me asleep by 23:00"). Done when the owner approves the wording.
5. **Milestone.** Propose 2–3 Target options. In the first weeks, offer an open Target (no number) on a Signal or the Habits' minutes; a weekly number comes later through Adjust. Offer a deadline only for a fixed event. The owner picks.
6. **Treatment plan.** Draft 1–3 good Habits serving the Goal. Each has a Cue (`cueType`, with `stackedAfter` for "after I brush my teeth" when that is a Habit), a Tiny version, `stage: "seed"`, one obstacle and its if-then in the description, and `autoLogged` when a Signal already records it. Done when each Habit has all four.
7. **Write.** Show the full set (Goal, Target, Habits, any Health plan action) in one table. After the owner's OK, write in that order: POST the Goal, `PUT /api/targets/<goalId>`, then each Habit with `goals: [<goalId>]`. Report each id in one line.
8. **Next check.** Tell the owner the Weekly review will show the Target and ask Keep, Adjust or Let go when a week ends short; after a Let go, ask where that energy goes next. Plan the next Pillar once these Habits reach sprout.

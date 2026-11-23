# Planning a Goal with an LLM: priorities, milestones and a treatment plan

Researched 2026-11-22. Question: how should a planning session with Claude pick a health Goal, set its milestones and write its plan (#26)?

Builds on [goal-hierarchies.md](goal-hierarchies.md) (levels, one primary Goal per Habit, 3–5 active Goals, review cadence) and [habit-tracker-best-practices.md](habit-tracker-best-practices.md) (cues, tiny habits, forgiving misses). This doc does not repeat them.

## Answer

- **Order matters less than load.** Changing behaviours one at a time or together gives similar results ([James et al. 2016](https://doi.org/10.1016/j.ypmed.2016.06.012)). Start one Pillar per session; add the next once its Habits take hold.
- **Sleep is a good first Pillar for this owner.** Lab sleep loss worsens mood, raises food intake and cuts activity. Trials that improve sleep improve depression and anxiety ([Scott et al. 2021](https://doi.org/10.1016/j.smrv.2021.101556)). No trial shows sleep-first speeds change in the other Pillars.
- **Pick by importance × confidence, owner's numbers.** Motivational interviewing's rulers are the evidenced framing; Fogg's focus mapping is a book method, not tested.
- **Set a weekly Target as the near milestone.** Near subgoals build skill and confidence in Bandura's classic study. For a new skill, a learning goal ("find what helps me fall asleep") beats a hard number.
- **A plan pairs self-monitoring with if-then plans.** Self-monitoring plus one more self-regulation technique nearly doubled effects ([Michie et al. 2009](https://doi.org/10.1037/a0016136)).
- **For insomnia, the plan is CBT-I, not sleep hygiene.** Guidelines rank CBT-I first, in person or digital, and advise against sleep hygiene alone.
- **After a miss: be kind, then re-engage.** Self-compassion raises effort to improve. Letting go helps only when energy moves to a new goal.
- **The LLM drafts and asks; the owner and coach decide.** LLM coaches show promise in benchmarks and small studies, not outcome trials of coaching. Models also agree with false premises.

## At a glance

| Question                             | Answer                                                   | Evidence strength                       |
| ------------------------------------ | -------------------------------------------------------- | --------------------------------------- |
| One behaviour at a time, or several? | Similar results; choose by load                          | Moderate: 6 RCTs, mixed                 |
| Is sleep a keystone?                 | Sleep loss hurts mood, diet and activity                 | Strong (lab, mood); moderate (diet)     |
| How to choose the first Goal?        | Owner rates importance and confidence                    | Weak: MI is evidenced, rulers alone not |
| Near or far milestones?              | Near subgoals help, mostly through learning and efficacy | Moderate; one key null                  |
| Learning or performance goal?        | Learning goal for new, complex skills                    | Moderate (lab tasks)                    |
| How far apart to space milestones?   | Weekly fits the review; no study sets the ideal          | Weak                                    |
| What to do after a miss?             | Self-compassion, then Keep, Adjust or Let go plus re-aim | Moderate (correlational, meta-analytic) |
| Best techniques for the plan?        | Self-monitoring + if-then plans or feedback              | Strong                                  |
| Insomnia treatment?                  | CBT-I first-line; sleep hygiene alone not enough         | Strong (guidelines)                     |
| Can an LLM coach well?               | Promising, unproven on outcomes; sycophancy is real      | Weak for outcomes                       |

## 1. Prioritizing: which Pillar first

### Sequential vs simultaneous change

| Study                                                                        | Design                                                                      | Finding                                                                                                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [Hyman et al. 2007](https://doi.org/10.1001/archinte.167.11.1152)            | RCT, n = 289: smoking, salt and steps, all at once vs one per 6 months      | Few met 2 of 3 goals at 18 months (6.5% vs 5.2%). Single goals favoured simultaneous. Sequential "not superior".   |
| [Spring et al. 2012](https://doi.org/10.1001/archinternmed.2012.1044)        | RCT, n = 204 (Make Better Choices): four pairs of diet and activity targets | More fruit and veg plus less sedentary leisure improved most. **Which pair** mattered, not how many.               |
| [Spring et al. 2018](https://doi.org/10.2196/10528)                          | RCT, n = 212 (MBC2): activity with or after diet targets                    | Both arms made large, lasting changes; no difference. Self-monitoring fell from 96% to 55% of days by 9 months.    |
| [James et al. 2016](https://doi.org/10.1016/j.ypmed.2016.06.012)             | Systematic review, 6 RCTs                                                   | Two favoured sequential (smoking), one simultaneous (fat). Authors call both "equally efficacious". Thin evidence. |
| [Prochaska, Spring & Nigg 2008](https://doi.org/10.1016/j.ypmed.2008.02.001) | Field overview                                                              | Frames multiple behaviour change; no rule on order.                                                                |

- **Verdict**: order is not the lever. Load is: if-then plans stop helping when goals multiply ([goal-hierarchies.md](goal-hierarchies.md#too-many-goals)).
- **Self-monitoring decays** (MBC2). Plans that rely on manual logging lose data within months. Auto-logged Signals hold up.

### Sleep as a keystone

| Link                         | Evidence                                                                                                                                                                                                                                                                                                                                                        | Strength              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Sleep → mood                 | Sleep loss raised negative mood (g = 0.45) and cut positive mood (g = −0.94); 64 studies ([Tomaso et al. 2021](https://doi.org/10.1093/sleep/zsaa289))                                                                                                                                                                                                          | Strong (experimental) |
| Better sleep → mental health | 65 RCTs: improving sleep reduced depression (g = −0.63) and anxiety (g = −0.51), with a dose-response ([Scott et al. 2021](https://doi.org/10.1016/j.smrv.2021.101556))                                                                                                                                                                                         | Strong                |
| Sleep → diet                 | Partial sleep loss added 385 kcal/day of intake, no change in burn ([Al Khatib et al. 2017](https://doi.org/10.1038/ejcn.2016.201)). Sleep loss raised brain response to junk food ([Greer et al. 2013](https://doi.org/10.1038/ncomms3259)). Extending sleep cut intake in a field RCT ([Tasali et al. 2022](https://doi.org/10.1001/jamainternmed.2021.8098)) | Moderate              |
| Sleep → activity             | 5.5 h nights cut activity 31% vs 8.5 h; n = 18 crossover ([Bromley et al. 2012](https://doi.org/10.5665/sleep.1964))                                                                                                                                                                                                                                            | Weak: one small study |

- **"Sleep is the keystone habit" is a popular claim.** The pieces are evidenced; no trial tests sleep-first as a strategy across Pillars.
- **Fit**: the owner tracks mood zones. Sleep's strongest effect is on mood, so sleep is a sound default first Pillar.

### Choosing by importance and confidence

- **Motivational interviewing (MI)** has a small, lasting effect over weak controls (g = 0.28; 119 studies) and matches other treatments ([Lundahl et al. 2010](https://doi.org/10.1177/1049731509347850)).
- **Importance and confidence rulers** (0–10) come from MI practice: Rollnick, Mason & Butler, _Health Behavior Change_ (1999); Miller & Rollnick, _Motivational Interviewing_ (3rd ed., 2013). Books, not trials of the rulers alone.
- **Fogg's focus mapping** plots behaviours by impact and ability (_Tiny Habits_, 2019). **Not peer reviewed**; no trial.
- **Both say the same thing**: pick what matters to you and what you can do. Self-chosen goals last longer ([goal-hierarchies.md](goal-hierarchies.md#self-concordance-sheldon)).

## 2. Milestones

### Near vs far goals

- **Bandura & Schunk 1981** ([doi](https://doi.org/10.1037/0022-3514.41.3.586)): children with per-session subgoals gained arithmetic skill, self-efficacy and interest. A far goal alone did no better than no goal. Small sample, one task.
- **Stock & Cervone 1990** ([doi](https://doi.org/10.1007/bf01172969)): near subgoals raised self-efficacy and satisfaction on a complex task.
- **The null**: on a new scheduling task, adding near outcome goals did not raise performance over a far goal alone ([Seijts & Latham 2001](https://doi.org/10.1002/job.70)). Near goals helped through more strategies when paired with a **learning** goal.
- **Goal-setting theory**: specific, hard goals beat "do your best" ([Locke & Latham 2002](https://doi.org/10.1037/0003-066X.57.9.705)). Covered in [goal-hierarchies.md](goal-hierarchies.md#goal-setting-theory-locke--latham).

### Learning vs performance goals

- **New or complex task: set a learning goal.** In Seijts & Latham 2001, a hard outcome goal did **worse** than "do your best". A hard learning goal did better. Review: [Seijts & Latham 2005](https://doi.org/10.5465/ame.2005.15841964).
- **Fit**: early in a Goal, a Target like "try three wind-down routines" fits better than "sleep 8 h". Switch to a number once the method works.

### Spacing and the middle

- **No study sets ideal milestone spacing** for health habits. Weekly matches the Weekly review and the Target's weekly period.
- **Goal gradient**: effort speeds up near the end ([Kivetz, Urminsky & Zheng 2006](https://doi.org/10.1509/jmkr.43.1.39)).
- **Stuck in the middle**: motivation can dip halfway ([Bonezzi, Brendl & De Angelis 2011](https://doi.org/10.1177/0956797611404899)). People cut corners most in the middle ([Touré-Tillery & Fishbach 2012](https://doi.org/10.1037/a0025928)).
- **Small-area framing**: show progress done early, and what's left near the end ([Koo & Fishbach 2012](https://doi.org/10.1086/663827)). A deadline Target could switch its label past halfway.
- **Short repeating periods avoid a long middle.** A weekly Target restarts each week.

### After a missed milestone

- **Disengage and re-engage**: letting go of an unreachable goal and taking up a new one predicts well-being ([Wrosch et al. 2003](https://doi.org/10.1177/0146167203256921)).
- **Re-engagement does the work**: in a meta-analysis, re-engagement tracked quality of life (r = 0.19) more than disengagement (r = 0.08). In samples at risk of depression, disengagement went with **more** depressive symptoms ([Barlow, Wrosch & McGrath 2020](https://doi.org/10.1111/jopy.12492)).
- **Self-compassion**: after a failure, a self-compassionate prompt raised effort to improve ([Breines & Chen 2012](https://doi.org/10.1177/0146167212445599)). It also tracks more health behaviour (r = .25, 15 samples; [Sirois, Kitner & Hirsch 2015](https://doi.org/10.1037/hea0000158)). Mostly correlational.
- **Fit**: Keep, Adjust, Let go already covers disengagement. Pair Let go with "what gets this energy now?", given the owner's mood history.

## 3. The treatment plan

### Behaviour change techniques

| Technique                                          | Evidence                                                                                                                                                                                                                                                                     | Strength       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Self-monitoring + another control-theory technique | 122 evaluations: d = 0.42 vs 0.26 without ([Michie et al. 2009](https://doi.org/10.1037/a0016136)). The others: goal setting, if-then plans, feedback, reviewing goals                                                                                                       | Strong         |
| Shared vocabulary                                  | BCT Taxonomy v1: 93 techniques in 16 groups ([Michie et al. 2013](https://doi.org/10.1007/s12160-013-9486-6))                                                                                                                                                                | Consensus tool |
| Progress monitoring                                | d = 0.40; larger when recorded or shared ([Harkin et al. 2016](https://doi.org/10.1037/bul0000025))                                                                                                                                                                          | Strong         |
| Implementation intentions                          | d = 0.65, 94 studies ([Gollwitzer & Sheeran 2006](<https://doi.org/10.1016/S0065-2601(06)38002-1>)); 642 tests: d = .27–.66, larger with if-then format, high motivation and rehearsal ([Sheeran, Listrom & Gollwitzer 2024](https://doi.org/10.1080/10463283.2024.2334563)) | Strong         |
| Mental contrasting + if-then (WOOP/MCII)           | g = 0.34, 21 studies; likely smaller after publication bias ([Wang, Wang & Gai 2021](https://doi.org/10.3389/fpsyg.2021.565202)). Women's activity RCT ([Stadler et al. 2009](https://doi.org/10.1016/j.amepre.2008.09.021))                                                 | Moderate       |

- **Fit**: the app already has monitoring (Habits, Signals), feedback (Target progress) and if-then plans (Cue). WOOP adds one step: name the obstacle, then its if-then.

### What a lifestyle-medicine prescription holds

- **ACLM defines six pillars** ([ACLM overview](https://lifestylemedicine.org/overview/)), for example "7-9 hours of quality sleep every night". The page gives no prescription template.
- **Physician competencies** ([Lianov & Johnson 2010](https://doi.org/10.1001/jama.2010.903)) cover assessing readiness, behaviour change counselling, specific prescriptions, follow-up and team referral. A consensus statement, not a trial.
- **Not found**: a published ACLM prescription form. Treat "prescription" as goal, specific actions, monitoring and follow-up date.

### Sleep: the evidence-based plan

- **CBT-I first**: ACP gives a strong recommendation for CBT-I as initial treatment of chronic insomnia ([Qaseem et al. 2016](https://doi.org/10.7326/M15-2175)).
- **AASM 2021** ([Edinger et al.](https://doi.org/10.5664/jcsm.8986)): multicomponent CBT-I (strong). Brief therapy, stimulus control, sleep restriction and relaxation alone (conditional). **Not sleep hygiene alone** (conditional).
- **CBT-I parts**: sleep restriction, stimulus control (bed only for sleep; get up if awake), fixed wake time, cognitive work on sleep worries, relaxation, hygiene as support.
- **Digital CBT-I works**: European guideline rates it first-line "in-person or digitally" (grade A; [Riemann et al. 2023](https://doi.org/10.1111/jsr.14035)). Trials: [Zachariae et al. 2016](https://doi.org/10.1016/j.smrv.2015.10.004) (meta-analysis), [Freeman et al. 2017](<https://doi.org/10.1016/S2215-0366(17)30328-0>) (OASIS, also cut paranoia and hallucinations), [Espie et al. 2019](https://doi.org/10.1001/jamapsychiatry.2018.2745).
- **Sleep restriction has a cost**: in its first weeks, sleep fell 69–91 min a night and sleepiness rose; it recovered by 3 months ([Kyle et al. 2014](https://doi.org/10.5665/sleep.3386)). Start it outside Storm, and tell the coach.
- **Refer to a clinician** when: loud snoring, witnessed pauses or gasping, or heavy daytime sleepiness (suspected apnea). Also: insomnia over 3 months despite the plan, or mood dips with less sleep. AASM: questionnaires such as STOP-Bang ([Chung et al. 2008](https://doi.org/10.1097/ALN.0b013e31816d83e4)) screen but never diagnose apnea ([Kapur et al. 2017](https://doi.org/10.5664/jcsm.6506)).

## 4. The LLM as coach

| Study                                                                                            | What it shows                                                                                                           | Limit                                                      |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Khasentino et al. 2025](https://doi.org/10.1038/s41591-025-03888-0) (PH-LLM, _Nature Medicine_) | Fine-tuned Gemini beat sampled experts on sleep (79% vs 76%) and fitness exams; matched experts on fitness case studies | Benchmarks, no outcome trial                               |
| [Jörke et al. 2025](https://doi.org/10.1145/3706598.3713819) (GPTCoach, CHI)                     | Prompt-chained GPT-4 held MI-consistent or neutral behaviour in most turns ([arXiv](https://arxiv.org/abs/2405.06061))  | 16 people, one session, lab                                |
| [Brown et al. 2023](https://doi.org/10.2196/49132) (MI chatbot, smoking)                         | Generative reflections raised confidence and readiness a week later                                                     | No change in quit attempts; much came from questions alone |
| [Heinz et al. 2025](https://doi.org/10.1056/AIoa2400802) (Therabot, _NEJM AI_)                   | RCT, n = 210: fewer depression and anxiety symptoms vs waitlist                                                         | Therapy, not coaching; waitlist control                    |
| [Chen et al. 2025](https://doi.org/10.1038/s41746-025-02008-z)                                   | Five frontier models complied with illogical drug requests up to 100% of the time                                       | Prompts asking it to reject helped                         |

- **Sycophancy is general**: assistants tend to agree with the user's stated view ([Sharma et al. 2023](https://arxiv.org/abs/2310.13548)). Ask the model to name evidence and disagree when warranted.
- **No RCT** shows an LLM planning session changes health behaviour. Evidence is weak for outcomes.
- **WHO** asks for human oversight of large multimodal models in health ([WHO 2024](https://www.who.int/publications/i/item/9789240084759)).

### Who decides what

| Decision                                        | Owner | Coach or clinician | LLM                          |
| ----------------------------------------------- | ----- | ------------------ | ---------------------------- |
| Which Pillar and Goal; the why                  | ✓     |                    | Asks rulers, reflects back   |
| Target number and period                        | ✓     |                    | Proposes 2–3 options         |
| Habits, Cues, Tiny versions                     | ✓     |                    | Drafts; owner edits          |
| Diagnosis, medication, sleep restriction window |       | ✓                  | Flags referral triggers only |
| Keep, Adjust, Let go                            | ✓     |                    | Summarizes the data          |

## How a planning session should run

Run it in a Sun or Cloud zone, never in Storm. One session plans one Goal.

1. **Review first.** The LLM reads active Goals, Targets, Habit Strength and recent Signals. It summarizes trends, never grades.
2. **Pick one Pillar.** The owner rates importance and confidence (0–10) for each candidate. The LLM asks "why not lower?" and reflects the answers. Default to sleep if scores tie (§1).
3. **Write the Goal.** A direction plus the owner's felt why, as a child of its Pillar Goal (the Pillar Goal keeps its guideline Target). Respect the 3–5 active Goal cap ([goal-hierarchies.md](goal-hierarchies.md)); park one if needed.
4. **Set a Target.** First period: write the learning goal in the Goal's body ("try three wind-down routines") and give it an open Target (a trend). Once a method works, Adjust to a weekly number. Use a deadline only for a fixed event; it then needs weekly Habits under it.
5. **Write 1–3 Habits.** Each gets a Cue (an if-then), a Tiny version, and Stage seed. Put the WOOP obstacle in its obstacles and the if-then for it in its description.
6. **Prefer auto-logged measures.** Use a Signal for the Target where one exists. Manual logging decays within months (MBC2).
7. **Check referral triggers.** For sleep: apnea signs, long insomnia, mood dips. If any apply, the next action is the coach or clinician, not a Habit. Insomnia → a CBT-I program, not hygiene tips.
8. **Review weekly.** The Weekly review shows Target progress. When a period ends short: Keep, Adjust or Let go. After Let go, name where the energy goes next.
9. **Add the next Pillar** only when this Goal's Habits reach sprout, and the owner chooses it.

**Limits on the LLM**: it proposes options and asks questions. It never picks the Goal, never sets a number alone, never diagnoses, and never invents a sleep restriction schedule. It cites a source for each health claim. The owner confirms before any write to the journal.

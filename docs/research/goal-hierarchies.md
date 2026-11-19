# Goal hierarchies for self-improvement, and grouping Habits under Goals

Researched 2026-11-16. Question: do goal hierarchies make sense for personal self-improvement, and should Habits be grouped under Goals?

Builds on [goal-hierarchy.md](goal-hierarchy.md), which adopted Duckworth's tree for Goals (#74). This doc checks that choice against the primary research and adds the Habit side.

## Verdict

**Yes, keep a shallow hierarchy, but treat it as a meaning and review tool, not the thing that drives daily behaviour.** Every major self-regulation theory describes goals as nested, with abstract "why" goals above concrete "how" actions ([Carver & Scheier 1982](https://doi.org/10.1037/0033-2909.92.1.111); [Kruglanski et al. 2002](<https://doi.org/10.1016/S0065-2601(02)80008-9>); [Duckworth & Gross 2014](https://doi.org/10.1177/0963721414541462)). Goals that fit together and serve higher aims predict well-being and progress ([Sheldon & Kasser 1995](https://doi.org/10.1037/0022-3514.68.3.531); [Sheldon & Elliot 1999](https://doi.org/10.1037/0022-3514.76.3.482)). Habit research adds the key limit: once a Habit is automatic, a context cue runs it, not the Goal above it ([Wood & Neal 2007](https://doi.org/10.1037/0033-295X.114.4.843); [Neal et al. 2012](https://doi.org/10.1016/j.jesp.2011.10.011)). So link Habits to Goals for choosing them, staying motivated while they form, and reviewing them. Don't expect the link to keep them going once they're automatic. Give each Habit **one primary Goal**: a means tied to many goals feels weaker for each one ([Zhang, Fishbach & Kruglanski 2007](https://doi.org/10.1037/0022-3514.92.3.389)).

## At a glance

| Question                            | Answer                                                                                  | Evidence strength                      |
| ----------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| Are goals nested in the mind?       | Yes: all major theories agree                                                           | Strong (theory), moderate (tests)      |
| Does linking goals help well-being? | Yes, when goals fit together and feel self-chosen                                       | Moderate, mostly correlational         |
| Do Habits need their Goal to run?   | No, once automatic                                                                      | Moderate; human "pure habit" contested |
| Do Goals help Habits form?          | Yes: motivation drives the repetitions, and self-chosen motives predict stronger habits | Moderate                               |
| One Goal per Habit, or many?        | One primary; extra links dilute how useful the Habit feels for each                     | Moderate (lab studies)                 |
| How many levels?                    | About 3                                                                                 | Weak: heuristic, no trials             |
| How many active Goals?              | Few; planning benefits fade with many goals                                             | Weak: no study names a number          |
| How often to review?                | Regular recorded check-ins help                                                         | Strong for monitoring itself           |

## 1. Theory: are goals hierarchical?

### Goal systems theory (Kruglanski)

- **Goals and means form a network**: goals link to their means and to each other ([Kruglanski et al. 2002](<https://doi.org/10.1016/S0065-2601(02)80008-9>)).
- **Equifinality**: one goal, many means. Means are swappable, which buffers against a blocked path.
- **Multifinality**: one means serves several goals. When several goals are active, people narrow their choices to means that serve all of them, even at a cost to the main goal ([Köpetz et al. 2011](https://doi.org/10.1037/a0022980)).
- **Dilution effect**: each extra goal a means is linked to weakens how strongly it seems to serve any one of them. People then pick it less often for that goal ([Zhang, Fishbach & Kruglanski 2007](https://doi.org/10.1037/0022-3514.92.3.389)).
- **Variety of means**: having many means feels motivating when a goal is far off, and demotivating when it is close ([Etkin & Ratner 2012](https://doi.org/10.1086/661229)).
- **Goal shielding**: an active goal suppresses competing goals, which helps focus but can hide other priorities ([Shah, Friedman & Kruglanski 2002](https://doi.org/10.1037/0022-3514.83.6.1261)).

**For a habit app**: many-to-many links are true to life, but each extra link costs a little perceived value. A primary Goal keeps the "why" sharp.

### Control theory (Carver & Scheier)

- **Nested feedback loops**: "be" goals (the self you want to be) set the standards for "do" goals (projects), which set the standards for motor actions ([Carver & Scheier 1982](https://doi.org/10.1037/0033-2909.92.1.111)).
- **Feelings track rate of progress**, not distance to the goal. Faster progress than expected feels good; slower feels bad ([Carver & Scheier 1990](https://doi.org/10.1037/0033-295X.97.1.19)).
- **Implication**: reviewing a trend ("moving toward X") matches how the system works better than a pass/fail score.

### Perceptual control theory (Powers)

- **Behaviour controls perception**: each level of a hierarchy sets the reference value for the level below ([Powers 1973](https://doi.org/10.1126/science.179.4071.351)).
- **Evidence is weak for self-improvement.** Support comes mostly from modelling simple tracking tasks. No trials test PCT-based goal hierarchies for personal change. Treat it as a framing, not a finding.

### Action identification (Vallacher & Wegner)

- **People describe actions at different levels** ("moving my legs" vs "getting fit"). They prefer the higher level, and drop to the lower one when the action gets hard or goes wrong ([Vallacher & Wegner 1987](https://doi.org/10.1037/0033-295X.94.1.3)).
- **Implication**: show both the Habit (how) and its Goal (why), so the user can move between levels.

### Duckworth's goal hierarchy

- **Top goals are stubborn, low goals are swappable**: persistence lives at the top, flexibility at the bottom ([Duckworth & Gross 2014](https://doi.org/10.1177/0963721414541462)). This peer-reviewed paper is the primary source behind _Grit_'s chapter.
- **Evidence**: a framework paper, not a trial. It is consistent with goal systems theory's equifinality.

### Goal-setting theory (Locke & Latham)

- **Specific, hard goals beat "do your best"** for performance, across hundreds of studies ([Locke & Latham 2002](https://doi.org/10.1037/0003-066X.57.9.705)).
- **For new or complex skills, learning goals beat performance goals** (same review). Self-improvement is mostly new skills.
- **Contested side effects**: narrow focus, more risk-taking, cheating and lost intrinsic motivation ([Ordóñez et al. 2009](https://doi.org/10.5465/AMP.2009.37007999)). Locke and Latham reply that the critique overstates the evidence ([Locke & Latham 2009](https://doi.org/10.5465/AMP.2009.37008000)).
- **Fit with this app**: the app's Goals are directions, never graded. That gives up the specific-goal boost on purpose. Habits and Signals carry the concrete part instead.

### Implementation intentions (Gollwitzer)

- **"If situation X, then I do Y"** hands control to a cue ([Gollwitzer 1999](https://doi.org/10.1037/0003-066X.54.7.493)).
- **Medium-to-large effect on goal attainment**: d = 0.65 across 94 studies ([Gollwitzer & Sheeran 2006](<https://doi.org/10.1016/S0065-2601(06)38002-1>)).
- **Also helps break unwanted habits** by linking the old cue to a new response ([Adriaanse et al. 2011](https://doi.org/10.1177/0146167211399102)).
- **Fades with many goals**: plans helped people pursue one goal but not several at once ([Dalton & Spiller 2012](https://doi.org/10.1086/664500)).
- **Link to hierarchy**: an implementation intention is the bridge from a Goal to a Habit. It names the cue the Habit will hang on.

## 2. Habit research: do Habits need Goals?

### Habits run on context, not goals

- **Habits are cue-response links** learned by repetition in a stable context. Once formed, the context triggers them with little input from goals ([Wood & Neal 2007](https://doi.org/10.1037/0033-295X.114.4.843); [Wood & Rünger 2016](https://doi.org/10.1146/annurev-psych-122414-033417)).
- **People think goals drive their habits, but context does**: in daily life, context cues predicted habit performance and goals did not ([Neal et al. 2012](https://doi.org/10.1016/j.jesp.2011.10.011)).
- **Habits persist against the goal**: habitual cinema popcorn eaters ate stale popcorn as much as fresh, but only in the cinema ([Neal et al. 2011](https://doi.org/10.1177/0146167211419863)).
- **Habit moderates intention**: when habit is strong, intention predicts behaviour less ([Gardner et al. 2011](https://doi.org/10.1007/s12160-011-9282-0)).

### Where this is contested

- **The habit × intention interaction is mixed**: a review of 52 studies found inconsistent support. Habits win when self-control is low; with self-control, intention still steers ([Gardner, Lally & Rebar 2020](https://doi.org/10.1111/spc3.12553)).
- **Habits may stay goal-linked**: an active travel goal automatically called up the habitual travel mode ([Aarts & Dijksterhuis 2000](https://doi.org/10.1037/0022-3514.78.1.53)). This "goal-dependent automaticity" view sees habits as tools that goals still activate.
- **Pure, goal-blind habits are hard to produce in humans**: five lab attempts failed ([de Wit et al. 2018](https://doi.org/10.1037/xge0000402)). Field data do show it: more predictable gym-goers responded less to an incentive ([Buyalskaya et al. 2023](https://doi.org/10.1073/pnas.2216115120)).

### How long Habits take to form

| Study                                                             | Finding                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [Lally et al. 2010](https://doi.org/10.1002/ejsp.674)             | Median 66 days to plateau; range 18–254. Missing one day did not derail it. Small sample.   |
| [Singh et al. 2024](https://doi.org/10.3390/healthcare12232488)   | 20 studies: medians 59–66 days, means 106–154, range 4–335. Most studies high risk of bias. |
| [Buyalskaya et al. 2023](https://doi.org/10.1073/pnas.2216115120) | Gym: months. Hospital handwashing: weeks. No magic number.                                  |

**Implication**: a Habit spends two months or more in a "goal-dependent" phase. The Goal link matters most in that window.

### Do Goals help Habits form?

- **Yes, indirectly**: goals drive the early repetitions that build the habit ([Wood & Neal 2007](https://doi.org/10.1037/0033-295X.114.4.843); [Lally & Gardner 2013](https://doi.org/10.1080/17437199.2011.603640)).
- **Self-chosen motives build stronger habits**: past behaviour predicted habit strength more among autonomously motivated people ([Gardner & Lally 2013](https://doi.org/10.1007/s10865-012-9442-0)). Correlational, one sample.
- **Once automatic, the link matters little day to day**, but it still matters at review: deciding whether the Habit still serves anything.

## 3. Goal conflict, too many goals, and construal

### Goal conflict

- **Conflict among personal strivings predicts lower well-being** and more physical symptoms ([Emmons & King 1988](https://doi.org/10.1037/0022-3514.54.6.1040)). A later meta-analysis confirms the link ([Gray, Ozer & Rosenthal 2017](https://doi.org/10.1016/j.jrp.2016.12.003)).
- **Weaker than it sounds**: a review found the strongest evidence for ambivalence and low self-concordance, and the weakest for goal conflict itself ([Kelly, Mansell & Wood 2015](https://doi.org/10.1016/j.paid.2015.05.011)).
- **Interference and facilitation are separate**: interference tracks lower well-being; goals that help each other track more actual pursuit ([Riediger & Freund 2004](https://doi.org/10.1177/0146167204271184)).
- **Implication**: a hierarchy makes conflicts and synergies visible. Habits that serve two Goals at once are synergies worth noticing, as long as one Goal stays primary.

### Too many goals

- **Plans stop helping when goals multiply** ([Dalton & Spiller 2012](https://doi.org/10.1086/664500)).
- **Unfinished goals intrude on thought; a concrete plan quiets them** ([Masicampo & Baumeister 2011](https://doi.org/10.1037/a0024192)). Single lab; not widely replicated.
- **No study gives a number** for how many active goals is too many. Any limit (3, 5) is a heuristic.

### Abstract vs concrete construal

- **Abstract (why) thinking improves self-control**: people thinking at a high level chose long-term rewards over temptations more often ([Fujita et al. 2006](https://doi.org/10.1037/0022-3514.90.3.351); [Trope & Liberman 2010](https://doi.org/10.1037/a0018963)).
- **Concrete (how) thinking helps action**: implementation intentions work by making the next step concrete ([Gollwitzer 1999](https://doi.org/10.1037/0003-066X.54.7.493)).
- **Implication**: a hierarchy supplies both. Show the Goal when the user faces a temptation or reviews; show the Habit's cue when it's time to act.

## 4. Self-concordance and identity

### Self-concordance (Sheldon)

- **Goals that match your interests and values get more sustained effort**, more attainment and more well-being ([Sheldon & Elliot 1999](https://doi.org/10.1037/0022-3514.76.3.482)). Attaining them feeds an upward spiral ([Sheldon & Houser-Marko 2001](https://doi.org/10.1037/0022-3514.80.1.152)).
- **Vertical coherence**: strivings that serve higher-level goals go with better well-being ([Sheldon & Kasser 1995](https://doi.org/10.1037/0022-3514.68.3.531)). This is the most direct evidence that linking levels helps. Correlational.
- **Autonomous motivation predicts progress**; controlled motivation does not ([Koestner et al. 2008](https://doi.org/10.1111/j.1467-6494.2008.00519.x)).
- **"Want-to" goals meet fewer temptations**, rather than needing more willpower ([Milyavskaya et al. 2015](https://doi.org/10.1037/pspp0000045)).

### Identity-based framing

| Source                                                                     | Finding                                                                                                  | Strength                          |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [Oyserman 2009](https://doi.org/10.1016/j.jcps.2009.05.008)                | Identity-based motivation: people act when an action feels "like me" and the identity feels relevant now | Theory                            |
| [Oyserman, Bybee & Terry 2006](https://doi.org/10.1037/0022-3514.91.1.188) | Possible-selves intervention improved grades and attendance over two years                               | Moderate: randomized, one program |
| [Rhodes et al. 2016](https://doi.org/10.1080/17437199.2016.1143334)        | Exercise identity correlates with activity, r = .44 (32 datasets)                                        | Correlational, modest quality     |
| [Verplanken & Sui 2019](https://doi.org/10.3389/fpsyg.2019.01504)          | Habits and identity reinforce each other                                                                 | Theory                            |
| [Bryan et al. 2011](https://doi.org/10.1073/pnas.1103343108)               | "Be a voter" raised turnout more than "vote"                                                             | Contested                         |
| [Gerber et al. 2016](https://doi.org/10.1073/pnas.1513727113)              | Large field test failed to replicate the "voter" noun effect                                             | Strong null                       |

- **Verdict on identity framing**: the broad idea (goals tied to who you are last longer) has support. The specific trick of rewording a habit as a noun ("I am a runner") does not replicate reliably. _Atomic Habits_ builds on the broad idea; treat its specific claims as untested.
- **Fit**: Carver and Scheier's "be" goals and the top level of Duckworth's tree are identity goals. A top-level Goal phrased as a direction ("a calmer parent") is enough; no special identity feature is needed.

## 5. Practical guidance from the evidence

| Design choice       | Evidence says                                                                                                    | Recommendation                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Levels              | Theories name 3 levels (be/do/motor; top/mid/low). No trial compares depths.                                     | 3: life area or value → Goal → Habit. Allow more, don't suggest it. |
| Active Goals        | Planning gains fade with many goals; no number exists                                                            | 3–5 active Goals at a time; others parked, not deleted              |
| Habit-to-Goal links | Dilution weakens multi-goal means; multifinal means are still chosen when many goals are active                  | One primary Goal per Habit; extra links optional and secondary      |
| Formation phase     | 2+ months, wide spread                                                                                           | Show the Goal prominently for new Habits; fade it once automatic    |
| Review              | Monitoring progress: d = 0.40, stronger when recorded ([Harkin et al. 2016](https://doi.org/10.1037/bul0000025)) | Weekly Habit glance; monthly or quarterly Goal review               |
| Framing             | Self-concordant, autonomous goals do better                                                                      | Ask "why does this matter to me?" when creating a Goal              |

## Practical recommendations

1. **Keep three levels**: life area or value → Goal (a direction) → Habit (the concrete how). This matches Carver and Scheier, Duckworth, and the app's existing tree.
2. **Give each Habit one primary Goal.** Allow secondary links, but show the primary one first. This limits the dilution effect while keeping multifinality visible.
3. **Cap active Goals at about 3–5.** Park the rest. This is a heuristic: no study sets the number.
4. **Write each Habit as an if-then plan** with a stable cue ("after coffee, stretch"). The cue, not the Goal, keeps it running once automatic.
5. **Lean on the Goal while a Habit forms**, roughly the first two to three months. After that, the link is for review, not motivation.
6. **Review on two cadences**: a quick weekly look at Habits, and a monthly or quarterly Goal review. Ask: does each Habit still serve its Goal, and does each Goal still feel like mine?
7. **Show trends, not grades.** Control theory says feelings track rate of progress, which fits the app's "never grade" rule.
8. **Skip identity rewording tricks.** Phrase top-level Goals as who you want to become; don't build features around noun framing.

# Goal hierarchy: how to nest Goals

Researched 2026-11-09 for [#74](https://github.com/Fullchee/journal-native/issues/74).

**Assumption**: the issue asks whether "goldies" are a good way to organise goals. No goal method has that name, so this reads it as a dictation slip for "goal hierarchies", the idea most often credited to Angela Duckworth. If "goldies" meant something else, this doc answers the wrong question.

## Answer

**Adopt Duckworth's goal hierarchy: a Goal may serve one parent Goal, to any depth.**

- **Fits the rules**: a hierarchy only says which direction serves which. It adds no target, score or deadline, so Goals stay directional and never graded.
- **Habits stay the "how"**: Duckworth's low-level goals are the concrete things you do. Here those are Habits, already linked to Goals through `goal_habits`.
- **Reject OKR key results**: a key result is a measurable target that is graded at the end of the period. The "never grade" rule forbids exactly that.
- **Take one idea from Goal Systems Theory**: a means can serve more than one goal. Habits already do (many-to-many). Goals keep one parent, because a tree reads at a glance and a graph does not.

## The rules any method must meet

From `GLOSSARY.md` (Goal) and `journal`'s `docs/agents/goals.md`:

- A Goal is a **direction**, never SMART: no deadline, never "done" on a clock.
- **Never grade**: no score, no pass/fail, no streak, no count. A goal that carries is expected, not a failure.
- Any number is an observe-only **Signal**, shown as a trend, never a target.
- Habits are the _how_; Goals are the _where-to and why_.

## Options

| Method                                                | Shape                                                                             | Measurable targets? | Fits the rules?                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------- |
| Duckworth's goal hierarchy                            | Tree: one top-level goal, mid-level goals under it, low-level goals at the bottom | No                  | **Yes**                                                   |
| OKRs                                                  | Objective plus 2-5 key results, set and graded each quarter                       | Yes, by design      | No                                                        |
| Goal/sub-goal trees (means-ends, Goal Systems Theory) | Graph: goals linked to the means that serve them                                  | Not required        | Partly: the idea fits, the full graph is more than needed |

### Duckworth's goal hierarchy

From _Grit_ (2016), chapter 4, building on Pete Carroll's coaching philosophy and Warren Buffett's "two lists" story.

- **Top-level goal**: one "ultimate concern" that gives the rest meaning. It is abstract and has no finish line.
- **Mid-level goals**: the ways you move toward it. They are swappable: if one is blocked, pick another.
- **Low-level goals**: the concrete, short-term things you do today.
- **Key point**: the higher a goal sits, the more stubborn you are about it; the lower it sits, the more freely you drop it.

Fit:

- The top and mid levels are directions, which is what a Goal already is.
- The low level matches Habits, which already link to Goals.
- Nothing in the hierarchy is graded. Duckworth's advice is about meaning and flexibility, not scoring.
- "About three levels" is a guide, not a rule. The app suggests it and never enforces it.

### OKRs

From Andy Grove (Intel) and John Doerr's _Measure What Matters_ (2018).

- **Objective**: a qualitative direction. On its own this is a Goal.
- **Key results**: 2-5 measurable outcomes per objective, scored 0.0-1.0 at the end of the quarter. 0.7 counts as success for a stretch goal.
- **Cascade**: team OKRs roll up to company OKRs.

Fit:

- Key results are numeric targets with a grade. "Never grade" forbids both, and the goals doc names a pass/fail scorecard as what feeds a discouragement loop.
- Quarterly cadence clashes with Goals that carry for years and are only revised at review.
- What survives, the objective, is a Goal already. Nothing new to adopt.

### Goal/sub-goal trees: means-ends and Goal Systems Theory

- **Means-ends hierarchy** (Carver & Scheier, 1998): goals sit at levels from "be" (identity) through "do" (projects) to motor actions. A lower goal is the means to the one above.
- **Goal Systems Theory** (Kruglanski et al., 2002): goals and means form a network. One means can serve several goals ("multifinality"); one goal can have several means ("equifinality"). A means tied to many goals feels less tied to each one.

Fit:

- The levels agree with Duckworth's, so they support the same tree.
- Multifinality is real, but it already lives where it matters: one Habit can serve many Goals through `goal_habits`.
- A full Goal-to-Goal graph (many parents) breaks the simple "Serves: X" reading and makes cycles easy to create. One parent per Goal keeps it a tree.

## What this changes

- **Data**: `goals.parent_id` points at the Goal this one serves; `NULL` means top-level. Deleting a parent makes its children top-level.
- **API**: Goal writes take `parentId`. The Worker rejects a parent that is missing, the Goal itself or one of its descendants.
- **App**: the Goals section lists Goals as an indented tree. A Goal shows "Serves" and "Broken into" links, and its form picks the Goal it serves.

## Sources

- Angela Duckworth, _Grit: The Power of Passion and Perseverance_ (Scribner, 2016), ch. 4 "Interest" and the goal-hierarchy section.
- John Doerr, _Measure What Matters_ (Portfolio, 2018); Andy Grove, _High Output Management_ (1983).
- Charles S. Carver and Michael F. Scheier, _On the Self-Regulation of Behavior_ (Cambridge, 1998).
- Arie W. Kruglanski et al., "A theory of goal systems", _Advances in Experimental Social Psychology_ 34 (2002).

# Habit swipe actions: what each direction reveals

Researched 2026-11-10 for [#96](https://github.com/Fullchee/journal-native/issues/96), feeding [#91](https://github.com/Fullchee/journal-native/issues/91).

## Answer

**Swipe left commits the day; swipe right puts it off. Every swipe action also stays reachable without a swipe.**

| Swipe                                              | Reveals                                                              | Precedent                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| Left (row slides left, actions on the right edge)  | **Done**, and **Not done** where the Habit allows it (`day.canMiss`) | Todoist and TickTick both offer Complete as a swipe action |
| Right (row slides right, actions on the left edge) | **Skip** for a recurring Habit, **Reschedule** for a One-off         | Things: "Swipe right to bring up When"                     |

- **Skip carries a cause, like Reschedule already does**: **outside** (sick, travelling, weather) is neutral; **avoidance** (I put it off) is flagged for my coach. This answers #91's "valid or a warning sign?" with the user's own label, not the app's guess.
- **No "snooze"**: `GLOSSARY.md` lists snooze under _Avoid_ for Reschedule. A recurring Habit has no date to move, so its put-off action is Skip.
- **No full-swipe commit at first**: a full swipe that fires Done or Skip with no second tap is easy to trigger by accident while scrolling. Reveal the buttons and tap one. Add full-swipe later if the reveal feels slow.
- **Keep the row's buttons**: Done, Not done and Reschedule stay on the row. WCAG 2.5.1 requires a non-swipe path, and Done is already one tap.
- **No Delete or Edit on swipe**: those belong on the Habit page (`onOpen`), not on Today.

## How the apps split the directions

| App                | Swipe actions                                                                                      | Skip / put off                                                                                                                                             | Source                |
| ------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Things             | Left: select. Right: When (schedule).                                                              | Deferring is a When date, not a status                                                                                                                     | Cultured Code support |
| Todoist            | User picks per direction: Complete, Schedule, Delete, Reminders (iOS) or Select (Android)          | Schedule moves the date                                                                                                                                    | Todoist help          |
| TickTick           | Four slots (short/long, left/right): None, Complete Task, Due Date, Priority, Move to, Delete Task | Due Date moves the date                                                                                                                                    | TickTick blog, 2016   |
| Streaks            | Not documented                                                                                     | A day is **Completed**, **Missed** or **Skipped**; skipped "will keep your streak the same as the previous day"                                            | Streaks help          |
| Loop Habit Tracker | Not documented (Android, tap to toggle)                                                            | A dash: "skipped on this day: this leaves the score unchanged and doesn't break the streak"; meant for days "there was no possibility to fulfil the habit" | Loop FAQ              |
| Habitica           | Not documented                                                                                     | No per-task skip. **Rest in the Inn** pauses damage from all missed Dailies at once                                                                        | Habitica wiki         |

Patterns:

- **Done and Schedule are the two near-universal swipe actions.** Every to-do app that documents swipes offers both. Things splits them across directions, with deferral on the right.
- **No primary source fixes a default direction for Done.** Todoist and TickTick let the user choose, so either side is defensible. Done on the left keeps "put off" on the right, where Things puts it and where #91 asked for it.
- **Habit trackers treat skip as neutral, but only for days you couldn't do it.** Streaks and Loop both keep the streak or score unchanged. Loop's FAQ scopes skip to days with "no possibility" of doing the habit, such as being away. Neither app records skips caused by avoidance.
- **Habitica pauses everything, not one task.** Its Inn protects you from damage for missed Dailies while you rest. That is a vacation mode, not a per-row action.

## Why a cause on Skip

#91 asks whether skipping is fine or a warning sign. The apps answer "fine" because they only expect skips for days you couldn't do the habit. Here, a skip can also be avoidance, and the coach should see that.

The app already solves this for One-offs. A **Reschedule** keeps the old date and a cause: **outside** or **avoidance**, plus an optional note. "My coach sees every Reschedule, with the avoidance ones flagged" (`GLOSSARY.md`). Skip on a recurring Habit reuses the same two causes:

- **Outside**: neutral, like Streaks' and Loop's skip. It is not a miss.
- **Avoidance**: flagged in the same place avoidance Reschedules are.
- **Never graded**: neither cause counts against the Habit; the flag is information for the coach, not a score.

Skip needs a new stored state. Today a day's count is a number, a positive count or `MISSED`. A skip with its cause needs its own value or row, decided in the build ticket.

## Accessibility: a swipe is never the only way

- **WCAG 2.5.1 Pointer Gestures (Level A)**: "All functionality that uses multipoint or path-based gestures for operation can be operated with a single pointer without a path-based gesture." Its Understanding page lists swiping as a path-based gesture. The row's tap buttons meet this.
- **WCAG 2.5.7 Dragging Movements (Level AA)**: a drag needs a single-pointer alternative, and that alternative "can't exclusively rely on a path-based gesture, such as swiping."
- **Apple HIG, Gestures**: "Don't use touch as the only way to access controls or features." A custom gesture should be "not the only way to perform an important action".
- **Android, Add accessibility actions**: "if your app lets users drag an item to another location or swipe on an item in a list", expose it as a custom accessibility action so TalkBack, Voice Access and Switch Access users can run it from the actions menu.
- **In React Native**: set `accessibilityActions` (for example `{ name: 'skip', label: 'Skip today' }`) and `onAccessibilityAction` on the row. Skip has no button on the row, so it needs this action, or a visible button, to be reachable without a swipe.

## Gesture library

**Use `ReanimatedSwipeable` from `react-native-gesture-handler`. It is already a dependency.**

- **Installed**: `package.json` has `react-native-gesture-handler` `~3.3.0` (3.3.0 installed) and `react-native-reanimated` `4.7.1`. `src/ui` has Reanimated but not Gesture Handler.
- **Platforms**: Expo's docs list Android, iOS and Web, and it ships in Expo Go. The package has web handlers (`src/web/`), and `ReanimatedSwipeable` has a web branch.
- **Import**: `import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable'`. In 3.3.0 the old non-Reanimated `Swipeable` component is gone, so this is the only option.
- **API**: `renderLeftActions` shows when the row is swiped right; `renderRightActions` when it is swiped left. `leftThreshold` and `rightThreshold` default to half the panel width. `onSwipeableOpen` reports the direction.
- **Setup needed**: the docs require the app to be wrapped in `GestureHandlerRootView`. No app code uses Gesture Handler yet, so the root layout needs the wrapper.
- **Where it lives**: `HabitDueRow` is in `src/ui`. Either add Gesture Handler to `src/ui` as a peer dependency, or wrap the row in the app's `DueRow`. The first keeps the swipe in Storybook.
- **Web**: mouse users won't think to drag a row. On web the buttons stay the main path, and the swipe is a bonus for touch screens.

## Sources

- Cultured Code, [Things support: selecting and moving to-dos](https://culturedcode.com/things/support/articles/2803582/): "To select a to-do, swipe it to the left"; "Swipe right to bring up When".
- Todoist, [How to change your swipe actions](https://www.todoist.com/help/articles/how-to-change-your-swipe-actions-D5DQOQz6).
- TickTick, [Customize your swipe options in TickTick 2.7.5](https://blog.ticktick.com/2016/04/25/customize-your-swipe-options-in-ticktick-275/) (2016; may be out of date).
- Streaks, [Edit History](https://streaks.app/help/task_edit_history/) and [2-Day Rule](https://streaks.app/help/n-day-rule/).
- Loop Habit Tracker, [FAQ discussion #689](https://github.com/iSoron/uhabits/discussions/689).
- Habitica wiki, [Rest in the Inn](https://habitica.fandom.com/wiki/Rest_in_the_Inn).
- W3C, [Understanding SC 2.5.1 Pointer Gestures](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html) and [Understanding SC 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
- Apple, [Human Interface Guidelines: Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures).
- Android Developers, [Principles for improving app accessibility](https://developer.android.com/guide/topics/ui/accessibility/principles#accessibility-actions).
- React Native, [Accessibility: accessibility actions](https://reactnative.dev/docs/accessibility#accessibility-actions).
- Software Mansion, [ReanimatedSwipeable](https://docs.swmansion.com/react-native-gesture-handler/docs/components/reanimated_swipeable); Expo, [GestureHandler](https://docs.expo.dev/versions/latest/sdk/gesture-handler/).
- Repo: `GLOSSARY.md` (One-off, Reschedule), `src/ui/components/habit-due-row.tsx`, `src/components/today/habits-due-today.tsx`, `src/core/habit-day.ts`.

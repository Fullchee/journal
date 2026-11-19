# Android UX audit: journal-native

Audited 2026-11-15 from source plus web-build screenshots (412, 1440, dark, 200% text). Checklist: `android-ux-practices.md`.

## Audit Health Score

| #         | Dimension            | Score     | Key Finding                                                                        |
| --------- | -------------------- | --------- | ---------------------------------------------------------------------------------- |
| 1         | Accessibility        | 2         | Shared Button targets are 32–40dp; tab labels fail contrast; text clips at 200%    |
| 2         | Performance          | 3         | Plan the day waits about 7 s on text-only loading before an error                  |
| 3         | Appearance & Theming | 3         | Tokens throughout; overdue Habits turn scarlet; crash screen is black and unthemed |
| 4         | Platform Conformance | 2         | Habit with no start date crashes; typed drafts vanish on Back or Prev/Next         |
| 5         | Adaptivity           | 2         | Forms have no keyboard avoidance; two-pane shows a blank detail and no selection   |
| **Total** |                      | **12/20** | **Acceptable (significant work needed)**                                           |

## Platform Conformance Verdict

**Borderline pass.** The skeleton is native; many controls are still web-shaped.

**Reads native:**

- **Navigation**: five-tab bottom bar with icons and labels; system Back drives every screen.
- **Pickers**: Android date and clock dialogs, number-pad keyboards.
- **Theming**: one token set feeds RN, React Navigation and the Toaster, in light and dark.

**Reads as a web port:**

- **Buttons**: shadcn sizes (32–40dp) that shrink further at the `sm:` breakpoint (640dp+).
- **Switch**: an 18x32dp web pill; its label does not toggle it.
- **Undo**: a 5 s toast at the top, not a bottom snackbar.
- **Sheets**: bottom panels fade in, with no handle, swipe-down or bottom inset.
- **Back**: Predictive Back is switched off in `app.json`, with no reason recorded.
- **Insets**: stack screens and three forms ignore the bottom and IME insets under edge-to-edge.
- **Crash screen**: Expo's black developer page, even in light mode.

## Executive Summary

- **Score**: 12/20 (Acceptable).
- **Issues**: 40 after merging 54 raw findings. 2 refuted findings dropped.

| Severity    | Count |
| ----------- | ----- |
| P0 Blocking | 1     |
| P1 Major    | 3     |
| P2 Minor    | 19    |
| P3 Polish   | 17    |

**Top 5 issues:**

1. **[P0] Habit with no start date crashes** Edit and History (`src/core/habit-history.ts:77`).
2. **[P1] Typed text vanishes silently** on Close a period, Weekly retro, notes and Connections.
3. **[P1] The keyboard covers fields and Save** on One-off, Log habits, Close a period and Weekly retro.
4. **[P1] Shared Button targets are 32–40dp**, under DESIGN's 44 and Android's 48, and shrink on tablets.
5. **[P2] Undo lasts 5 s at the top edge**, far from the thumb and too short for TalkBack.

**Next steps:** fix the crash, then drafts, insets and targets. Then run the P2 accessibility pass.

## Detailed Findings by Severity

### P0 Blocking

#### [P0] Edit habit and History crash for a Habit with no start date

- **Location**: `/habit/[id]`, `/habit/[id]/history`; `src/core/habit-history.ts:77`, from `src/app/habit/[id]/index.tsx:234` and `history.tsx:133`
- **Category**: Conformance
- **Evidence**: `habit_stretch-412-light.png` shows "Error: Invalid time value". Migration 0008 allows `start_date = ''`. `daysFrom('', today)` reaches `dayOfMs`, which throws. `hasHistory` checks only the Frequency.
- **Impact**: The Habit cannot be edited, moved, deleted or reviewed. The alarm and widget `?edit=<id>` link crashes too.
- **Guideline**: Core app quality: no crashes; the core task must finish.
- **Recommendation**: Return `[]` from `periodStarts` and `monthBounds` when `startDate` is empty, or make `hasHistory` require it. Add a core test.
- **Suggested command**: `/impeccable harden`

### P1 Major

#### [P1] Typed text is discarded with no warning (merged: 2 findings)

- **Location**: `/close-period` (`close-period.tsx:76-95, 195-196, 270-272, 331-335`); `/weekly-review` (`weekly-review.tsx:51-64`); `note-body.tsx:127-156`; `connections/[id].tsx:96-137`; `/one-off`, `/log-entry`
- **Category**: Conformance
- **Evidence**: A `key` change on Prev/Next or Quarter/Year remounts the form and drops its `useState`. "Draft with AI" overwrites text without asking. `GOALS_CHANGED` tells the owner to switch periods, which wipes the form. Only the Habit editor uses `usePreventRemove`.
- **Impact**: A quarterly close or weekly retro is minutes of writing. One tap on Prev, Year or Back loses it.
- **Guideline**: Draft safety: Back never loses typed text silently; COGA 4.5.9 Progress kept.
- **Recommendation**: Keep drafts per period or week and restore on remount. Add the Habit editor's `usePreventRemove` "Discard edits?" guard. Ask before AI replaces text. Rewrite `GOALS_CHANGED`.
- **Suggested command**: `/impeccable harden`

#### [P1] Keyboard and bottom insets are missing on stack screens and forms (merged: 3 findings)

- **Location**: `src/components/screen.tsx:5-15`; `one-off.tsx:88-130`; `log-entry.tsx:126-159`; `close-period.tsx:345-383`; `weekly-review.tsx:174-185`; `/settings`, `/plan`, `/session-brief`, detail screens
- **Category**: Adaptivity
- **Evidence**: `Screen` is a ScrollView with `p-4` only: no `insets.bottom`, no IME handling. Only `log.tsx` and Today wrap in `KeyboardAvoidingView`; their own comment says edge-to-edge no longer resizes. Source only: web insets are 0.
- **Impact**: The keyboard hides the last field and the pinned Save. The gesture bar can cover the last control on long pages.
- **Guideline**: Keyboard: focused field and submit stay visible; List bottom inset under edge-to-edge.
- **Recommendation**: In `Screen`, add `insets.bottom` to the padding. Adopt one keyboard-aware scroll (Today's pattern or `KeyboardAwareScrollView`) for every form.
- **Suggested command**: `/impeccable adapt`

#### [P1] Shared Button targets are 32–40dp and shrink at 640dp+ (merged: 4 findings)

- **Location**: `src/ui/components/button.tsx:43-47`; `habit-due-row.tsx:72,85,214,404`; `check-in-card.tsx:261-269, 344-349`; `check-in-panels.tsx:64-99`; `modal-header.tsx:15`; `habit-day-detail.tsx:99`; `dialog.tsx:94-98`
- **Category**: Accessibility
- **Evidence**: default `h-10 sm:h-9`, sm `h-9 sm:h-8`, icon `h-10 w-10 sm:h-9`. tailwind-merge keeps `sm:h-9` when a caller passes `h-11`. Screenshots: "Now" about 36px; range chips 32px and toggles 36px at 1440.
- **Impact**: The most-repeated controls (Done, Skip, Now, Save, Close, range chips) are easy to miss in Storm. Tablets get smaller targets, not larger.
- **Guideline**: 48dp targets (Core quality Touch_Target_Size); DESIGN.md 2.75rem minimum.
- **Recommendation**: Set every size to `min-h-12` (48dp) on native. Remove the `sm:` shrink, or limit it to pointer-driven web. Use `hitSlop` where the visual must stay small.
- **Suggested command**: `/impeccable harden`

### P2 Minor

| Issue                                                                              | Location                                                                                                             | Category      | Fix                                                                                   | Command                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------- | ---------------------- |
| **Switch** is 18x32dp; tapping its label does nothing                              | `switch.tsx:10`; `habit-form.tsx:552-558`; `connection-form.tsx:149-167`                                             | Accessibility | Make the label row the Pressable (role switch, `min-h-12`), or use RN `Switch`        | `/impeccable harden`   |
| **Undo toast** lasts 5 s at the top (merged: 2)                                    | `undo-toast.ts:2`; `toast.tsx:7-20,39`; `toast.web.tsx:20`                                                           | Conformance   | `bottom-center` above the tab bar; 10 s; wait for dismiss while TalkBack is on        | `/impeccable harden`   |
| **Inactive tab labels**: 10px at about 3.2:1, not graphite                         | `(tabs)/_layout.tsx:28,41-47`                                                                                        | Accessibility | Pass inactive/active tint from tokens; raise label to 12px+                           | `/impeccable colorize` |
| **Tab labels** scale without limit in a fixed-height bar                           | `(tabs)/_layout.tsx:27-28,41-47`                                                                                     | Accessibility | `maxFontSizeMultiplier` about 1.3, or let the bar grow                                | `/impeccable typeset`  |
| **200% text**: zone-plate labels read "JPPER"; Log box placeholder cut (merged: 2) | `check-in-card.tsx:279-317`; `log-composer.tsx:97`                                                                   | Accessibility | Cap or shrink-to-fit the plate label; 2x2 grid at fontScale 1.5+; shorter placeholder | `/impeccable typeset`  |
| **"Next period" arrow** pushed off screen at 200%                                  | `check-in-panels.tsx:81-102`                                                                                         | Adaptivity    | Remove `min-w-40`; let the label flex and wrap                                        | `/impeccable adapt`    |
| **Chart SVG text** fixed at 10dp, ignores font scale                               | `check-in-chart.tsx:40, 98-104, 424-433`                                                                             | Accessibility | Scale by `PixelRatio.getFontScale()` (capped), or draw labels as RN `Text`; base 12+  | `/impeccable typeset`  |
| **Chart** reads only "Check-in chart" to TalkBack                                  | `check-in-chart.tsx:437-443`                                                                                         | Accessibility | Summary label from the data; role image or step actions                               | `/impeccable harden`   |
| **Crash screen** is black in light mode with the raw error (merged: 2)             | `src/app/_layout.tsx:47`                                                                                             | Theming       | Custom themed ErrorBoundary: plain sentence, Retry, "Back to Today"; keep Sentry      | `/impeccable harden`   |
| **Overdue Habits** turn scarlet with bold "Overdue" (merged: 2)                    | `habit-due-row.tsx:178-190, 472`                                                                                     | Theming       | Graphite or ink with a neutral label; keep scarlet for weeds over ceiling             | `/impeccable quieter`  |
| **Day strip cells** read an ISO date and hide missed/count state                   | `habit-week.tsx:89-104, 139-146`                                                                                     | Accessibility | Spoken Day plus status; role checkbox with `aria-checked`                             | `/impeccable harden`   |
| **Habit row** label drops stage, progress and Streak                               | `habit-card.tsx:197-219`                                                                                             | Accessibility | Drop the `aria-label` override or build a full one                                    | `/impeccable harden`   |
| **Check-in rows** have no role or edit label                                       | `check-in-list.tsx:47-55`                                                                                            | Accessibility | `role="button"` and "Edit mood, 9:40 AM" when editable; View otherwise                | `/impeccable harden`   |
| **Save errors and "Saved"** are not announced                                      | `connections/[id].tsx:134,211`; `weekly-review.tsx:86,187-191`; `note-body.tsx:79-81,172`; `connection-list.tsx:131` | Accessibility | Add `aria-live` (polite; assertive for errors) via a shared status Text               | `/impeccable harden`   |
| **Empty cells and chips** outlined at about 1.5:1                                  | `habit-week.tsx:98`; `form-fields.tsx:42`; `habit-card.tsx:154`                                                      | Accessibility | Use `border-input` (about 3.5:1) for tappable strokes                                 | `/impeccable polish`   |
| **One-tap deletes** with no Undo: Duration entry, Part (merged: 2)                 | `habit-day-detail.tsx:98-107`; `parts/[id].tsx:36-51`                                                                | Conformance   | Optimistic remove plus Undo snackbar; more space from Retire                          | `/impeccable harden`   |
| **Bottom panels**: fade in, no handle, swipe or inset (merged: 2)                  | `habit-day-detail.tsx:41-53`; `reschedule-sheet.tsx:98-110`                                                          | Conformance   | Slide in, handle plus pan-to-dismiss, bottom inset; or a centred dialog               | `/impeccable adapt`    |
| **Two-pane**: no selected row, blank detail, stray Up arrow                        | `two-pane.tsx:7-19`; `nav-row.tsx:13-31`; `screen.tsx:28-35`                                                         | Adaptivity    | `selected` state on NavRow; open Health plan by default; hide first Up                | `/impeccable layout`   |
| **Empty states** state a fact with no next step                                    | `check-in-chart.tsx:330-331`; `check-ins.tsx:257-274`; `connection-list.tsx:238`; `note-body.tsx:26-27`              | Conformance   | Add the reason and one action ("Show all", "Check in on Today", "New person")         | `/impeccable onboard`  |

### P3 Polish

| Issue                                                       | Location                                                       | Category      | Command               |
| ----------------------------------------------------------- | -------------------------------------------------------------- | ------------- | --------------------- |
| **Predictive Back** off, undocumented (merged: 2)           | `app.json:16`                                                  | Conformance   | `/impeccable harden`  |
| **Focus ring** 50% green, about 2.3:1                       | `button.tsx:11`; `input.tsx:12`; `switch.tsx:12`               | Adaptivity    | `/impeccable polish`  |
| **Time box** looks like a button, does nothing (merged: 2)  | `habit-due-row.tsx:175-195`                                    | Conformance   | `/impeccable clarify` |
| **Notification permission** asked at first launch           | `_layout.tsx:136-141`; `use-alarm-schedule.android.ts:134-153` | Conformance   | `/impeccable onboard` |
| **Log habits** saves silently, no Receipt or Undo           | `log-entry.tsx:121-123`                                        | Conformance   | `/impeccable clarify` |
| **Plan the day**: text-only loading, 3 retries before error | `plan.tsx:63-94, 331`; `plan.ts:75-79`                         | Performance   | `/impeccable harden`  |
| **Check-in "Skip"** reuses the Habit Skip word              | `check-in-card.tsx:347-349`                                    | Conformance   | `/impeccable clarify` |
| **Disabled Save** reason sits far away and is silent        | `one-off.tsx:123`; `log-entry.tsx:87`                          | Accessibility | `/impeccable clarify` |
| **Stage filter row** clips at 200%; hides the tracker       | `habit-filter-bar.tsx:29-36`                                   | Adaptivity    | `/impeccable adapt`   |
| **No press feedback** on cells, chips, Habit name           | `habit-week.tsx:69,89`; `habit-card.tsx:147,197`               | Conformance   | `/impeccable polish`  |
| **Duration link** without params crashes                    | `habit/[id]/duration.tsx:19-20`                                | Conformance   | `/impeccable harden`  |
| **Chips** are pills, not 3px near-square                    | `form-fields.tsx:41`; `habit-card.tsx:153`                     | Theming       | `/impeccable polish`  |
| **Skip cause** shows only on long-press                     | `habit-week.tsx:102,169-171`                                   | Conformance   | `/impeccable clarify` |
| **Load errors** say "try again" with no Retry button        | `note-body.tsx:171-172`; `connection-list.tsx:237`             | Conformance   | `/impeccable harden`  |
| **Check-in search results** are dead text                   | `check-in-panels.tsx:164-173`                                  | Conformance   | `/impeccable layout`  |
| **Weekly retro day labels** lack the heading role           | `weekly-review-days.tsx:75-77`                                 | Accessibility | `/impeccable typeset` |
| **Chart tooltip** floats on a shadow                        | `check-in-chart.tsx:299`                                       | Theming       | `/impeccable polish`  |

## Patterns & Systemic Issues

| Pattern                                    | Where it shows                                                      | Root fix                                                         |
| ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Web-sized controls**                     | Button, Switch, icon buttons, chips, focus ring                     | Native sizes in `button.tsx` and `switch.tsx`; drop `sm:` shrink |
| **No draft protection**                    | Close a period, retro, notes, Connections, One-off, Log habits      | One shared `usePreventRemove` guard plus per-key draft storage   |
| **`Screen` ignores insets**                | Every stack screen and form                                         | Bottom and IME insets inside `Screen` once                       |
| **200% text breaks fixed widths**          | Zone plates, tab bar, period arrows, filter row, chart axis         | Flex and wrap first; cap only space-bound labels                 |
| **Status not spoken**                      | Save errors, "Saved", strip cells, Habit rows, Check-in rows, chart | Shared live-region status Text; build labels from state          |
| **One-off red and shame cues**             | Overdue Habits, crash screen                                        | Keep scarlet to the Single Red Rule                              |
| **Destructive or lossy taps with no Undo** | Duration delete, Part delete, AI overwrite                          | Reuse the undo toast everywhere                                  |

## Positive Findings

- **System Back**: no `BackHandler`; Modals pass `onRequestClose`; `dismissModal` falls back to Today for cold deep links.
- **Tokens**: every light token has a night twin; React Navigation and the Toaster read the same variables.
- **Habit rows for TalkBack**: role checkbox, unique labels, `accessibilityActions` on the name.
- **Undo over confirm**: one replacing toast; Skip records first, asks the cause second.
- **One-tap Check-in**: saves at once, announces "Saved Storm upper.", celebrations honour Reduce Motion.
- **Font scaling on**: no `allowFontScaling={false}` anywhere.
- **Native pickers and keyboards**: Android date/clock dialogs; `number-pad` for counts.
- **Habit editor**: asks "Discard changes?" only when the draft changed.
- **Two-pane by window width**, keeping the detail Stack mounted across the breakpoint.
- **Honest offline states**: disabled buttons say why; queued checks work offline.

## Documented deviations

| Deviation                                            | Android cost                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Top tab bar** at 768dp+ (DESIGN, `use-is-wide.ts`) | On tablets and foldables, primary nav sits farthest from the thumb; M3 expects a start-edge rail |
| **Wide layout starts at 768**, not 600dp             | 600–767dp windows get the phone bar and one capped pane                                          |
| **Active tab by colour only**, no M3 pill            | Weaker today because inactive labels render at 50% ink; the contrast fix restores it             |
| **Touch minimum 44px**, not 48dp                     | DESIGN never weighed the 4dp gap; the 7-cell strip is where a miss edits past History            |
| **Small-caps labels with tracking**                  | 10–15% wider labels add to 200% clipping                                                         |
| **Portrait lock** (`app.json:6`), undocumented       | Android 16 ignores it at 600dp+; phones lose landscape with a keyboard or car mount              |
| **Flat hairline depth**, no elevation                | Not reported; the sheet frame is faint against the dark scrim                                    |
| **Card and Button radii**                            | Listed in DESIGN Implementation Gaps; not reported                                               |

## Not checked on web

The web build cannot verify these. Check them on the emulator or a device:

- **System bars and insets**: web insets are 0; edge-to-edge, cutouts, scrims and gesture zones need Android.
- **Predictive back**: back-to-home preview, `BackHandler` order and Back in sheets.
- **TalkBack**: reading order, spoken labels, live regions and focus moves.
- **Font scale**: Android's 200% nonlinear scale differs from browser zoom.
- **Ripples and haptics**: `android_ripple` and `expo-haptics` do nothing on web.
- **Soft keyboard**: IME resize, `keyboardType` and `returnKeyType`.
- **Startup and jank**: cold start and frame times need a release build with Perfetto.
- **Reduced motion**: Android's "Remove animations" differs from `prefers-reduced-motion`.
- **Native surfaces**: notifications, widgets, share sheet and permission prompts.
- **Rail and resize**: rotation, fold and split-screen state loss.

**Seed data**: the seed holds only two Habits. Empty states dominate Check-ins, Connections and Notes screens, so dense-list layouts went unseen.

## Recommended Actions

1. **[P0] `/impeccable harden`**: fix the empty start date crash and the Duration link crash.
2. **[P1] `/impeccable harden`**: add draft guards and per-period drafts; raise Button targets to 48dp.
3. **[P1] `/impeccable adapt`**: bottom and IME insets in `Screen` and the three forms.
4. **[P2] `/impeccable harden`**: themed ErrorBoundary, bottom 10 s Undo, delete Undo, Switch target, TalkBack labels and live regions.
5. **[P2] `/impeccable typeset`**: 200% clipping on plates, tabs and chart axis.
6. **[P2] `/impeccable colorize`**: tab label tints from tokens.
7. **[P2] `/impeccable quieter`**: overdue Habits in graphite, not scarlet.
8. **[P2] `/impeccable adapt`**: real bottom sheets; period arrows that wrap.
9. **[P2] `/impeccable layout`**: two-pane selection and default detail.
10. **[P2] `/impeccable onboard`**: empty states with a next step; ask for notifications in context.
11. **[P3] `/impeccable clarify`**: Skip wording, Log habits Receipt, time box, Save reason.
12. **`/impeccable polish`**: focus ring, chip shape and strokes, press feedback, tooltip shadow.

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/impeccable audit` after fixes to see your score improve.

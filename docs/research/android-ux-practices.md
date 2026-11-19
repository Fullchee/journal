# Android UX checklist for a React Native app

Researched 2026-11-15 for an audit of the journal app (Expo SDK 58, React Native 0.88). Sources: Material 3, Android core and adaptive app quality, Android accessibility, Android 15 and 16 behavior changes, Android vitals, W3C COGA.

## Answer

**Audit each screen against the items below. Each item is one pass/fail sentence.**

- **Tags** say how to check it: **[screenshot]** from a web-build screenshot, **[source]** from the React Native code, **[both]** from either.
- **Primary first**: Android's own quality pages set the hard numbers (48dp, 4.5:1, 5 s cold start). Material 3 sets component behavior.
- **m3.material.io renders in the browser** and returned no text to a fetch. Its items come from the published M3 guidance; open the link before quoting a number.
- **Attention and low energy**: the only credible source found is W3C COGA, which names ADHD. Its items sit at the end of Accessibility.

## Navigation & Back

- [ ] **Bar size**: the bottom navigation bar has 3 to 5 destinations. [screenshot] ([M3 nav bar](https://m3.material.io/components/navigation-bar/guidelines))
- [ ] **Bar labels**: each navigation destination shows an icon and a text label. [screenshot] ([M3 nav bar](https://m3.material.io/components/navigation-bar/guidelines))
- [ ] **Active tab**: the selected destination has a visible active indicator, not just a color change on the icon. [screenshot] ([M3 nav bar](https://m3.material.io/components/navigation-bar/guidelines))
- [ ] **Top bar title**: each screen below a tab root shows its title and an Up arrow at the start of the top app bar. [screenshot] ([M3 top app bar](https://m3.material.io/components/top-app-bar/guidelines))
- [ ] **No custom Back prompt**: no screen draws its own "press back again to exit" or onscreen Back button in place of system Back. [both] ([Core quality: Back_Button_Nav](https://developer.android.com/docs/quality-guidelines/core-app-quality))
- [ ] **Back pops one level**: system Back closes the topmost sheet, dialog or menu first, then the screen, then leaves the app from a tab root. [source] ([Predictive back](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture))
- [ ] **No Back for logic**: `BackHandler` listeners only close UI or confirm discarding a draft; none log, save or fetch. [source] ([Predictive back: callbacks](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture))
- [ ] **BackHandler scope**: each `BackHandler` subscription is added on focus and removed on blur, so it never blocks Back on another screen. [source] ([Predictive back](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture))
- [ ] **Predictive back on**: `android:enableOnBackInvokedCallback` is not set to `false` in `app.json` or a config plugin. [source] ([Android 16 changes](https://developer.android.com/about/versions/16/behavior-changes-16))
- [ ] **No KEYCODE_BACK**: no native module listens for `KEYCODE_BACK` or overrides `onBackPressed`; Android 16 no longer sends them. [source] ([Android 16 changes](https://developer.android.com/about/versions/16/behavior-changes-16))
- [ ] **Draft safety**: leaving a screen with unsaved input keeps the draft or asks first; Back never loses typed text silently. [both] ([Core quality: State_Preservation](https://developer.android.com/docs/quality-guidelines/core-app-quality))
- [ ] **Deep links**: every route a notification, widget or link opens lands on a screen with a working Back or Up path. [source] ([Core quality](https://developer.android.com/docs/quality-guidelines/core-app-quality))

## Layout & insets

- [ ] **Edge-to-edge**: screen backgrounds and scrolling content draw behind the status and navigation bars. [source] ([Edge-to-edge design](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge))
- [ ] **No opt-out**: no `windowOptOutEdgeToEdgeEnforcement` in theme or config; Android 16 ignores it. [source] ([Android 16 changes](https://developer.android.com/about/versions/16/behavior-changes-16))
- [ ] **Tappables inset**: buttons, FABs, tabs and text fields sit inside `useSafeAreaInsets()` or `SafeAreaView` padding. [source] ([Edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge))
- [ ] **List bottom inset**: each scroll view adds the bottom inset to `contentContainerStyle`, so the last item scrolls clear of the navigation bar. [source] ([Edge-to-edge: scrolling content](https://developer.android.com/develop/ui/views/layout/edge-to-edge))
- [ ] **No gestures at edges**: no swipe or drag target starts within the side and bottom system-gesture zones. [source] ([Edge-to-edge design](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge))
- [ ] **Cutout**: text and buttons stay out of the display cutout; only backgrounds draw into it. [source] ([Edge-to-edge design: cutouts](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge))
- [ ] **Status bar contrast**: status bar icons switch light or dark with the theme, and content scrolling under them has a scrim or solid top bar. [source] ([Edge-to-edge: protection](https://developer.android.com/develop/ui/views/layout/edge-to-edge))
- [ ] **No double scrim**: at most one status bar protection is drawn (top bar background or gradient, not both). [source] ([Edge-to-edge design](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge))
- [ ] **Keyboard**: the focused text field and its submit button stay visible when the soft keyboard opens. [both] ([Layout basics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics))
- [ ] **Consistent spacing**: like elements use the same gaps and alignment across screens. [screenshot] ([Layout basics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics))
- [ ] **Few actions**: no screen shows more than one primary action plus a handful of secondary ones above the fold. [screenshot] ([Layout basics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics))
- [ ] **Reach**: primary navigation and the main action sit in the bottom half of a phone screen. [screenshot] ([Layout basics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics))
- [ ] **Line length**: body text blocks wrap at 45 to 75 characters on wide windows. [screenshot] ([Core quality: Line_Length](https://developer.android.com/docs/quality-guidelines/core-app-quality))

## Touch & gestures

- [ ] **48dp targets**: every tappable element is at least 48 by 48dp, through size or `hitSlop`. [both] ([Accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps), [Core quality: Touch_Target_Size](https://developer.android.com/docs/quality-guidelines/core-app-quality))
- [ ] **Target spacing**: neighboring targets have at least 8dp between their touch areas. [screenshot] ([M3 structure](https://m3.material.io/foundations/designing/structure))
- [ ] **Press feedback**: every `Pressable` shows a ripple (`android_ripple`) or pressed state. [source] ([M3 states](https://m3.material.io/foundations/interaction/states))
- [ ] **Swipe has a tap path**: every swipe or long-press action is also reachable by a visible button or an `accessibilityActions` entry. [source] ([WCAG 2.5.1](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html), [Accessibility actions](https://developer.android.com/guide/topics/ui/accessibility/principles))
- [ ] **No accidental commit**: no full-swipe or single tap deletes data without undo or confirmation. [source] ([W3C COGA 4.5.9](https://www.w3.org/TR/coga-usable/#avoid-data-loss-and-timeouts-pattern))
- [ ] **Drag alternative**: reorder or slider drags have a non-drag alternative. [source] ([WCAG 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html))

## Components

- [ ] **One FAB**: a screen has at most one FAB, and it holds that screen's main action. [screenshot] ([M3 FAB](https://m3.material.io/components/floating-action-button/guidelines))
- [ ] **FAB placement**: the FAB sits at the bottom end corner, above the navigation bar and above any snackbar. [screenshot] ([M3 FAB](https://m3.material.io/components/floating-action-button/guidelines))
- [ ] **Button emphasis**: each view has at most one filled (high-emphasis) button; others are tonal, outlined or text buttons. [screenshot] ([M3 buttons](https://m3.material.io/components/buttons/guidelines))
- [ ] **Button labels**: labels are short verbs in sentence case, not all caps. [screenshot] ([M3 buttons](https://m3.material.io/components/buttons/guidelines))
- [ ] **Chips**: chips filter, suggest or show input; none is a screen's primary action. [screenshot] ([M3 chips](https://m3.material.io/components/chips/guidelines))
- [ ] **Filter chip state**: a selected filter chip shows a check or filled state, not only a color shift. [screenshot] ([M3 chips](https://m3.material.io/components/chips/guidelines))
- [ ] **Dialog use**: dialogs appear only for a decision that blocks the task; info and success go in snackbars or inline. [both] ([M3 dialogs](https://m3.material.io/components/dialogs/guidelines))
- [ ] **Dialog actions**: a dialog has at most two actions, confirm at the end and dismiss before it, each named by its verb. [screenshot] ([M3 dialogs](https://m3.material.io/components/dialogs/guidelines))
- [ ] **No stacked dialogs**: no dialog opens another dialog. [source] ([M3 dialogs](https://m3.material.io/components/dialogs/guidelines))
- [ ] **Sheet dismissal**: a modal bottom sheet has a scrim and closes by swipe down, scrim tap and Back. [both] ([M3 bottom sheets](https://m3.material.io/components/bottom-sheets/guidelines))
- [ ] **Sheet handle**: a draggable bottom sheet shows a drag handle. [screenshot] ([M3 bottom sheets](https://m3.material.io/components/bottom-sheets/guidelines))
- [ ] **List rows**: list rows keep one layout per list (one-, two- or three-line), with leading icons and trailing controls aligned. [screenshot] ([M3 lists](https://m3.material.io/components/lists/guidelines))
- [ ] **Whole row taps**: a tappable list row reacts across its full width, not only on its text. [source] ([M3 lists](https://m3.material.io/components/lists/guidelines))
- [ ] **Field labels**: every text field has a persistent label; a placeholder alone does not count. [screenshot] ([M3 text fields](https://m3.material.io/components/text-fields/guidelines))
- [ ] **Field errors**: an invalid field shows error text below it, not only a red outline. [screenshot] ([M3 text fields](https://m3.material.io/components/text-fields/guidelines))
- [ ] **Keyboard type**: each field sets `keyboardType`, `autoComplete` and `returnKeyType` for its content. [source] ([Core quality: Autofill_Hints](https://developer.android.com/docs/quality-guidelines/core-app-quality))
- [ ] **Sharing**: sharing uses the system share sheet (`Share` or `expo-sharing`), not a custom target list. [source] ([Core quality: System_Sharesheet](https://developer.android.com/docs/quality-guidelines/core-app-quality))

## Feedback & errors

- [ ] **Snackbar shape**: a snackbar has one short line of text and at most one action, with no icon. [screenshot] ([M3 snackbar](https://m3.material.io/components/snackbar/guidelines))
- [ ] **One snackbar**: a new snackbar replaces the old one; they never stack. [source] ([M3 snackbar](https://m3.material.io/components/snackbar/guidelines), [MDC Snackbar](https://github.com/material-components/material-components-android/blob/master/docs/components/Snackbar.md))
- [ ] **Snackbar timing**: a snackbar with an action stays at least 10 s, or until dismissed when a screen reader is on. [source] ([M3 snackbar](https://m3.material.io/components/snackbar/guidelines), [WCAG 2.2.1](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html))
- [ ] **Undo over confirm**: reversible destructive actions offer Undo in a snackbar instead of a confirm dialog. [both] ([M3 snackbar](https://m3.material.io/components/snackbar/guidelines), [W3C COGA 4.5.5](https://www.w3.org/TR/coga-usable/#make-it-easy-to-undo-form-errors-pattern))
- [ ] **Loading state**: any wait over about 1 s shows a progress indicator or skeleton. [both] ([Core quality: App_Startup_Time](https://developer.android.com/docs/quality-guidelines/core-app-quality))
- [ ] **Empty state**: an empty list explains why it is empty and offers the next action. [screenshot] ([W3C COGA 4.5.10](https://www.w3.org/TR/coga-usable/#provide-feedback-pattern))
- [ ] **Error copy**: each error says what happened and how to fix it, in plain words, with no stack trace or code. [screenshot] ([W3C COGA 4.5.7](https://www.w3.org/TR/coga-usable/#use-clear-step-by-step-instructions-pattern))
- [ ] **Offline**: offline and server-error states each have their own message and a retry. [both] ([W3C COGA 4.5.10](https://www.w3.org/TR/coga-usable/#provide-feedback-pattern))
- [ ] **Success shown**: every save, send or delete gives visible confirmation. [both] ([W3C COGA 4.5.10](https://www.w3.org/TR/coga-usable/#provide-feedback-pattern))
- [ ] **Permission ask**: runtime permissions are asked when the feature is used, after a one-line reason, never at launch. [source] ([Core quality: Runtime_Permissions](https://developer.android.com/docs/quality-guidelines/core-app-quality))
- [ ] **Permission denied**: the app keeps working when a permission is denied, and says what is missing. [source] ([Core quality: Graceful_Degradation](https://developer.android.com/docs/quality-guidelines/core-app-quality))

## Typography & scaling

- [ ] **Type scale**: text uses the M3 roles (display, headline, title, body, label in L/M/S), not ad-hoc sizes. [source] ([M3 type scale](https://m3.material.io/styles/typography/type-scale-tokens))
- [ ] **Body size**: body text is at least 14sp, and main reading text 16sp. [both] ([M3 type scale](https://m3.material.io/styles/typography/type-scale-tokens))
- [ ] **Font scaling on**: no `Text` or `TextInput` sets `allowFontScaling={false}`. [source] ([Android 14 font scaling](https://developer.android.com/about/versions/14/features#non-linear-font-scaling))
- [ ] **200% scale**: no screen clips or overlaps text at 200% system font size; `maxFontSizeMultiplier` is set only on space-bound labels such as tabs. [source] ([Android 14 font scaling](https://developer.android.com/about/versions/14/features#non-linear-font-scaling))
- [ ] **No fixed text heights**: containers holding text use `minHeight`, not `height`, so scaled text can grow. [source] ([Android 14 font scaling](https://developer.android.com/about/versions/14/features#non-linear-font-scaling))
- [ ] **Line height scales**: `lineHeight` is set relative to `fontSize`, not as a fixed dp value that clips at large scales. [source] ([Android 14 font scaling](https://developer.android.com/about/versions/14/features#non-linear-font-scaling))
- [ ] **Truncation**: truncated text (`numberOfLines`) has a way to see the full value. [screenshot] ([M3 lists](https://m3.material.io/components/lists/guidelines))

## Color & theme

- [ ] **Light and dark**: every screen supports both themes and follows the system setting. [both] ([Core quality: Theme_Support](https://developer.android.com/docs/quality-guidelines/core-app-quality))
- [ ] **Color roles**: components use paired roles (`primary`/`onPrimary`, `surface`/`onSurface`) from one token file, not inline hex. [source] ([M3 color roles](https://m3.material.io/styles/color/roles))
- [ ] **Surface tiers**: raised surfaces (cards, sheets, bars) use the surface-container roles, not shadows alone, in dark theme. [screenshot] ([M3 color roles](https://m3.material.io/styles/color/roles))
- [ ] **Text contrast**: text under 18sp (14sp bold) has 4.5:1 contrast with its background; larger text has 3:1. [screenshot] ([Accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps), [Core quality: Visual_Contrast](https://developer.android.com/docs/quality-guidelines/core-app-quality))
- [ ] **Non-text contrast**: icons, field outlines and focus rings have 3:1 contrast with adjacent colors. [screenshot] ([WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html))
- [ ] **Not color alone**: status (done, missed, error) shows an icon, label or shape besides its color. [screenshot] ([WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html))
- [ ] **Disabled state**: disabled controls look disabled and set `accessibilityState={{ disabled: true }}`. [both] ([M3 states](https://m3.material.io/foundations/interaction/states))

## Motion

- [ ] **Token durations**: animations use M3 easing and durations (short 50 to 200ms, medium 250 to 400ms, long 450 to 600ms). [source] ([M3 easing and duration](https://m3.material.io/styles/motion/easing-and-duration))
- [ ] **Reduced motion**: Reanimated animations check `useReducedMotion()` or set `reduceMotion`, and skip or shorten when the system "Remove animations" setting is on. [source] ([WCAG 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [Reanimated](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/))
- [ ] **Cheap properties**: animations move `transform` and `opacity`, not `width`, `height`, margin or padding. [source] ([Slow rendering](https://developer.android.com/topic/performance/vitals/render))
- [ ] **No auto-moving content**: nothing auto-scrolls, rotates or loops for longer than 5 s without a pause control. [screenshot] ([WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [W3C COGA 4.9.1](https://www.w3.org/TR/coga-usable/#let-users-control-when-the-content-moves-or-changes-pattern))
- [ ] **Purposeful motion**: each animation shows a cause, a state change or a spatial link; none is decorative on a routine action. [screenshot] ([M3 motion](https://m3.material.io/styles/motion/easing-and-duration))

## Accessibility

- [ ] **Icon labels**: every icon-only control has an `accessibilityLabel` naming its action ("Delete", not "Trash icon" or "Delete button"). [source] ([Accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps))
- [ ] **Unique list labels**: repeated row controls carry the row's content in their label ("Edit Walk"), not a bare "Edit". [source] ([Accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps))
- [ ] **Roles**: custom controls set `accessibilityRole` (button, switch, checkbox, tab, header). [source] ([Accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps))
- [ ] **State**: toggles, checkboxes and tabs set `accessibilityState` for checked, selected or expanded. [source] ([Accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles))
- [ ] **Decorative hidden**: decorative images and icons set `importantForAccessibility="no"` or `accessible={false}`. [source] ([Accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps))
- [ ] **Grouped rows**: a row that reads as one item sets `accessible` on its container, so TalkBack reads it in one stop. [source] ([Accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles))
- [ ] **Headings**: section titles set `accessibilityRole="header"` for TalkBack heading navigation. [source] ([Accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles))
- [ ] **Live updates**: snackbars, inline errors and counters that change without focus use `accessibilityLiveRegion="polite"` or `AccessibilityInfo.announceForAccessibility`. [source] ([Accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles))
- [ ] **Focus after change**: opening a sheet or dialog moves focus into it, and closing it returns focus to the trigger. [source] ([Accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles))
- [ ] **Image alt**: content images (photos, charts) have a label that states what they show. [source] ([Core quality: Content_Description](https://developer.android.com/docs/quality-guidelines/core-app-quality))

**Attention and low energy (W3C COGA):**

- [ ] **Short paths**: the most frequent task completes in one or two taps from launch. [both] ([COGA 4.6.2](https://www.w3.org/TR/coga-usable/#make-short-critical-paths-pattern))
- [ ] **Little content**: each screen leads with one task; secondary content is collapsed or one level down. [screenshot] ([COGA 4.6.3](https://www.w3.org/TR/coga-usable/#avoid-too-much-content-pattern))
- [ ] **No interruptions**: no prompt, badge or popup appears unasked while a task is in progress. [both] ([COGA 4.6.1](https://www.w3.org/TR/coga-usable/#limit-interruptions-pattern))
- [ ] **No memory load**: no step asks the user to recall a value from another screen; show it or fill it in. [screenshot] ([COGA 4.7.5](https://www.w3.org/TR/coga-usable/#do-not-rely-on-users-calculations-or-memorizing-information-pattern))
- [ ] **Progress kept**: partial input survives leaving the app and coming back hours later. [source] ([COGA 4.5.9](https://www.w3.org/TR/coga-usable/#avoid-data-loss-and-timeouts-pattern))
- [ ] **Where am I**: multi-step flows show the current step and how many remain. [screenshot] ([COGA 4.2.4](https://www.w3.org/TR/coga-usable/#make-each-step-clear-pattern))

## Adaptive (wide screens)

- [ ] **Breakpoints**: layout switches on window width at 600dp and 840dp (`useWindowDimensions`), not on device type. [source] ([Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes))
- [ ] **Rail on medium**: at 600dp and wider, primary navigation moves from a bottom bar to a navigation rail at the start edge. [screenshot] ([M3 nav rail](https://m3.material.io/components/navigation-rail/guidelines), [Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes))
- [ ] **No stretched content**: at 840dp and wider, content uses a max width, two panes or a grid instead of full-width rows. [screenshot] ([Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes))
- [ ] **No orientation lock**: `app.json` `orientation` is not locked to portrait; Android 16 ignores the lock on 600dp and wider screens. [source] ([Android 16 changes](https://developer.android.com/about/versions/16/behavior-changes-16))
- [ ] **State on resize**: rotation, fold and window resize keep scroll position and typed text. [source] ([Adaptive ready: Config_Changes](https://developer.android.com/docs/quality-guidelines/adaptive-app-quality/tier-3))
- [ ] **Keyboard and mouse**: every control works by click, Tab focus and Enter, and lists scroll with a wheel. [screenshot] ([Adaptive ready: Keyboard_Input, Mouse_Trackpad_Basic](https://developer.android.com/docs/quality-guidelines/adaptive-app-quality/tier-3))
- [ ] **Focus ring**: interactive elements show a visible focus ring for keyboard focus. [screenshot] ([WCAG 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html))

## Performance

- [ ] **Cold start**: the first screen is usable in under 5 s cold, 2 s warm and 1 s hot, Android vitals' "slow" limits. [source] ([Android vitals](https://support.google.com/googleplay/android-developer/answer/9844486))
- [ ] **Startup feedback**: if launch takes over 2 s, the splash or a skeleton shows progress. [source] ([Core quality: App_Startup_Time](https://developer.android.com/docs/quality-guidelines/core-app-quality))
- [ ] **Lazy startup**: the root layout loads no data, fonts or modules a first screen does not need. [source] ([App startup time](https://developer.android.com/topic/performance/vitals/launch-time))
- [ ] **Frame budget**: scrolling and animations hold 60fps (16ms frames) with no frozen frame over 700ms. [source] ([Slow rendering](https://developer.android.com/topic/performance/vitals/render), [Core quality: Rendering_Performance](https://developer.android.com/docs/quality-guidelines/core-app-quality))
- [ ] **Virtualized lists**: any list that can pass about 30 rows uses `FlatList` or `FlashList` with stable `keyExtractor`, not `ScrollView` with `.map`. [source] ([Slow rendering: lists](https://developer.android.com/topic/performance/vitals/render))
- [ ] **Images sized**: images load at their display size (`expo-image` with sized sources), not full-resolution originals. [source] ([Slow rendering: bitmap uploads](https://developer.android.com/topic/performance/vitals/render))
- [ ] **No JS-thread animation**: gesture and scroll-linked animations run on the UI thread (Reanimated worklets), not `setState` per frame. [source] ([Slow rendering](https://developer.android.com/topic/performance/vitals/render))
- [ ] **No debug code**: release builds exclude debug-only libraries and dev menus. [source] ([Core quality: Production_Build_Quality](https://developer.android.com/docs/quality-guidelines/core-app-quality))

## Web build can't show

A web build and its screenshots cannot verify these. Check them on the emulator or a device:

- **System bars and insets**: web safe-area insets are 0, so edge-to-edge, cutouts, scrims and gesture zones need Android.
- **Predictive back**: the back-to-home preview, `BackHandler` order and Back in sheets run only on Android.
- **TalkBack**: reading order, labels heard aloud, live regions and focus moves need TalkBack on.
- **Font scale**: Android's 200% nonlinear scale differs from browser zoom; set it in Settings > Display.
- **Ripples and haptics**: `android_ripple` and `expo-haptics` do nothing on web.
- **Soft keyboard**: IME resize, `keyboardType` and `returnKeyType` need the Android keyboard.
- **Startup and jank**: cold start, frame times and frozen frames need a release build with Perfetto or GPU profiling.
- **Reduced motion**: Android's "Remove animations" switch differs from the browser's `prefers-reduced-motion`.
- **Native surfaces**: notifications, widgets, the share sheet and permission prompts exist only on Android.
- **Rail and resize**: a resizable emulator or foldable shows rotation, fold and split-screen state loss.

## Sources

- Android Developers: [Core app quality](https://developer.android.com/docs/quality-guidelines/core-app-quality), [Adaptive ready (tier 3)](https://developer.android.com/docs/quality-guidelines/adaptive-app-quality/tier-3), [Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/apps), [Accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles), [Edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge), [Edge-to-edge design](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge), [Layout basics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics), [Predictive back](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture), [Android 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16), [Android 14 features: font scaling](https://developer.android.com/about/versions/14/features#non-linear-font-scaling), [Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes), [App startup time](https://developer.android.com/topic/performance/vitals/launch-time), [Slow rendering](https://developer.android.com/topic/performance/vitals/render).
- Google Play: [Android vitals: startup, ANR and crash thresholds](https://support.google.com/googleplay/android-developer/answer/9844486).
- Material 3 (client-rendered; not fetched): [Navigation bar](https://m3.material.io/components/navigation-bar/guidelines), [Navigation rail](https://m3.material.io/components/navigation-rail/guidelines), [Top app bar](https://m3.material.io/components/top-app-bar/guidelines), [FAB](https://m3.material.io/components/floating-action-button/guidelines), [Buttons](https://m3.material.io/components/buttons/guidelines), [Chips](https://m3.material.io/components/chips/guidelines), [Dialogs](https://m3.material.io/components/dialogs/guidelines), [Bottom sheets](https://m3.material.io/components/bottom-sheets/guidelines), [Snackbar](https://m3.material.io/components/snackbar/guidelines), [Lists](https://m3.material.io/components/lists/guidelines), [Text fields](https://m3.material.io/components/text-fields/guidelines), [Color roles](https://m3.material.io/styles/color/roles), [Type scale](https://m3.material.io/styles/typography/type-scale-tokens), [Easing and duration](https://m3.material.io/styles/motion/easing-and-duration), [States](https://m3.material.io/foundations/interaction/states), [Structure](https://m3.material.io/foundations/designing/structure). Snackbar rules checked against [MDC-Android Snackbar docs](https://github.com/material-components/material-components-android/blob/master/docs/components/Snackbar.md).
- W3C: [WCAG 2.2 Understanding](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html) (2.5.1, 2.5.7, 1.4.1, 1.4.11, 2.2.1, 2.2.2, 2.3.3, 2.4.7); [COGA: Making Content Usable](https://www.w3.org/TR/coga-usable/).
- Software Mansion: [Reanimated accessibility (reduced motion)](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/).

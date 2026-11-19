# Check-in celebration: a calm garden moment instead of confetti

Researched 2026-11-10 for [#97](https://github.com/Fullchee/journal-native/issues/97), which feeds [#90](https://github.com/Fullchee/journal-native/issues/90). Versions are what `package.json` pins on `main`: `react-native-reanimated` 4.7.1, `react-native-svg` 15.16.0, Expo SDK 58. Line counts and effort are estimates, not measurements.

## Answer

**Draw an engraved sprout that grows in one stroke, in leaf green, with `react-native-svg` paths animated by Reanimated.**

1. **Sprout draws itself (pick).** A seed sits on a hairline of soil; a stem and two leaves draw upward by animating `strokeDashoffset`. About 1 s, then it rests. It is line engraving, so it fits the Botanical Folio. Leaf green means "done", so the colour is earned.
2. **Leaf unfurls (runner-up).** One engraved leaf rotates and scales open from its stem with a soft spring. Cheapest: one `Path`, two transforms. Less "seed to growth" story, but the calmest.
3. **Petals drift (only if more joy is wanted).** Five to eight small outline leaves or petals fall slowly and fade. It is confetti slowed down. It costs the most motion and the most code, and it has to vanish entirely under reduced motion.

- **No new dependencies.** Both libraries are already in the app; no Lottie, Rive or Skia files to author.
- **Reduced motion is nearly free for 1 and 2.** Reanimated's `withTiming`/`withSpring` default to `ReduceMotion.System` and jump to the end value. The user sees the finished sprout or open leaf, still and complete.
- **Pair with one haptic.** `expo-haptics` (bundled with SDK 58) gives a single "Confirm" pulse on Android. Fogg's point is that the feeling must come "immediately after" the behaviour; a tap plus a quiet image does that without words.
- **Phase 1 fallback:** confetti, as #90 suggests, is allowed but clashes with `DESIGN.md` ("calm and quiet") and the confetti libraries pull in Skia (see Rejected).

## What the app already says

| Source                                             | Rule that shapes the celebration                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DESIGN.md` Overview                               | "The plate is calm and quiet, built for a phone and for low capacity." Imagery is line engraving; "engraved line art, never filled illustration".                                                                                                                                          |
| `DESIGN.md` One Green Voice Rule                   | "Leaf green means selected, done, today or a link. Never use it for decoration." A finished Check-in is "done", so a green sprout fits.                                                                                                                                                    |
| `DESIGN.md` Garden Stages                          | Stage inks colour text only, never fills. Keep the drawing as strokes.                                                                                                                                                                                                                     |
| `PRODUCT.md`                                       | "No streaks, no scores"; "No cheerleading". So no counter, no "Great job!" text.                                                                                                                                                                                                           |
| `PRODUCT.md` principle 1                           | "Usable in Storm": the celebration must not block the next step or need a dismiss tap.                                                                                                                                                                                                     |
| `src/ui/tokens.css`                                | `--color-primary` `#2f5e34` (night `#9cc78e`), `--color-stage-seed` `#7a5a1e`, `--color-stage-sprout` `#3f7a3a`, `--color-border` `#d3c8ae`. Seed in seed ink, stem in sprout or primary ink, soil in hairline.                                                                            |
| `journal` `docs/habit-loop-research/habit-loop.md` | Fogg: a celebration is "something you think, say, and/or do to make yourself feel a positive emotion", felt "while you are doing the behavior, or immediately after" ([tinyhabits.com/purpose](https://tinyhabits.com/purpose/), [tinyhabits.com/rewire](https://tinyhabits.com/rewire/)). |

## What the calm apps do

| App       | Celebration pattern                                                                                                                                                           | How it's built                                                                                                                              | Takeaway                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Forest    | "Stay off your phone and a tree grows. Leave early and it withers." Past sessions show "as a visual forest" ([App Store](https://apps.apple.com/app/id866450515)).            | Not documented.                                                                                                                             | Growth is the reward. Our Habits already grow seed to tree, so a sprout echoes it. Never wither: no guilt (`PRODUCT.md`). |
| Finch     | "Complete quick self-care exercises to grow your pet"; morning check-ins "energize your pet to go exploring" ([App Store](https://apps.apple.com/app/id1528595748)).          | Not documented.                                                                                                                             | A character that grows. Too cute and too gamified for the Folio, which "rejects the wellness stack".                      |
| Headspace | Calm character animation from an outside studio (Nexus Studios: "over 150 unique characters and environments", [nexusstudios.com](https://nexusstudios.com/work/headspace/)). | Lottie ([LottieFiles showcase](https://lottiefiles.com/showcase/headspace)).                                                                | Needs illustrators and After Effects. Out of reach.                                                                       |
| Duolingo  | Lively, game-like characters.                                                                                                                                                 | Rive: "a web-based tool for making real-time interactive animations" ([Duolingo blog](https://blog.duolingo.com/world-character-visemes/)). | Loud by design; wrong tone and needs Rive files.                                                                          |
| Calm      | No first-party write-up of a completion animation found.                                                                                                                      | Not found.                                                                                                                                  | Not used.                                                                                                                 |

The pattern worth copying is Forest's: the thing you tended grows. The tooling the others use (Lottie, Rive) needs authored files, which #97 rules out.

## Feasibility in this app

### Animating SVG with Reanimated 4

- **Setup**: wrap `Path`, `Circle`, `G` from `react-native-svg` with `Animated.createAnimatedComponent`; drive props with `useAnimatedProps` or inline shared values ([Animating SVG](https://docs.swmansion.com/react-native-reanimated/docs/guides/animating-svg)).
- **Props we need are supported**: `strokeDasharray`, `strokeDashoffset`, `opacity` on every shape; `d` on `Path`; `cx`/`cy`/`r` on `Circle` (same page).
- **Web**: `useAnimatedProps` is supported on Android, iOS and Web ([useAnimatedProps](https://docs.swmansion.com/react-native-reanimated/docs/core/useAnimatedProps)). Reanimated's CSS-style SVG animations on web animate only CSS-mapped attributes and morph `d` only between paths "with the same command structure". Use `useAnimatedProps` + `withTiming` to avoid both limits.
- **Path length**: `react-native-svg` exposes `getTotalLength()` on a shape ref (`src/elements/Shape.tsx`); `pathLength` is only in the web attribute list. We own the paths, so measure each length once and hard-code it.
- **Existing pattern**: `src/ui/components/native-only-animated-view.tsx` skips Reanimated `entering`/`exiting` on web. The celebration should use animated props, not layout animations, so it runs on web too.

### Reduced motion

- **Shared-value animations**: default `ReduceMotion.System`. When reduced motion is on, "`withSpring` and `withTiming` jump straight to `toValue`"; `withDelay` "starts the next animation immediately"; `withSequence` only runs children with reduced motion disabled ([Accessibility guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility)).
- **Hook**: `useReducedMotion()` returns whether reduced motion "was enabled when the app started"; changing the setting doesn't re-render (`src/hook/useReducedMotion.ts`). Fine for a one-shot celebration.
- **Android**: Reanimated reads `Settings.Global.TRANSITION_ANIMATION_SCALE == 0` (`NativeProxy.kt` `getIsReducedMotion`). Accessibility's "Remove animations" writes `"0"` to `WINDOW_ANIMATION_SCALE`, `TRANSITION_ANIMATION_SCALE` and `ANIMATOR_DURATION_SCALE` (AOSP `DisableAnimationsPreferenceController`), so it is detected.
- **Web**: Reanimated checks `window.matchMedia('(prefers-reduced-motion: reduce)')` (`src/ReducedMotion.ts`).
- **CSS animations API**: Reanimated's `animationName` keyframes have no reduced-motion option (none in its docs or `src/css`). If we use it, branch on `useReducedMotion()` ourselves.
- **Standard**: WCAG 2.3.3 (AAA): "Motion animation triggered by interaction can be disabled, unless the animation is essential" ([Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)). A celebration is not essential, so the still end-frame is the right reduced form.

### Haptics

- `expo-haptics` ~58.0.7 is in SDK 58's bundled modules. Android: `performAndroidHapticsAsync(AndroidHaptics.Confirm)`, which needs no `VIBRATE` permission. Web: Vibration API, ignored where unsupported ([Haptics docs](https://docs.expo.dev/versions/latest/sdk/haptics/)). It is a new dependency for this app.

## Candidates

| #   | Candidate               | Motion                                                                                                                          | Reduced motion                                                                                                             | Cost (estimate)                                                                                                                   | Fit                                                                        |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | **Sprout draws itself** | Seed fades in (150 ms), stem then two leaves draw via `strokeDashoffset` (~900 ms, ease-out). Optional 2° sway once at the end. | Free: `withTiming` jumps to the drawn sprout. Drop the sway with `ReduceMotion.System` (default).                          | ~80–120 lines: 3–4 hand-drawn paths, one shared value per stroke, `withDelay` chain. Half a day to draw paths that look engraved. | Best: line engraving, seed-to-growth story, green = done.                  |
| 2   | **Leaf unfurls**        | One leaf `G` rotates from −40° to 0° and scales 0.6 to 1 with a gentle spring (~700 ms); midrib draws in.                       | Free: spring jumps to the open leaf.                                                                                       | ~50–70 lines, one or two paths.                                                                                                   | Good: calmest, cheapest; less narrative.                                   |
| 3   | **Petals drift**        | 5–8 outline petals or leaves fall 60–120 px with slight sideways drift and fade (~1.5 s), random per petal.                     | Must render nothing (or one still petal): `withSequence`/`withRepeat` semantics differ, so branch on `useReducedMotion()`. | ~120–180 lines: per-petal shared values, randomness, cleanup.                                                                     | Weakest: motion-heavy, closest to confetti, decoration rather than "done". |

### Shared rules for any candidate

- **Placement**: inline on the Check-in screen after save, about 64–96 px tall, near the saved state. Not a modal. The next action stays tappable.
- **Length**: under ~1.2 s, plays once, no loop. `pointerEvents="none"`.
- **Ink**: strokes only. Seed in `--color-stage-seed`, stem and leaves in `--color-primary` (or `--color-stage-sprout`), soil line in `--color-border`. Read tokens with Uniwind's `useCSSVariable`, as the chart does (`docs/research/charts.md`).
- **Words**: none, or the existing "Saved" label. No praise copy (`PRODUCT.md` voice).
- **Accessibility**: mark the drawing decorative (`accessibilityElementsHidden` / `aria-hidden`); a screen reader already hears the save.
- **Tests**: the Jest Reanimated mock (`jest/reanimated-mock.ts`) covers only `View`, `Text`, `ScrollView`, `FadeIn`/`FadeOut` and `ReduceMotion`. Add `useSharedValue`, `useAnimatedProps`, `withTiming`, `withDelay` and `useReducedMotion` stubs that return end values, then test the final frame and the reduced-motion branch.

## Rejected

- **Lottie / Rive / dotLottie**: Headspace and Duolingo's tools. Each needs authored animation files we can't make (#97's constraint).
- **Confetti libraries**: `react-native-fast-confetti` 2.0.2 lists `@shopify/react-native-skia` >=2 as a peer dependency ([npm registry](https://registry.npmjs.org/react-native-fast-confetti/latest)). Skia isn't in the app, and on web it loads CanvasKit WASM (2.9 MB, measured in `docs/research/charts.md`). Confetti also breaks "calm and quiet".
- **A growing pet or character** (Finch): illustrated, filled and gamified; the Folio rejects "the wellness stack".
- **A withering state** (Forest): any loss state adds guilt, against "no guilt and no scores".

## Next steps

- Draw the sprout paths in Storybook at 96 px in light and night, then add the timing.
- Decide in #90 whether to add `expo-haptics` with it.

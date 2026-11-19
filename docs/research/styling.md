# Styling: what shares best across Android, web and a React DOM app

Researched 2026-11-07 for [#3](https://github.com/Fullchee/journal-native/issues/3). Versions are npm `latest` on that date.

## Answer

**Use Uniwind (free, MIT) with Tailwind 4, and React Native Reusables for shadcn-style components.**

- **Tokens**: one Tailwind 4 CSS file holds the colours, radii and fonts. Expo (Uniwind) and the React DOM app (plain Tailwind 4) both read it.
- **Class names**: the same `className="bg-card text-foreground rounded-sm"` strings work on Android, Expo web and React DOM.
- **Chat**: `@assistant-ui/react-native` builds its prebuilt elements on Uniwind, with the same colour tokens as its web kit ([docs](https://www.assistant-ui.com/docs/react-native)). Its own Expo example pins Expo `~57.0.27`, RN `0.86.3`, `uniwind ^1.13.0`, `tailwindcss ^4.3.3` ([package.json](https://github.com/assistant-ui/assistant-ui/blob/main/examples/with-expo/package.json)).
- **Components**: React Native Reusables ports shadcn/ui and ships a Uniwind registry ([repo](https://github.com/founded-labs/react-native-reusables/tree/main/apps/docs/public/r/uniwind)). Its primitives use Radix on web.
- **CRA**: move the CRA app to Vite first. Then add Tailwind 4 with the shared token file. Optionally add `react-native-web` and `uniwind/vite` to reuse whole components.

**Runner-up**: react-strict-dom shares real components with React DOM without react-native-web. It is still `0.0.x` and "work in progress", so not yet.

## Comparison

| Option           | Version (2026-11-07)             | Reuses Tailwind 4 tokens                               | Plain React DOM (no RNW)                          | Expo SDK 57                | Verdict                                    |
| ---------------- | -------------------------------- | ------------------------------------------------------ | ------------------------------------------------- | -------------------------- | ------------------------------------------ |
| **Uniwind**      | 1.13.2, MIT; Pro is paid         | Yes, CSS-first `@theme`                                | Class strings and tokens yes; components need RNW | Yes (assistant-ui example) | **Pick**                                   |
| NativeWind v5    | 5.0.0-rc.1                       | Yes                                                    | Same as Uniwind                                   | Tested on 57.0.22          | Pre-release, "not intended for production" |
| NativeWind v4    | 4.2.7                            | No, Tailwind 3                                         | Same as Uniwind                                   | Yes                        | Old Tailwind                               |
| react-strict-dom | 0.0.55 (Jan 2026)                | No, StyleX `css.defineVars`                            | **Yes**, renders `react-dom`                      | "Latest Expo SDK"          | Too early                                  |
| Tamagui          | 3.2.3, MIT                       | No, own tokens; Tailwind syntax maps to Tamagui tokens | Yes, outputs DOM                                  | Yes                        | Mature, separate ecosystem                 |
| Unistyles        | 3.8.1                            | No, `StyleSheet` API                                   | No, needs RN/RNW                                  | Needs RN >= 0.85, Nitro    | Native-first                               |
| gluestack-ui     | v5 (`@gluestack-ui/core` 5.0.15) | Via NativeWind                                         | Via RNW                                           | Not stated                 | Repo quiet since 2026-09                   |

## Findings by option

### Uniwind

- **What**: Tailwind 4 bindings for React Native, from the Unistyles team; "2x faster than NativeWind", no Babel preset ([docs](https://docs.uniwind.dev/)).
- **Platforms**: Expo (Metro), bare RN and Vite with `vite-plugin-rnw` ([Vite guide](https://docs.uniwind.dev/vite.md)).
- **Theming**: `light`, `dark` and `system` themes are built in. Theme variables live in `@layer theme { :root { @variant light {…} @variant dark {…} } }` ([global CSS](https://docs.uniwind.dev/theming/global-css.md), [theming](https://docs.uniwind.dev/theming/basics.md)). `setTheme` switches at runtime; `useCSSVariable` reads a token in JS (for charts).
- **Free vs Pro**: Free is MIT and works in Expo Go. Pro (paid) adds a C++ engine, `className` Reanimated animations, `group-*` variants and theme transitions ([Pro](https://docs.uniwind.dev/pro-version.md)). Free covers the journal.
- **Maturity**: 1,747 GitHub stars, releases every 1-3 weeks; 1.13.2 on 2026-11-05. Expo's [Tailwind guide](https://docs.expo.dev/guides/tailwind/) names only NativeWind and Uniwind.
- **Caveat**: `@theme` values style utilities only. A bare `<Text>` keeps RN defaults, so wrap `Text` in a styled component.

### NativeWind

- **v5** is an RC on Tailwind 4 and `react-native-css`. Its install page warns: "not intended for production use" ([install](https://www.nativewind.dev/v5/getting-started/installation)). It was tested on Expo 57.0.22 / RN 0.86.3 / Reanimated 4.5.1, and needs an exact `lightningcss` 1.30.1 pin.
- **v4.2.7** is stable but uses Tailwind 3 (`tailwind.config.js`), so the journal tokens would need a rewrite.
- **Web**: "a small polyfill that adds `className` support to React Native Web" ([v5](https://www.nativewind.dev/v5)).
- Uniwind offers a drop-in [migration from NativeWind](https://docs.uniwind.dev/migration-from-nativewind.md), so the choice is reversible.

### react-strict-dom (RSD)

- **What**: Meta's subset of React DOM (`html.div`, `html.button`) that renders to real DOM on web and to RN on native ([intro](https://github.com/facebook/react-strict-dom/blob/main/packages/website/docs/learn/index.md)).
- **Best fit for CRA on paper**: web needs only `react` and `react-dom`, no react-native-web ([installation](https://github.com/facebook/react-strict-dom/blob/main/packages/website/docs/learn/01-installation.md)).
- **Styling**: StyleX objects (`css.create`), extracted to atomic CSS on web. Tokens come from `css.defineVars` in `*.css.js` files, with dark values under `@media (prefers-color-scheme: dark)` ([theming](https://github.com/facebook/react-strict-dom/blob/main/packages/website/docs/learn/05-theming-components.md)). No Tailwind.
- **Maturity**: docs say "Work in progress. Not all capabilities are available on native yet." npm `latest` is 0.0.55 (2026-01-09). Setup needs a Babel preset and a PostCSS plugin ([Expo setup](https://github.com/facebook/react-strict-dom/blob/main/packages/website/docs/learn/environment-setup/01-expo.md)).
- **Chat**: assistant-ui does not use it, so the chat thread would be styled a second way.

### Tamagui

- **What**: style props plus an optional compiler; web output is DOM with atomic CSS, native is `View`/`Text` ([intro](https://tamagui.dev/docs/intro/introduction)).
- **Tailwind**: `@tamagui/tailwind` accepts `className`, but classes resolve against Tamagui tokens, not a Tailwind CSS file. Last class wins, unlike Tailwind. Grid, rings and `animate-*` are web-only ([Tailwind](https://tamagui.dev/docs/core/tailwind)).
- **Fit**: mature (14.3k stars, 3.2.3 on 2026-11-05) and shares components with plain DOM. It would replace, not reuse, the journal's Tailwind tokens and the shadcn vocabulary.

### Unistyles 3

- `StyleSheet.create` superset with a C++ core; peers need RN >= 0.85, `react-native-nitro-modules` and Reanimated (npm 3.8.1).
- No Tailwind and no plain-DOM output. It now powers Uniwind Pro, so learning Uniwind covers it.

### gluestack-ui v5

- Copy-paste, shadcn-like components on Tailwind/NativeWind, with ARIA support ([docs](https://gluestack.io/ui/docs/home/overview/introduction)).
- Last push 2026-09-02; React Native Reusables covers the same ground with a Uniwind registry and closer shadcn parity.

## Tokens from `journal`

`journal/src/styles/global.css` already uses shadcn names (`--background`, `--card`, `--primary`, `--border`, `--ring`, `--radius`). The `DESIGN.md` palette maps one to one.

1. Copy the raw palette (`--bg`, `--fg`, `--accent`, `--stage-*`, `--series-*`) into one `tokens.css`.
2. Expose them through `@theme` as `--color-*` and `--radius-*`, so `bg-card` and `text-primary` exist.
3. Put night values (`night-ground`, `night-leaf`, …) under `@variant dark`.
4. Fonts: load Alegreya through `expo-font` and register one family name per weight. RN does not pick weights from a variable font the way CSS does (verify in the prototype).

The web app uses `@custom-variant dark (&:is(.dark *))`; Uniwind uses `@variant light/dark`. Expect one small adapter file per platform around a shared palette. Confirm in a prototype.

## Accessibility

- **RN core**: `role` and `aria-*` props map to DOM attributes on react-native-web.
- **React Native Reusables**: built on `@rn-primitives/*`. On web each primitive wraps Radix (`@rn-primitives/dialog` depends on `@radix-ui/react-dialog`), the same base as shadcn/ui.
- **Tamagui** and **gluestack** also claim ARIA and keyboard support. RSD uses real HTML elements on web.

## Adopting it in the old CRA app

The React team deprecated CRA on 2025-02-14 and points to Vite, Parcel, Rsbuild or a framework (Expo included) ([React blog](https://react.dev/blog/2025/02/14/sunsetting-create-react-app)). Tailwind 4 has no CRA guide; it offers the Vite plugin, CLI or PostCSS plugin ([framework guides](https://tailwindcss.com/docs/installation/framework-guides)). CRA hides its PostCSS config, so step 1 comes first.

1. **Move CRA to Vite.** This unlocks `@tailwindcss/vite` and `uniwind/vite`.
2. **Share tokens.** Import the shared `tokens.css` with Tailwind 4. Restyle DOM components with shadcn/ui and the same class strings. This step alone makes restyling easy.
3. **Share components (optional).** Add `react-native-web` and `uniwind/vite` with `vite-plugin-rnw` ([Uniwind Vite](https://docs.uniwind.dev/vite.md)). Then import the same React Native Reusables components the Expo app uses.

Note: CRA's webpack config already aliases `react-native` to `react-native-web` ([webpack.config.js](https://github.com/facebook/create-react-app/blob/main/packages/react-scripts/config/webpack.config.js)), but Tailwind 4 still needs the Vite move.

## Versions checked (npm, 2026-11-07)

- `expo` 57.0.32 (`sdk-57`); `latest` is already 58.0.23. Uniwind Pro already lists Expo 55-58.
- `react-native-web` 0.21.4, `tailwindcss` 4.3.5, `uniwind` 1.13.2.
- `nativewind` 4.2.7 (`rc` 5.0.0-rc.1), `react-native-css` 3.0.7 (`rc` 3.1.0-rc.1).
- `tamagui` 3.2.3, `react-native-unistyles` 3.8.1, `react-strict-dom` 0.0.55, `@gluestack-ui/core` 5.0.15.
- `@assistant-ui/react-native` 0.1.51, `@rn-primitives/*` 1.5.2.

# Charts and Markdown on Expo Android + web

Ticket: [#6](https://github.com/Fullchee/journal-native/issues/6). Researched 2026-11-07 against Expo SDK 57 (React Native 0.86.3, React 19.2.3, react-native-web ~0.21).

## Answer

- **Chart**: keep Chart.js, inside an Expo DOM component (`'use dom'`). The `journal` chart config moves over nearly verbatim. The same file runs on Expo web with no iframe, and in a plain React DOM app.
- **Chart fallback**: Victory Native XL, if the WebView is too slow on the home screen. It covers every feature but adds Skia (2.9 MB gzipped WASM on web) and shares no code with React DOM.
- **Render Markdown**: `react-native-enriched-markdown` 1.1.x. Native text on Android, semantic HTML on web, GFM tables and images, RN 0.86 supported.
- **Edit Markdown**: a plain multiline `TextInput`, like `journal`'s plain `<textarea>`. No WYSIWYG editor fits: each one stores HTML or lacks web support.
- **Skip**: react-native-gifted-charts (one secondary y-axis, web not its target) and the original `react-native-markdown-display` (last release 2023-12).

## What `journal` needs

From `journal/src/components/CheckInChart.svelte` and `src/lib/markdown.ts`:

| Feature              | Detail                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Line chart, linear x | Days as numbers, custom tick values and labels                                                                                                            |
| Four y scales        | Mood 1-8 (icon labels), rating 0-5, sleep 0-10, each shown only when a series uses it                                                                     |
| Line styles          | Dashes per series, straight Mood line, curved others (tension 0.3)                                                                                        |
| Weekend bands        | Shaded rectangles drawn behind the lines (custom plugin)                                                                                                  |
| Series toggles       | Buttons outside the chart; legend clicks off; no tooltip; no animation                                                                                    |
| Theme                | Colours from CSS tokens; redraw on dark mode change                                                                                                       |
| Markdown render      | Headings shifted down one level, lists (nested), tables, blockquote, code, links, images, `[[wikilinks]]` shown as plain labels, unsafe URLs left as text |
| Markdown edit        | Plain textarea; on web, paste or drop an image to upload it and insert `![name](url)`                                                                     |

Markdown is shown in lists (`routes/habits/+page.svelte` renders one body per Habit), so the renderer must be cheap per item.

## Charts

### Comparison

| Option                         | Android      | Expo web                | Plain React DOM                     | Fits `journal` chart        |
| ------------------------------ | ------------ | ----------------------- | ----------------------------------- | --------------------------- |
| **Chart.js in `'use dom'`**    | WebView      | Direct DOM, no iframe   | Yes, same component                 | Yes, current config         |
| **Victory Native XL**          | Skia, native | Skia via CanvasKit WASM | No                                  | Yes                         |
| **react-native-gifted-charts** | SVG          | Not documented          | No (separate `react-gifted-charts`) | No: one secondary axis only |

### Chart.js in an Expo DOM component

- **How**: a file with `'use dom'` renders React DOM; on native it runs in a WebView, on web "content passes through directly without an iframe" ([Expo DOM components](https://docs.expo.dev/guides/dom-components/)).
- **Setup**: SDK 56+ uses `@expo/dom-webview` by default; nothing to install ([same page](https://docs.expo.dev/guides/dom-components/)). SDK 57 bundles `@expo/dom-webview ~57.0.1` (`expo@57.0.32` `package.json`).
- **Props**: must be serializable JSON and cross an async bridge. `journal`'s `ChartData` (numbers, labels, ranges) already is. Function props must be async.
- **Costs**: DOM code "parses and starts more slowly than Hermes bytecode"; low-power mode throttles web frame rates ([same page](https://docs.expo.dev/guides/dom-components/)). The chart has no animation or tooltip, so frame rate does not matter; startup does.
- **Versions**: `chart.js` 4.6.1 (2026-10-22), `react-chartjs-2` 5.3.1 supports React 19 ([npm](https://www.npmjs.com/package/react-chartjs-2)).
- **Toggles**: keep the series buttons as native `Pressable`s outside the DOM component and pass `shown` as a prop.
- **Theme**: pass the resolved colours as props; the DOM side cannot read the app's theme.

### Victory Native XL (fallback)

- **Features**: `yAxis` is an array ("pass in multiple Y axis objects"), each with `yKeys`, `axisSide` and `domain`; `xAxis.tickValues` and `formatXLabel`; children receive `chartBounds` and a d3 `xScale` for custom shapes such as weekend bands ([CartesianChart docs](https://nearform.com/open-source/victory-native/docs/cartesian/cartesian-chart)).
- **Web**: through Skia's CanvasKit; "The CanvasKit WASM file, which is 2.9MB when gzipped, is loaded asynchronously" ([Skia web docs](https://wcandillon.github.io/react-native-skia/v2/docs/getting-started/web)). Expo Router needs `LoadSkiaWeb()` in `index.web.tsx`, or `<WithSkiaWeb />` with the component outside `app/`.
- **Version trap**: `victory-native` 43.x moved to the unscoped `react-native-skia@^2.15.1` and drops `@shopify/react-native-skia` ([migration guide](https://nearform.com/open-source/victory-native/docs/skia-package-migration)). SDK 57's `bundledNativeModules.json` pins `@shopify/react-native-skia` 2.6.2. Either use `victory-native@42` (peer `@shopify/react-native-skia >=2.6.0 <3`) with Expo's pin, or 43 with `react-native-skia@2` and lose `expo install` version checks. Never install both Skia packages.
- **Peers (43.0.1)**: React 19, RN ≥0.79, Reanimated ≥4.1.7 <5, Worklets ≥0.7, Gesture Handler 2-3, New Architecture ([npm](https://www.npmjs.com/package/victory-native)).

### react-native-gifted-charts (rejected)

- **Axes**: one `secondaryYAxis` on the right ([LineChart props](https://github.com/Abhinandan-Kushwaha/react-native-gifted-charts/blob/master/docs/LineChart/LineChartProps.md)). `journal` needs three y scales.
- **Web**: the README points web users to a separate `react-gifted-charts` package ([README](https://github.com/Abhinandan-Kushwaha/react-native-gifted-charts)), last published 2025-02.
- **Has**: `dataSet` with per-line `strokeDashArray` and `curved`, real x values via `xOffset`/`xScale`. Not enough to outweigh the axis limit.

## Markdown

### Render: react-native-enriched-markdown

- **What**: "renders Markdown content as native text and provides a rich text input with Markdown output" ([README](https://github.com/software-mansion-labs/react-native-enriched-markdown)). By Software Mansion.
- **Android**: native text, no WebView; needs the New Architecture and a dev build ("won't work in Expo Go"). 1.1.x supports RN 0.83-0.87 (README compatibility table).
- **Web**: via react-native-web plus md4c compiled to WASM and inlined as base64, so there is no file to serve. Renders semantic HTML: headings, blockquote, lists, tables, images, code (`docs/WEB.md` in the package).
- **GFM**: tables, task lists, strikethrough; `onLinkPress`, `onImagePress` callbacks.
- **Plain React DOM**: works only where `react-native-web` is aliased; not native React DOM.
- **`journal` gaps**: `[[wikilinks]]` are not GFM. Copy a pure `stripWikilinks(source)` from `markdown.ts` and run it first. Shift headings with heading styles, not by rewriting levels.
- **Version**: 1.1.1, 2026-10-06 ([npm](https://www.npmjs.com/package/react-native-enriched-markdown)).

### Render alternatives

| Option                                           | Status                   | Note                                                                                            |
| ------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------- |
| `@ronradtke/react-native-markdown-display` 9.0.3 | Maintained fork, 2026-06 | Pure JS RN views, tables and images; no native build. Fallback if enriched-markdown misbehaves. |
| `react-native-marked` 8.3.4                      | 2026-11                  | Pure JS; tables and images; needs `react-native-svg`.                                           |
| `react-native-markdown-display` 7.0.2            | Last release 2023-12     | Unmaintained; skip.                                                                             |
| Copied `renderMarkdown` + `'use dom'`            | Works                    | Reuses `journal` code and runs in React DOM, but one WebView per Habit in a list is too heavy.  |

### Edit

`journal` edits Markdown as raw text. Keep that: a multiline `TextInput` on both platforms.

| Option                                  | Android | Web                | Output                        | Verdict                                                                                                                     |
| --------------------------------------- | ------- | ------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **`TextInput multiline`**               | Yes     | Yes (`<textarea>`) | Markdown                      | Use it                                                                                                                      |
| `@expensify/react-native-live-markdown` | Yes     | Yes                | Markdown, live syntax styling | Optional upgrade; needs Worklets and `expensify-common` ([README](https://github.com/Expensify/react-native-live-markdown)) |
| `EnrichedMarkdownTextInput`             | Yes     | No ("native-only") | Markdown                      | Headings, lists, blockquotes, code blocks still on the roadmap                                                              |
| `react-native-enriched` 0.8.1           | Yes     | Yes                | HTML                          | Wrong format                                                                                                                |
| `@10play/tentap-editor` 1.1.0           | WebView | Yes                | HTML (Tiptap/ProseMirror)     | Wrong format; WYSIWYG                                                                                                       |

- **Image paste/drop**: browser-only events. Keep them in a `.web.tsx` variant. Android needs a picker button instead (for example `expo-image-picker`); that is a screen-spec decision.

## Plain React DOM reuse

- **Chart**: full reuse. The DOM component is ordinary React DOM code.
- **Markdown render**: reuse needs `react-native-web` in the DOM app. Otherwise copy the pure `renderMarkdown` there.
- **Pure logic** (`stripWikilinks`, chart data shaping, image insert helpers): plain TS, shared everywhere.

## Open questions for later tickets

- Measure DOM-component start time on the home Check-in screen on a real Android device. If it is noticeable, switch to Victory Native XL.
- Decide the Android image-attach flow for Habit descriptions.

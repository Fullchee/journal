# Charts: one Check-in chart for Android, web and a React DOM app

Researched 2026-11-07 for [#18](https://github.com/Fullchee/journal-native/issues/18). Versions are npm `latest` on that date. Bundle sizes are measured: esbuild minify, then `gzip -9`, importing only what the chart needs.

## Answer

**Draw the chart by hand with `react-native-svg` + `d3-scale` + `d3-shape`.**

- **One component everywhere**: `react-native-svg` renders native SVG on Android and DOM `<svg>` through react-native-web. The React DOM app also runs react-native-web, so it imports the same file.
- **Covers every feature**: three y-axes are three `scaleLinear()`s, weekend bands are `<Rect>`s, dashes are `strokeDasharray`, tension is a d3 curve. The legend is already RNR `Button`s outside the canvas.
- **Cheapest on web**: d3 adds about 15 KB gzipped. `react-native-svg` ships with Expo SDK 58 and RNR's icons need it anyway.
- **Storybook**: plain RN components, so both Storybooks render it with no setup.
- **Dark mode**: read tokens with Uniwind's `useCSSVariable`; it re-renders on theme change.
- **Cost**: about 150–250 lines of drawing code we own: axes, ticks, labels, bands, lines.

**Runner-up: Apache ECharts through `@wuba/react-native-echarts`.** One `option` object describes the whole chart on all three targets, with built-in multi-axis, `markArea` bands and legend toggling. It loses on web weight (about 180 KB gzipped) and a thin maintainer pulse.

## The chart to draw

From [`CheckInChart.svelte`](https://github.com/Fullchee/journal/blob/main/src/components/CheckInChart.svelte) and `chartData()` in `journal`'s `src/lib/check-in-view.ts`:

| Need    | Detail                                                                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| X axis  | Linear time (ms). `min`/`max` and tick values come precomputed from `chartData()`, with labels.                                         |
| Y axes  | `y` mood 1–8, ticks are emoji icons; `rating` 0–5 on the right; `y2` sleep 0–10 on the right. An axis shows only when a series uses it. |
| Series  | Mood (straight), Tense and Low (dash `[4,3]`, tension 0.3), Sleep (dash `[2,3]`, tension 0.3). Each series has its own x values.        |
| Bands   | Weekend `{from, to}` ranges, filled with `--muted` at 14% opacity, behind the lines.                                                    |
| Legend  | Already outside the chart: RNR-style toggle `Button`s. The chart's own legend click does nothing.                                       |
| Colours | `--series-<id>`, `--line`, `--muted` tokens, light and dark.                                                                            |
| Off     | Tooltip, animation.                                                                                                                     |

The chart needs no gestures, no tooltip and no animation. That removes the main reason to pick a heavy native chart library.

## Comparison

| Option                                 | Version (date)                                                        | 3 y-axes                     | Linear time x, own x per series        | Weekend bands                   | Web cost (gzip)               | React DOM app                                       | Verdict                          |
| -------------------------------------- | --------------------------------------------------------------------- | ---------------------------- | -------------------------------------- | ------------------------------- | ----------------------------- | --------------------------------------------------- | -------------------------------- |
| **react-native-svg + d3**              | svg 15.16.1 (2026-11-05), d3-scale 4.0.3, d3-shape 3.2.1 (2026-11-03) | Yes, one scale each          | Yes                                    | Yes, `<Rect>`                   | ~15 KB d3; svg already in app | Same file via RNW                                   | **Pick**                         |
| ECharts + `@wuba/react-native-echarts` | echarts 6.1.0 (2026-05-19), wrapper 3.1.1 (2026-07-06)                | Yes, `yAxis[]`               | Yes, `type: 'value'` or `'time'`       | Yes, `markArea`                 | ~180 KB                       | Same `option`, plain `echarts`                      | Runner-up                        |
| Chart.js in Expo DOM component         | chart.js 4.6.1 (2026-10-22)                                           | Yes                          | Yes                                    | Yes (current plugin)            | ~52 KB                        | Same file, plain DOM                                | Baseline; WebView on Android     |
| Victory Native XL (`victory-native`)   | 43.0.1 (2026-10-20)                                                   | Yes, `yAxis[]`               | One shared `data` array, x keyed       | Via `renderOutside`/Skia `Rect` | 2.9 MB CanvasKit WASM         | Needs CanvasKit too                                 | No                               |
| react-native-gifted-charts             | 1.4.81 (2026-10-05)                                                   | Primary + one secondary only | No: points spaced by index (`spacing`) | No time bands                   | small                         | Separate lib `react-gifted-charts` 0.0.12 (2025-02) | No                               |
| victory (SVG)                          | 38.0.0 (2026-11-03)                                                   | Yes, by normalising data     | Yes                                    | Yes                             | n/a                           | Yes                                                 | No: web only, native port frozen |
| react-native-wagmi-charts              | 3.0.1 (2026-09-04)                                                    | No, one `yRange`             | Price-chart model                      | No                              | small                         | No                                                  | No                               |

## Findings

### react-native-svg + d3 (recommended)

- **Platforms**: "provides SVG support to React Native on iOS, Android, macOS, Windows, and a compatibility layer for the web" ([README](https://github.com/software-mansion/react-native-svg)). v15.16.1 released 2026-11-05.
- **Expo**: SDK 58's `bundledNativeModules.json` pins `react-native-svg` 15.16.1 ([expo/expo](https://github.com/expo/expo/blob/main/packages/expo/bundledNativeModules.json)). No extra native module.
- **d3**: `d3-scale` and `d3-shape` are pure JS with no React or DOM dependency. Both published 2026-11-03. `scaleLinear` + `line` + `curveLinear`/`curveMonotoneX`/`curveCardinal` bundle to 45.9 KB min, 14.5 KB gzip.
- **Tension**: Chart.js `tension: 0.3` is its own spline. `curveMonotoneX` or `curveCardinal.tension(…)` look close but not identical; tune by eye in Storybook.
- **Gaps**: `line().defined(d => d.y != null)` breaks a line where data is missing, as Chart.js does.
- **Mood axis labels**: emoji ticks are SVG `<Text>`; check emoji rendering on Android in the spike.
- **Theme**: `useCSSVariable('--series-mood')` etc. returns current values and "automatic theme updates" ([Uniwind useCSSVariable](https://docs.uniwind.dev/api/use-css-variable.md), 1.0.5+). Uniwind's docs name chart libraries as the use case. `withUniwind` can also map `stroke`/`fill` to class names with a custom mapping ([withUniwind](https://docs.uniwind.dev/api/with-uniwind.md)).
- **Shape of the code**: one pure `layout(data, size)` function (scales, paths, tick positions) plus a thin `<Svg>` renderer. The pure part is unit-testable without rendering.

### ECharts via `@wuba/react-native-echarts` (runner-up)

- **How it works**: on native, ECharts draws through a custom zrender painter onto `react-native-svg` or Skia. On web the package's `.web.tsx` files render a plain `<div>` and register zrender's own SVG painter ([src/svg/svgChart.web.tsx](https://github.com/wuba/react-native-echarts/blob/main/src/svg/svgChart.web.tsx)). So web is real ECharts in the DOM, same as a React DOM app.
- **Features**: everything the chart needs is built in: `yAxis` array with `position`/`offset`, `markArea` for bands, `lineStyle.type` dashes, `smooth`, `legend.selected` ([option reference](https://echarts.apache.org/en/option.html)).
- **Web cost**: `echarts/core` + `LineChart` + `Grid`/`Legend`/`MarkArea` + `SVGRenderer` measured 525 KB min, 180 KB gzip. Android also parses this JS.
- **Maintenance**: wrapper last released 3.1.1 on 2026-07-06; 68 open issues; 975 stars. Open [#311](https://github.com/wuba/react-native-echarts/issues/311) (2026-08): blank Expo 57 web app fails with `tslib.default is undefined`; workaround is a `tslib` override plus a Metro config tweak.
- **Pick it instead if**: the chart grows (zoom, tooltips, more chart types) and writing those by hand costs more than 180 KB.

### Chart.js in an Expo DOM component (baseline)

- **Most reuse of today's code**: the Svelte config ports almost verbatim to a `'use dom'` React component.
- **On web**: DOM components "behave as regular components", not in an iframe ([Expo DOM components](https://docs.expo.dev/guides/dom-components/)). Same in the React DOM app.
- **On Android**: a WebView (`@expo/dom-webview` by default from SDK 56). Expo: DOM components are "slower to parse and start up than optimized Hermes bytecode" and it recommends "truly native views whenever possible".
- **Limits**: props must be serialisable; function props must be async; no `children`; tokens must be passed in as props because the WebView has its own CSS.
- **Web cost**: Chart.js with the five registered parts measured 147 KB min, 52 KB gzip.
- **Storybook**: untested on-device (see [storybook.md](https://github.com/Fullchee/journal-native/blob/research/storybook/docs/research/storybook.md#charts-expo-dom-and-markdown-in-stories)).

### Victory Native XL

- **Multi-axis**: supported: "To render multiple Y axes, pass in multiple Y axis objects to the array" ([CartesianChart docs](https://github.com/FormidableLabs/victory-native-xl/blob/main/website/docs/cartesian/cartesian-chart.md)).
- **Data model**: one `data` array with `xKey` and all `yKeys` on each row. Our series have their own timestamps, so rows must be merged with gaps.
- **Web**: Skia on web is CanvasKit, "2.9MB when gzipped, is loaded asynchronously", and the app must wait with `LoadSkiaWeb()` or `<WithSkiaWeb>` ([Skia web docs](https://github.com/wcandillon/react-native-skia/blob/main/apps/docs/docs/getting-started/web.mdx)). The React DOM app would carry the same WASM.
- **Version clash**: `victory-native` 43 peers on the renamed `react-native-skia` `>=2.15.1 <3`; 42.x peered on `@shopify/react-native-skia`. Expo SDK 58 bundles `@shopify/react-native-skia` 2.14.0. Skia itself is now `react-native-skia` 3.9.1 (2026-11-03).
- **Peers**: also needs Reanimated 4, Worklets and Gesture Handler for a chart with no animation or gestures.

### react-native-gifted-charts

- **X axis**: points sit `spacing` pixels apart by index ([LineChart props](https://github.com/Abhinandan-Kushwaha/react-native-gifted-charts/blob/master/docs/LineChart/LineChartProps.md)). No linear time scale, so uneven check-in times and weekend bands don't fit.
- **Y axes**: one primary plus one `secondaryYAxis`. Three axes don't fit.
- **Web**: the React DOM twin `react-gifted-charts` is a separate package, last released 0.0.12 on 2025-02-16.

### victory (SVG)

- **Web only**: Victory's docs say the legacy `victory-native` that "shared its code and API with `victory`, is no longer developed"; last release 37.3.6 under the `legacy` tag ([native.mdx](https://github.com/FormidableLabs/victory/blob/main/website/docs/introduction/native.mdx)). v38.0.0 (2026-11-03) is a tooling uplift.

### react-native-wagmi-charts

- **Scope**: "Line charts & candlestick charts" for price data with cursors; one `yRange` per chart; "Web support is currently experimental" ([README](https://github.com/coinjar/react-native-wagmi-charts)). Not a multi-axis tool.

## Measured web bundle cost

| Import set                                                                                           | Min      | Gzip     |
| ---------------------------------------------------------------------------------------------------- | -------- | -------- |
| `d3-scale` `scaleLinear` + `d3-shape` `line` and three curves                                        | 45.9 KB  | 14.5 KB  |
| `chart.js` `Chart`, `Legend`, `LineController`, `LineElement`, `PointElement`, `LinearScale`         | 146.6 KB | 51.9 KB  |
| `echarts/core` + `LineChart`, `GridComponent`, `LegendComponent`, `MarkAreaComponent`, `SVGRenderer` | 525.3 KB | 179.9 KB |
| CanvasKit WASM (Skia docs figure)                                                                    | —        | 2.9 MB   |

`react-native-svg` is not counted: Expo and RNR icons already include it.

## Open questions for the spike

- **Emoji ticks**: do emoji render in `react-native-svg` `<Text>` on Android with the right size?
- **Curve match**: which d3 curve best matches Chart.js `tension: 0.3`?
- **Web SVG under Uniwind**: confirm `useCSSVariable` returns resolved colours on web, not `var(...)` strings.

import {
  ZONE_BANDS,
  layoutStrips,
  nearestPoint,
  sleepAxisLabels,
  stripDomain,
  stripsWithData,
  zoneOf,
  STRIPS,
  TIME_ZONE,
  type ChartData,
  type CheckIn,
  type Strip,
  type StripBox,
} from "@/core";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import * as React from "react";
import {
  Platform,
  Pressable,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type PointerEvent,
} from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Button } from "./button";
import { Text } from "./text";

const RIGHT = 8;
const TOOLTIP_WIDTH = 176;

// A tap this many pixels from a point still picks it: about a fingertip.
const REACH_PX = 18;

// SVG text ignores the system font size, so labels scale by hand; past 150% they would crowd the 33px zone bands.
const LABEL_SIZE = 12;
const MAX_LABEL_SCALE = 1.5;

// The left gutter holds the zone names, about four label-heights wide; the bottom holds the time axis.
const labelLayout = (fontScale: number) => {
  const size = Math.round(LABEL_SIZE * Math.min(fontScale, MAX_LABEL_SCALE));

  return { size, left: size * 4, axis: size + 12 };
};

type LabelLayout = ReturnType<typeof labelLayout>;

const TOKENS = [
  "--color-series-mood",
  "--color-series-tense",
  "--color-series-low",
  "--color-series-tired",
  "--color-series-sleep",
  "--color-muted",
  "--color-muted-foreground",
  "--color-border",
] as const;

type Colors = Record<
  "mood" | "tense" | "low" | "tired" | "sleep" | "band" | "label" | "rule",
  string
>;

// react-native-svg needs real colour strings, not `var(...)`, so tokens are read in JS.
function useChartColors(): Colors {
  const [mood, tense, low, tired, sleep, band, label, rule] = useCSSVariable([...TOKENS]);

  return {
    mood: String(mood),
    tense: String(tense),
    low: String(low),
    tired: String(tired),
    sleep: String(sleep),
    band: String(band),
    label: String(label),
    rule: String(rule),
  };
}

interface Point {
  x: number;
  y: number;
}

type X = ScaleLinear<number, number>;

// `right` is the x of the plot's right edge, the end of the x range.
interface StripProps {
  box: StripBox;
  x: X;
  y: X;
  right: number;
  colors: Colors;
  labels: LabelLayout;
}

const linePath = (points: Point[], x: X, y: X, curved = false) => {
  const draw = line<Point>()
    .x((p) => x(p.x))
    .y((p) => y(p.y));

  return (curved ? draw.curve(curveMonotoneX) : draw)(points) ?? "";
};

function GutterLabel({
  y,
  fill,
  size,
  children,
}: {
  y: number;
  fill: string;
  size: number;
  children: string;
}) {
  return (
    <SvgText x={4} y={y} fill={fill} fontSize={size} alignmentBaseline="middle">
      {children}
    </SvgText>
  );
}

function MoodStrip<C extends CheckIn>({
  box,
  x,
  y,
  right,
  colors,
  labels,
  points,
  selected,
}: StripProps & { points: ChartData<C>["points"]; selected: C | undefined }) {
  return (
    <G>
      {ZONE_BANDS.map((band, i) => (
        <G key={band.zone}>
          <Rect
            x={labels.left}
            y={y(band.to)}
            width={Math.max(0, right - labels.left)}
            height={y(band.from) - y(band.to)}
            fill={colors.band}
            opacity={i % 2 === 1 ? 0.55 : 0.2}
          />
          <GutterLabel y={y((band.from + band.to) / 2)} fill={colors.label} size={labels.size}>
            {band.zone}
          </GutterLabel>
        </G>
      ))}
      <Path d={linePath(points, x, y)} stroke={colors.mood} strokeWidth={2} fill="none" />
      {points.map((p) => (
        <Circle
          key={p.checkIn.id}
          cx={x(p.x)}
          cy={y(p.y)}
          r={p.checkIn === selected ? 6 : 3.5}
          fill={colors.mood}
        />
      ))}
      <Line
        x1={labels.left}
        x2={right}
        y1={box.top + box.height}
        y2={box.top + box.height}
        stroke={colors.rule}
      />
    </G>
  );
}

function RatingsStrip({
  box,
  x,
  y,
  right,
  colors,
  labels,
  tense,
  low,
  tired,
}: StripProps & { tense: Point[]; low: Point[]; tired: Point[] }) {
  return (
    <G>
      <GutterLabel y={y(2)} fill={colors.label} size={labels.size}>
        A lot
      </GutterLabel>
      <GutterLabel y={y(0) - labels.size / 2} fill={colors.label} size={labels.size}>
        None
      </GutterLabel>
      {/* Tense is dashed and Tired dotted, so the three lines differ by more than colour. */}
      <Path
        d={linePath(tense, x, y, true)}
        stroke={colors.tense}
        strokeWidth={2}
        strokeDasharray="5 3"
        fill="none"
      />
      <Path d={linePath(low, x, y, true)} stroke={colors.low} strokeWidth={2} fill="none" />
      <Path
        d={linePath(tired, x, y, true)}
        stroke={colors.tired}
        strokeWidth={2}
        strokeDasharray="1 3"
        strokeLinecap="round"
        fill="none"
      />
      <Line
        x1={labels.left}
        x2={right}
        y1={box.top + box.height}
        y2={box.top + box.height}
        stroke={colors.rule}
      />
    </G>
  );
}

// Evening sits on top, so each bar hangs from bedtime down to wake.
function SleepStrip({
  box,
  x,
  y,
  right,
  colors,
  labels,
  nights,
  domain,
}: StripProps & { nights: ChartData["sleep"]; domain: [number, number] }) {
  return (
    <G>
      {sleepAxisLabels(domain).map((t, i) => (
        <GutterLabel
          key={t.value}
          y={y(t.value) + (i === 0 ? 1 : -1) * (labels.size / 2)}
          fill={colors.label}
          size={labels.size}
        >
          {t.label}
        </GutterLabel>
      ))}
      {nights.map((n) => (
        <Rect
          key={n.x}
          testID="sleep-bar"
          x={x(n.x) - 2}
          y={y(n.from)}
          width={4}
          height={y(n.to) - y(n.from)}
          rx={2}
          fill={colors.sleep}
        />
      ))}
      <Line
        x1={labels.left}
        x2={right}
        y1={box.top + box.height}
        y2={box.top + box.height}
        stroke={colors.rule}
      />
    </G>
  );
}

const SWATCHES: Record<Strip, (keyof Colors)[]> = {
  mood: ["mood"],
  ratings: ["tense", "low", "tired"],
  sleep: ["sleep"],
};

function Legend({
  strips,
  hidden,
  colors,
  onToggle,
}: {
  strips: Strip[];
  hidden: ReadonlySet<Strip>;
  colors: Colors;
  onToggle: (strip: Strip) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {STRIPS.filter((s) => strips.includes(s.id)).map((s) => (
        <Button
          key={s.id}
          size="sm"
          className="min-h-12"
          variant={hidden.has(s.id) ? "outline" : "secondary"}
          aria-pressed={!hidden.has(s.id)}
          onPress={() => onToggle(s.id)}
        >
          {SWATCHES[s.id].map((swatch) => (
            <View
              key={swatch}
              className="size-2.5 rounded-full"
              style={{ backgroundColor: colors[swatch] }}
            />
          ))}
          <Text>{s.label}</Text>
        </Button>
      ))}
    </View>
  );
}

const whenOf = (checkedInAt: string) =>
  new Date(checkedInAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });

const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// TalkBack can't see the lines, so the chart speaks what they show; each Check-in is also in the list below.
function chartSummary<C extends CheckIn>(data: ChartData<C>) {
  const scores = data.points.map((p) => p.checkIn.score);
  const latest = data.points.at(-1)?.checkIn;
  const parts: string[] = [];

  if (latest) {
    parts.push(
      `${counted(scores.length, "Check-in")}, lowest ${zoneOf(Math.min(...scores))}, highest ${zoneOf(Math.max(...scores))}, latest ${zoneOf(latest.score)} on ${whenOf(latest.checkedInAt)}`,
    );
  }

  if (data.sleep.length > 0) parts.push(`${counted(data.sleep.length, "night")} of sleep`);

  return `Check-in chart: ${parts.join(". ")}.`;
}

function Tooltip({ checkIn, left, top }: { checkIn: CheckIn; left: number; top: number }) {
  return (
    <View
      testID="check-in-chart-tooltip"
      pointerEvents="none"
      className="bg-popover border-border absolute gap-0.5 rounded-md border p-2"
      style={{ left, top, width: TOOLTIP_WIDTH }}
    >
      <Text variant="label">{whenOf(checkIn.checkedInAt)}</Text>
      <Text className="text-sm">
        {zoneOf(checkIn.score)} ({checkIn.score}/8)
      </Text>
      {checkIn.note === "" ? null : (
        <Text variant="muted" numberOfLines={3}>
          {checkIn.note}
        </Text>
      )}
    </View>
  );
}

interface CheckInChartProps<C extends CheckIn> {
  data: ChartData<C>;
  /** Shown instead of the chart when the range has nothing to draw: the reason and one next step. */
  empty: React.ReactNode;
  /** A tap on a mood point; the list scrolls to that Check-in. */
  onSelect?: (checkIn: C) => void;
}

// Three strips share one time axis: mood over the zone bands, Tense, Low and Tired, and sleep.
function CheckInChart<C extends CheckIn>({ data, empty, onSelect }: CheckInChartProps<C>) {
  const colors = useChartColors();
  const labels = labelLayout(useWindowDimensions().fontScale);
  const { left, axis } = labels;
  const [width, setWidth] = React.useState(0);
  const [hidden, setHidden] = React.useState<ReadonlySet<Strip>>(() => new Set());
  const [selected, setSelected] = React.useState<C>();

  const strips = stripsWithData(data);

  if (strips.length === 0) return empty;

  const { boxes, height } = layoutStrips(strips.filter((s) => !hidden.has(s)));
  const right = Math.max(left, width - RIGHT);
  const x = scaleLinear().domain([data.min, data.max]).range([left, right]);

  const yOf = (box: StripBox) =>
    scaleLinear()
      .domain(stripDomain(box.id, data))
      .range([box.top + box.height, box.top]);

  const moodBox = boxes.find((b) => b.id === "mood");

  const toggle = (strip: Strip) =>
    setHidden((was) => {
      const next = new Set(was);

      if (!next.delete(strip)) next.add(strip);

      return next;
    });

  // Picks the mood point under a tap or the pointer, or none when the touch misses every point.
  const pointAt = (px: number) =>
    moodBox
      ? nearestPoint(data.points, x.invert(px), x.invert(left + REACH_PX) - x.invert(left))
      : undefined;

  const select = (event: GestureResponderEvent) => {
    const point = pointAt(event.nativeEvent.locationX);

    setSelected(point?.checkIn);

    if (point) onSelect?.(point.checkIn);
  };

  const hover = (event: PointerEvent) => setSelected(pointAt(event.nativeEvent.offsetX)?.checkIn);

  const shownPoint = moodBox && data.points.find((p) => p.checkIn === selected);
  const pointX = shownPoint ? x(shownPoint.x) : 0;

  return (
    <View className="gap-3">
      <Legend strips={strips} hidden={hidden} colors={colors} onToggle={toggle} />
      <View
        testID="check-in-chart"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height: height + axis }}
      >
        {width > 0 && (
          <Svg width={width} height={height + axis}>
            {data.weekends.map((w) => (
              <Rect
                key={w.from}
                x={x(w.from)}
                y={0}
                width={x(w.to) - x(w.from)}
                height={height}
                fill={colors.band}
                opacity={0.5}
              />
            ))}
            {boxes.map((box) => {
              const props = { box, x, y: yOf(box), right, colors, labels };

              if (box.id === "mood") {
                return (
                  <MoodStrip key={box.id} {...props} points={data.points} selected={selected} />
                );
              }

              if (box.id === "ratings") {
                return (
                  <RatingsStrip
                    key={box.id}
                    {...props}
                    tense={data.tense}
                    low={data.low}
                    tired={data.tired}
                  />
                );
              }

              return (
                <SleepStrip
                  key={box.id}
                  {...props}
                  nights={data.sleep}
                  domain={stripDomain(box.id, data)}
                />
              );
            })}
            {data.ticks.map((t) => (
              <SvgText
                key={t.value}
                x={x(t.value)}
                y={height + axis - 6}
                fill={colors.label}
                fontSize={labels.size}
              >
                {t.label}
              </SvgText>
            ))}
          </Svg>
        )}
        <Pressable
          testID="check-in-chart-touch"
          role="img"
          aria-label={chartSummary(data)}
          className="absolute inset-0"
          onPress={select}
          onPointerMove={Platform.OS === "web" ? hover : undefined}
        />
        {selected && shownPoint && (
          <Tooltip
            checkIn={selected}
            left={Math.min(
              Math.max(0, pointX - TOOLTIP_WIDTH / 2),
              Math.max(0, width - TOOLTIP_WIDTH),
            )}
            top={yOf(moodBox)(shownPoint.y) + 10}
          />
        )}
      </View>
    </View>
  );
}

export { CheckInChart };

export type { CheckInChartProps };

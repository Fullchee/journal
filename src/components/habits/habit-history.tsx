import {
  HISTORY_MARK_LABELS,
  historyStrip,
  historyTotalsLabel,
  loggedLabel,
  strengthLabel,
  type HabitHistory,
  type HistoryMark,
} from "@/core";
import { Text } from "@/ui";
import { View } from "react-native";

// Each mark has its own shape, so none relies on colour; a miss is neutral tint, never red.
const BAR_CLASS: Record<HistoryMark, string> = {
  hit: "h-8 bg-primary",
  missed: "h-8 border border-border bg-muted",
  open: "h-1 bg-border",
  rest: "h-1 bg-border",
  skipped: "h-1 bg-border",
  "off-season": "h-1 bg-border",
};

const BAR_HEIGHT = 32;

interface Bar {
  start: string;
  label: string;
  className: string;
  height?: number;
}

// A bad Habit's bar grows with its count, in ink: a logged weed day is never graded.
function barsOf(history: HabitHistory): Bar[] {
  if (history.kind === "good")
    return historyStrip(history.periods).map(({ start, label, mark }) => ({
      start,
      label: `${label}: ${HISTORY_MARK_LABELS[mark]}`,
      className: BAR_CLASS[mark],
    }));

  const periods = historyStrip(history.periods);
  const most = Math.max(1, ...periods.map(({ logged }) => logged));

  return periods.map(({ start, label, logged }) => ({
    start,
    label: `${label}: ${loggedLabel(logged)}`,
    className: logged === 0 ? "h-1 bg-border" : "bg-foreground",
    ...(logged > 0 && { height: Math.max(4, (BAR_HEIGHT * logged) / most) }),
  }));
}

/** The last 7 periods as bars, newest on the right. */
function HistoryStrip({ history }: { history: HabitHistory }) {
  return (
    <View
      role="group"
      aria-label={`Last 7 ${history.unit}s`}
      className="h-8 flex-row items-end gap-1 self-start"
    >
      {barsOf(history).map(({ start, label, className, height }) => (
        <View
          key={start}
          aria-label={label}
          className={`w-6 rounded-sm ${className}`}
          {...(height !== undefined && { style: { height } })}
        />
      ))}
    </View>
  );
}

/** Totals since the start date and the Strength, when any period counts, over the 7-period strip. */
export function HistorySummary({
  history,
  strength = null,
}: {
  history: HabitHistory;
  /** Left out where the summary only links to History. */
  strength?: number | null;
}) {
  return (
    <View className="gap-2">
      <Text>{historyTotalsLabel(history)}</Text>
      {strength !== null && <Text>{strengthLabel(strength)}</Text>}
      <HistoryStrip history={history} />
    </View>
  );
}

const periodLines = (history: HabitHistory) =>
  history.kind === "bad"
    ? history.periods.map(({ start, label, logged }) => ({
        start,
        label,
        value: loggedLabel(logged),
      }))
    : history.periods.map(({ start, label, mark }) => ({
        start,
        label,
        value: HISTORY_MARK_LABELS[mark],
      }));

/** Every period since the start date, newest first. */
export function HistoryList({ history, limit }: { history: HabitHistory; limit: number }) {
  return (
    <View role="list" aria-label="Periods" className="gap-1">
      {periodLines(history)
        .slice(0, limit)
        .map(({ start, label, value }) => (
          <View key={start} role="listitem" className="border-border flex-row gap-3 border-b py-2">
            <Text className="flex-1">{label}</Text>
            <Text variant="muted">{value}</Text>
          </View>
        ))}
    </View>
  );
}

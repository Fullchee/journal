import { clockLabel, formatMinutes, plainTaskName, type PoolPlan, type Span } from "@/core";
import { Text, cn } from "@/ui";
import { View } from "react-native";

// The personal pool's hours (07:00-22:00) hold every block either pool can get.
const DAY_START = 420;
const DAY_END = 1320;
const PX_PER_MINUTE = 0.8;

const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60);

const top = (minutes: number) => (Math.max(minutes, DAY_START) - DAY_START) * PX_PER_MINUTE;

const height = ({ start, end }: Span) => Math.max(top(Math.min(end, DAY_END)) - top(start), 0);

/** One column of the day: calendar busy times shaded, proposed blocks on top. */
export function DayTimeline({ pools, busy }: { pools: PoolPlan[]; busy: Span[] }) {
  return (
    <View
      accessibilityLabel="Day timeline"
      className="border-border relative ml-20 border-l"
      // oxlint-disable-next-line shadcn/no-inline-styles -- the timeline height scales with the day's minutes
      style={{ height: (DAY_END - DAY_START) * PX_PER_MINUTE }}
    >
      {HOURS.map((hour) => (
        <View
          key={hour}
          className="border-border/50 absolute right-0 -left-20 flex-row items-start border-t"
          // oxlint-disable-next-line shadcn/no-inline-styles -- each hour line sits at its time of day
          style={{ top: top(hour) }}
        >
          <Text variant="muted" className="w-18 text-xs tabular-nums">
            {clockLabel(formatMinutes(hour))}
          </Text>
        </View>
      ))}
      {busy
        .filter((span) => span.end > DAY_START && span.start < DAY_END)
        .map((span) => (
          <View
            key={`busy-${span.start}`}
            className="bg-muted absolute right-0 left-0"
            // oxlint-disable-next-line shadcn/no-inline-styles -- each busy span sits at its time of day
            style={{ top: top(span.start), height: height(span) }}
          />
        ))}
      {pools.flatMap(({ pool, placed }) =>
        placed.map((span) => (
          <View
            key={`${pool}-${span.start}`}
            className={cn(
              "absolute left-1 right-1 overflow-hidden rounded-md border px-2 py-1",
              pool === "job" ? "border-primary bg-card" : "border-primary bg-primary",
            )}
            // oxlint-disable-next-line shadcn/no-inline-styles -- each block sits at its time of day
            style={{ top: top(span.start), height: height(span) }}
          >
            <Text
              className={cn("text-xs", pool === "personal" && "text-primary-foreground")}
              numberOfLines={2}
            >
              {clockLabel(formatMinutes(span.start))}–{clockLabel(formatMinutes(span.end))} ·{" "}
              {span.block.tasks.map((t) => plainTaskName(t.content)).join(", ")}
            </Text>
          </View>
        )),
      )}
    </View>
  );
}

import { dayLabel, hasEntries, type BriefRow, type WeekDay } from "@/core";
import { Text } from "@/ui";
import { View } from "react-native";

const checkInLine = ({ time, zone, score, where, doing, onMyMind, note }: BriefRow) =>
  [
    `${time} ${zone} (${score})`,
    [where, doing].filter(Boolean).join(", "),
    onMyMind,
    note === "" ? "" : `“${note}”`,
  ]
    .filter(Boolean)
    .join(" · ");

const sleepText = ({ durationMin, sleepScore }: NonNullable<WeekDay["sleep"]>) =>
  [
    "Sleep: ",
    (durationMin / 60).toFixed(1),
    "h",
    sleepScore === null ? "" : `, sleep score ${sleepScore}`,
  ].join("");

const activityText = ({ steps, avgStress }: NonNullable<WeekDay["activity"]>) =>
  [
    "Activity: ",
    steps.toLocaleString("en-US"),
    " steps",
    avgStress === null ? "" : `, stress ${avgStress}`,
  ].join("");

function DayLines({ day }: { day: WeekDay }) {
  const lines = [
    ...day.checkIns.map((row) => checkInLine(row)),
    ...(day.sleep ? [sleepText(day.sleep)] : []),
    ...(day.activity ? [activityText(day.activity)] : []),
    ...(day.habits.length > 0 ? [`Habits: ${day.habits.join(", ")}`] : []),
  ];

  return (
    <View role="list" className="gap-1">
      {lines.map((line, i) => (
        // eslint-disable-next-line eslint-react/no-array-index-key -- read-only lines that never reorder, and the same line can repeat
        <Text key={i} role="listitem">
          {line}
        </Text>
      ))}
    </View>
  );
}

/** The week's data under its Toronto days; a day with nothing logged is left out. */
export function WeeklyReviewDays({ days }: { days: WeekDay[] }) {
  const shown = days.filter((day) => hasEntries(day));

  if (shown.length === 0) return <Text variant="muted">Nothing logged this week.</Text>;

  return (
    <View className="gap-4">
      {shown.map((day) => (
        <View key={day.day} className="gap-1">
          <Text aria-level={3} variant="title">
            {dayLabel(day.day)}
          </Text>
          <DayLines day={day} />
        </View>
      ))}
    </View>
  );
}

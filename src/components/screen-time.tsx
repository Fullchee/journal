import { formatDay, hoursLabel, shiftDay } from "@/core";
import { Button, Text } from "@/ui";
import { View } from "react-native";

import { useScreenTime } from "@/lib/data/screen-time";
import { useUsageAccess } from "@/lib/screen-time/screen-time";

const SHOWN_DAYS = 7;

/** The last 7 Days' screen time, newest first, each the total across every device that sent one. */
export function ScreenTimeDays({ today }: { today: string }) {
  const from = shiftDay(today, 1 - SHOWN_DAYS);
  const { data } = useScreenTime(from);

  if (data === undefined) return null;
  const minutes = new Map(data.days.map(({ day, minutes: total }) => [day, total]));

  const days = Array.from({ length: SHOWN_DAYS }, (_, back) => shiftDay(today, -back));

  return (
    <View className="gap-1">
      {days.map((day) => {
        const total = minutes.get(day);

        return (
          <View key={day} className="flex-row justify-between gap-3">
            <Text variant="muted">
              {day === today
                ? "Today"
                : formatDay(day, { weekday: "short", month: "short", day: "numeric" })}
            </Text>
            <Text>{total === undefined ? "Not sent" : hoursLabel(total)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Asks for Usage access on an Android phone that hasn't given it; quiet everywhere else. */
export function UsageAccessPrompt() {
  const access = useUsageAccess();

  if (access === null || access.granted) return null;

  return (
    <View className="gap-2">
      <Text variant="muted">
        To count this phone, switch on Usage access for Journal. It sends only each Day's total.
      </Text>
      <Button variant="outline" className="self-start" onPress={access.open}>
        <Text>Open Usage access</Text>
      </Button>
    </View>
  );
}

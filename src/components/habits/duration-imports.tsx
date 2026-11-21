import { insightTimerSessions } from "@/core";
import { Button, Icon, Text } from "@/ui";
import { FileUp } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { HealthConnectImport } from "@/components/habits/health-connect-import";
import { useIsOnline } from "@/lib/data/data-provider";
import { useImportDurations } from "@/lib/data/habits";
import { pickCsvText } from "@/lib/pick-csv";

const counted = (n: number) => (n === 1 ? "1 session" : `${String(n)} sessions`);

/** Logs each session of Insight Timer's CSV log as one Duration entry of this Habit; re-importing skips logged ones. */
function InsightTimerImport({ habit }: { habit: string }) {
  const isOnline = useIsOnline();
  const importDurations = useImportDurations();
  const [message, setMessage] = useState("");

  async function importFile() {
    const text = await pickCsvText();

    if (text === null) return;
    const entries = insightTimerSessions(text);

    if (entries === null) {
      setMessage("That file isn't an Insight Timer session log.");

      return;
    }

    if (entries.length === 0) {
      setMessage("That file has no sessions.");

      return;
    }

    setMessage("Importing…");
    importDurations.mutate(
      { habit, entries },
      {
        onSuccess: (added) =>
          setMessage(`Added ${counted(added)}. ${counted(entries.length - added)} already logged.`),
        onError: () => setMessage("Couldn't import. Try again."),
      },
    );
  }

  return (
    <View className="gap-2">
      <Button
        variant="outline"
        disabled={!isOnline || importDurations.isPending}
        onPress={() => void importFile()}
      >
        <Icon as={FileUp} />
        <Text>Import Insight Timer CSV</Text>
      </Button>
      {message !== "" && <Text variant="muted">{message}</Text>}
    </View>
  );
}

/** A Duration Habit's imports: Insight Timer's CSV log, plus Calm's and Hevy's Health Connect links. */
export function DurationImports({ habit }: { habit: string }) {
  return (
    <View className="border-border gap-2 border-t pt-4">
      <InsightTimerImport habit={habit} />
      <HealthConnectImport habit={habit} source="calm" />
      <HealthConnectImport habit={habit} source="hevy" />
    </View>
  );
}

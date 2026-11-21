import { Button, Icon, Text } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { Leaf } from "lucide-react-native";
import { View } from "react-native";

import { useLinkChange } from "@/hooks/use-link-change";
import { useIsOnline } from "@/lib/data/data-provider";
import { useImportDurations } from "@/lib/data/habits";
import {
  calmAutoLog,
  type CalmAutoLog,
  type LinkResult,
} from "@/lib/health/health-connect-auto-log";

// Calm's key predates Hevy's, so it is kept.
const LINKED_HABIT_KEY = ["calm-auto-log"] as const;

const counted = (n: number) => (n === 1 ? "1 session" : `${String(n)} sessions`);

const LINK_FAILURES = {
  unavailable: "Health Connect isn’t on this phone. Install or update it, then try again.",
  denied: "Allow Journal to read Mindfulness in Health Connect, then try again.",
} as const;

const linkedMessage = (result: LinkResult) =>
  result.status === "linked"
    ? `Added ${counted(result.added)} from Calm.`
    : LINK_FAILURES[result.status];

function CalmLink({ habit, autoLog }: { habit: string; autoLog: CalmAutoLog }) {
  const isOnline = useIsOnline();
  const { mutateAsync } = useImportDurations();
  const linked = useQuery({ queryKey: LINKED_HABIT_KEY, queryFn: autoLog.linkedHabit });

  const { message, busy, change } = useLinkChange(
    LINKED_HABIT_KEY,
    "Couldn't read Calm sessions. Try again.",
  );

  const isLinked = linked.data === habit;

  const linkHere = () => change(async () => linkedMessage(await autoLog.link(habit, mutateAsync)));

  const unlink = () =>
    change(async () => {
      await autoLog.unlink();

      return "Calm sessions are no longer logged here.";
    });

  return (
    <View className="gap-2">
      {isLinked && (
        <Text>Calm sessions from Health Connect are logged here when the app opens.</Text>
      )}
      <Button
        variant="outline"
        disabled={!isOnline || busy || linked.isPending}
        onPress={() => void (isLinked ? unlink() : linkHere())}
      >
        <Icon as={Leaf} />
        <Text>{isLinked ? "Stop logging Calm" : "Auto-log Calm sessions"}</Text>
      </Button>
      {message !== "" && <Text variant="muted">{message}</Text>}
    </View>
  );
}

/** Links this Duration Habit to Calm's Health Connect sessions on this phone; another linked Habit is replaced. */
export function CalmImport({ habit }: { habit: string }) {
  return calmAutoLog && <CalmLink habit={habit} autoLog={calmAutoLog} />;
}

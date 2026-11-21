import type { HealthConnectSource } from "@/core";
import { Button, Icon, Text } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { Dumbbell, Leaf, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { useLinkChange } from "@/hooks/use-link-change";
import { useIsOnline } from "@/lib/data/data-provider";
import { useImportDurations } from "@/lib/data/habits";
import {
  healthConnectAutoLog,
  type HealthConnectAutoLog,
  type LinkResult,
} from "@/lib/health/health-connect-auto-log";

interface SourceCopy {
  app: string;
  icon: LucideIcon;
  /** What one of the app's sessions is called. */
  unit: string;
  /** The Health Connect permission the owner allows, as its settings name it. */
  permission: string;
}

const COPY: Record<HealthConnectSource, SourceCopy> = {
  calm: { app: "Calm", icon: Leaf, unit: "session", permission: "Mindfulness" },
  hevy: { app: "Hevy", icon: Dumbbell, unit: "workout", permission: "Exercise" },
};

const counted = (n: number, unit: string) => (n === 1 ? `1 ${unit}` : `${String(n)} ${unit}s`);

function linkedMessage(result: LinkResult, { app, unit, permission }: SourceCopy) {
  if (result.status === "linked") return `Added ${counted(result.added, unit)} from ${app}.`;

  return result.status === "unavailable"
    ? "Health Connect isn’t on this phone. Install or update it, then try again."
    : `Allow Journal to read ${permission} in Health Connect, then try again.`;
}

interface LinkProps {
  habit: string;
  source: HealthConnectSource;
  autoLog: HealthConnectAutoLog;
}

function SourceLink({ habit, source, autoLog }: LinkProps) {
  const copy = COPY[source];
  const queryKey = [`${source}-auto-log`];
  const isOnline = useIsOnline();
  const { mutateAsync } = useImportDurations();
  const linked = useQuery({ queryKey, queryFn: () => autoLog.linkedHabit(source) });

  const { message, busy, change } = useLinkChange(
    queryKey,
    `Couldn't read ${copy.app} ${copy.unit}s. Try again.`,
  );

  const isLinked = linked.data === habit;

  const linkHere = () =>
    change(async () => linkedMessage(await autoLog.link(source, habit, mutateAsync), copy));

  const unlink = () =>
    change(async () => {
      await autoLog.unlink(source);

      return `${copy.app} ${copy.unit}s are no longer logged here.`;
    });

  return (
    <View className="gap-2">
      {isLinked && (
        <Text>
          {copy.app} {copy.unit}s from Health Connect are logged here when the app opens.
        </Text>
      )}
      <Button
        variant="outline"
        disabled={!isOnline || busy || linked.isPending}
        onPress={() => void (isLinked ? unlink() : linkHere())}
      >
        <Icon as={copy.icon} />
        <Text>{isLinked ? `Stop logging ${copy.app}` : `Auto-log ${copy.app} ${copy.unit}s`}</Text>
      </Button>
      {message !== "" && <Text variant="muted">{message}</Text>}
    </View>
  );
}

/** Links this Duration Habit to an app's Health Connect sessions on this phone; another linked Habit is replaced. */
export function HealthConnectImport({
  habit,
  source,
}: {
  habit: string;
  source: HealthConnectSource;
}) {
  return (
    healthConnectAutoLog && (
      <SourceLink habit={habit} source={source} autoLog={healthConnectAutoLog} />
    )
  );
}

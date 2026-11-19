import {
  dueToReachOut,
  firstFollowUp,
  inDaysLabel,
  torontoDay,
  planWith,
  seeingToday,
  upcomingDates,
  type Connection,
} from "@/core";
import { useState, type ReactNode } from "react";
import { View } from "react-native";

import { Button } from "./button";
import { ReachedOut, type InteractionInput } from "./reached-out";
import { Text } from "./text";

interface ConnectionsTodayProps {
  connections: Connection[];
  /** Grow closer answers save online only. */
  isOnline: boolean;
  onOpen: (id: number) => void;
  onReachedOut: (id: number, interaction: InteractionInput) => void;
  onPlanAnswered: (id: number) => void;
  now: Date;
}

function PersonLink({
  id,
  name,
  onOpen,
}: {
  id: number;
  name: string;
  onOpen: (id: number) => void;
}) {
  return (
    <Text role="link" className="text-primary underline" onPress={() => onOpen(id)}>
      {name}
    </Text>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <Text variant="muted">{children}</Text>;
}

/** Who to see, reach out to, make plans with, and whose dates are near; renders nothing on a quiet day. */
export function ConnectionsToday({
  connections,
  isOnline,
  onOpen,
  onReachedOut,
  onPlanAnswered,
  now,
}: ConnectionsTodayProps) {
  const [done, setDone] = useState<number[]>([]);
  const [answered, setAnswered] = useState(false);

  const seeing = seeingToday(connections, now);
  const upcoming = upcomingDates(connections, torontoDay(now));
  const plan = answered ? null : planWith(connections, now);

  const due = dueToReachOut(connections, now).filter((c) => !done.includes(c.id));

  if (!plan && seeing.length === 0 && upcoming.length === 0 && due.length === 0) return null;

  const answerPlan = (id: number) => {
    setAnswered(true);
    onPlanAnswered(id);
  };

  return (
    <View role="region" aria-label="Connections for today" className="gap-3">
      <Text aria-level={2} variant="headline">
        Connections
      </Text>
      {seeing.map((s) => (
        <View key={`seeing-${s.id}-${s.label}`} className="gap-1">
          <Text>
            Seeing <PersonLink id={s.id} name={s.name} onOpen={onOpen} /> at {s.label}
          </Text>
          {s.followUp === "" ? null : <Hint>Ask about: {s.followUp}</Hint>}
        </View>
      ))}
      {upcoming.map((u) => (
        <Text key={`date-${u.id}-${u.label}`}>
          <PersonLink id={u.id} name={u.name} onOpen={onOpen} />: {u.label}{" "}
          <Text variant="muted">{inDaysLabel(u.inDays)}</Text>
        </Text>
      ))}
      {plan ? (
        <View className="gap-2">
          <Text>
            Make a plan with <PersonLink id={plan.id} name={plan.name} onOpen={onOpen} />
          </Text>
          <Hint>About 50 hours together turns an acquaintance into a friend.</Hint>
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="h-11"
              disabled={!isOnline}
              onPress={() => answerPlan(plan.id)}
            >
              <Text>Made a plan</Text>
            </Button>
            <Button
              variant="ghost"
              className="h-11"
              disabled={!isOnline}
              onPress={() => answerPlan(plan.id)}
            >
              <Text>Not this week</Text>
            </Button>
          </View>
          {isOnline ? null : <Hint>Editing needs a connection.</Hint>}
        </View>
      ) : null}
      {due.map((c) => {
        const followUp = firstFollowUp(c.followUps);

        return (
          <View key={`due-${c.id}`} className="gap-2">
            <Text>
              Reach out to <PersonLink id={c.id} name={c.name} onOpen={onOpen} />
            </Text>
            {followUp === "" ? null : <Hint>Ask about: {followUp}</Hint>}
            <ReachedOut
              name={c.name}
              onReachedOut={(interaction) => {
                setDone((ids) => [...ids, c.id]);
                onReachedOut(c.id, interaction);
              }}
            />
          </View>
        );
      })}
      {due.length > 0 ? <Hint>People like hearing from you more than you expect.</Hint> : null}
    </View>
  );
}

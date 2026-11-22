import { targetPeriodLabel, targetsToReview, torontoDay, type ClosingView } from "@/core";
import { Button, Text } from "@/ui";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { TargetLine, WHOLE_NUMBER } from "@/components/goal-target";
import { INPUT_CLASS, SaveStatus } from "@/components/note-body";
import { Section } from "@/components/screen";
import { useAnswerTarget, useTargets } from "@/lib/data/targets";

function AdjustForm({ onSave }: { onSave: (number: number) => void }) {
  const [number, setNumber] = useState("");

  return (
    <View className="gap-1">
      <Text variant="muted">New number</Text>
      <View className="flex-row gap-2">
        <TextInput
          aria-label="New number"
          className={`${INPUT_CLASS} w-32`}
          keyboardType="number-pad"
          value={number}
          onChangeText={setNumber}
        />
        <Button disabled={!WHOLE_NUMBER.test(number.trim())} onPress={() => onSave(Number(number))}>
          <Text>Save</Text>
        </Button>
      </View>
    </View>
  );
}

/** Keep, Adjust or Let go for a period that ended short; a deadline also offers Achieved. Nothing else prompts. */
function ReviewPrompt({ view, today }: { view: ClosingView; today: string }) {
  const answer = useAnswerTarget(view.goalId);
  const [adjusting, setAdjusting] = useState(false);
  const through = view.closing.to;

  // A month can close early in the week, so the line above shows the next month and the prompt names the one that ended.
  const ended =
    view.closing.from === view.current.from
      ? ""
      : `Ended at ${targetPeriodLabel(view.target, view.closing, today)}. `;

  return (
    <View className="gap-2">
      <Text variant="muted">{ended}Keep the number, adjust it or let it go?</Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-11"
          disabled={answer.isPending}
          onPress={() => answer.mutate({ answer: "keep", through })}
        >
          <Text>Keep</Text>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-11"
          disabled={answer.isPending}
          onPress={() => setAdjusting(true)}
        >
          <Text>Adjust</Text>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-11"
          disabled={answer.isPending}
          onPress={() => answer.mutate({ answer: "let-go", through })}
        >
          <Text>Let go</Text>
        </Button>
        {view.target.period === "deadline" && (
          <Button
            variant="outline"
            size="sm"
            className="h-11"
            disabled={answer.isPending}
            onPress={() => answer.mutate({ answer: "achieved", through })}
          >
            <Text>Achieved</Text>
          </Button>
        )}
      </View>
      {adjusting && (
        <AdjustForm onSave={(number) => answer.mutate({ answer: "adjust", through, number })} />
      )}
      <SaveStatus save={answer} />
    </View>
  );
}

/** The week's Targets as progress, each one whose period ended short asked about once beneath it. */
export function WeekTargets({ end }: { end: string }) {
  const [today] = useState(() => torontoDay(new Date()));

  // A Pillar Goal's bar above already shows its Signal for the week, so it is neither repeated nor asked about.
  const shown = (useTargets(end).data?.targets ?? []).filter(
    ({ state, pillar }) => state === "active" && pillar === null,
  );

  if (shown.length === 0) return null;
  const toReview = new Map(targetsToReview(shown, today).map((view) => [view.goalId, view]));

  return (
    <Section title="Targets">
      <View className="gap-4">
        {shown.map((view) => {
          const closing = toReview.get(view.goalId);

          return (
            <View key={view.goalId} className="gap-2">
              <TargetLine view={view} today={today} />
              {closing !== undefined && <ReviewPrompt view={closing} today={today} />}
            </View>
          );
        })}
      </View>
    </Section>
  );
}

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
    <View className="flex-row gap-2">
      <TextInput
        aria-label="New number"
        className={`${INPUT_CLASS} flex-1`}
        keyboardType="number-pad"
        value={number}
        onChangeText={setNumber}
      />
      <Button disabled={!WHOLE_NUMBER.test(number.trim())} onPress={() => onSave(Number(number))}>
        <Text>Save</Text>
      </Button>
    </View>
  );
}

/** Keep, Adjust or Let go for a period that ended short; a deadline also offers Achieved. Nothing else prompts. */
function ReviewPrompt({ view, today }: { view: ClosingView; today: string }) {
  const answer = useAnswerTarget(view.goalId);
  const [adjusting, setAdjusting] = useState(false);
  const through = view.closing.to;

  return (
    <View className="gap-2">
      <Text variant="muted">
        {view.title} ended at {targetPeriodLabel(view.target, view.closing, today)}. Keep the
        number, adjust it or let it go?
      </Text>
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

/** The week's Targets as progress, then each one whose period ended short in it, asked about once. */
export function WeekTargets({ end }: { end: string }) {
  const [today] = useState(() => torontoDay(new Date()));
  const active = (useTargets(end).data?.targets ?? []).filter(({ state }) => state === "active");

  if (active.length === 0) return null;
  const toReview = targetsToReview(active, today);

  return (
    <Section title="Targets">
      {active.map((view) => (
        <TargetLine key={view.goalId} view={view} today={today} />
      ))}
      {toReview.map((view) => (
        <ReviewPrompt key={view.goalId} view={view} today={today} />
      ))}
    </Section>
  );
}

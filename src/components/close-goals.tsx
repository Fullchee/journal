import type { CloseGoal, MoveKind, ProposedGoal } from "@/core";
import { Button, Text } from "@/ui";
import { Platform, TextInput, View } from "react-native";

import { ChoiceRow, type Choice } from "@/components/choice-row";
import { INPUT_CLASS } from "@/components/note-body";

export interface GoalReview {
  words: string;
  move: MoveKind;
  revision: string;
}

export interface Proposal extends ProposedGoal {
  picked: boolean;
}

const MOVES: Choice<MoveKind>[] = [
  { value: "carry", label: "Carry" },
  { value: "revise", label: "Revise" },
  { value: "retire", label: "Retire" },
  { value: "achieve", label: "Achieve" },
];

interface GoalReviewFieldProps {
  goal: CloseGoal;
  review: GoalReview;
  onChange: (review: GoalReview) => void;
}

/** One Goal's observed position in the owner's words and its one move; never a grade. */
export function GoalReviewField({ goal, review, onChange }: GoalReviewFieldProps) {
  return (
    <View className="gap-2">
      <Text aria-level={3} className="font-sans-bold">
        {goal.title}
      </Text>
      {goal.habits.length > 0 && <Text variant="muted">Through {goal.habits.join(", ")}</Text>}
      <TextInput
        aria-label={`Where ${goal.title} stands`}
        className={`${INPUT_CLASS} min-h-20`}
        multiline
        rows={Platform.OS === "web" ? 3 : undefined}
        textAlignVertical="top"
        value={review.words}
        onChangeText={(words) => onChange({ ...review, words })}
      />
      <ChoiceRow
        legend={`Move for ${goal.title}`}
        choices={MOVES}
        selected={review.move}
        onPick={(move) => onChange({ ...review, move })}
      />
      {review.move === "revise" && (
        <TextInput
          aria-label={`New wording for ${goal.title}`}
          className={INPUT_CLASS}
          value={review.revision}
          onChangeText={(revision) => onChange({ ...review, revision })}
        />
      )}
    </View>
  );
}

interface ProposalsProps {
  proposals: Proposal[];
  onChange: (proposals: Proposal[]) => void;
}

/** Next year's Goals as drafted; only the picked ones are created. */
export function ProposedGoals({ proposals, onChange }: ProposalsProps) {
  if (proposals.length === 0)
    return <Text variant="muted">No Goals proposed. Draft to get some.</Text>;

  const update = (index: number, proposal: Proposal) => onChange(proposals.with(index, proposal));

  return (
    <View className="gap-4">
      {proposals.map((proposal, index) => (
        // eslint-disable-next-line eslint-react/no-array-index-key -- the owner edits titles, so the index is the only stable key
        <View key={index} className="gap-2">
          <Button
            size="sm"
            className="h-11 self-start"
            role="checkbox"
            aria-label={`Pick proposed Goal ${index + 1}`}
            aria-checked={proposal.picked}
            variant={proposal.picked ? "default" : "outline"}
            onPress={() => update(index, { ...proposal, picked: !proposal.picked })}
          >
            <Text>{proposal.picked ? "Picked" : "Pick"}</Text>
          </Button>
          <TextInput
            aria-label={`Proposed Goal ${index + 1}`}
            className={INPUT_CLASS}
            value={proposal.title}
            onChangeText={(title) => update(index, { ...proposal, title })}
          />
        </View>
      ))}
    </View>
  );
}

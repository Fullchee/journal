import { torontoDay, type ConnectionRef, type InteractionProposal } from "@/core";
import {
  Button,
  DateField,
  Icon,
  Input,
  InteractionInputs,
  Text,
  interactionOf,
  type InteractionDraft,
} from "@/ui";
import { Sparkles } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { useIsOnline } from "@/lib/data/data-provider";
import { proposeInteraction, useSaveProposedInteraction } from "@/lib/data/interaction-draft";

export const INTERACTION_OFFLINE_NOTICE =
  "Offline. This box needs a connection; Reached out on a person’s page still works.";

const MAX_FOLLOW_UP = 500;
const MAX_SUGGESTIONS = 8;

/** One name from the sentence; it saves only once it is a picked Connection. */
interface Slot {
  said: string;
  matches: ConnectionRef[];
  picked: ConnectionRef | null;
}

interface Review {
  text: string;
  slots: Slot[];
  day: string;
  draft: InteractionDraft;
  followUp: string;
}

const reviewOf = (
  text: string,
  { people, day, kind, note, followUp }: InteractionProposal,
): Review => ({
  text,
  slots: people.map(({ said, matches }) => ({
    said,
    matches,
    picked: (matches.length === 1 ? matches[0] : undefined) ?? null,
  })),
  day,
  draft: { kind, note, minutes: "" },
  followUp,
});

// A name that matched nobody searches everyone, so a nickname or typo still finds the person; it never creates one.
function candidatesOf({ matches }: Slot, everyone: ConnectionRef[], filter: string) {
  if (matches.length > 1) return matches;
  const q = filter.trim().toLowerCase();

  return everyone
    .filter(({ name }) => q !== "" && name.toLowerCase().includes(q))
    .slice(0, MAX_SUGGESTIONS);
}

function pickerPrompt({ said, matches }: Slot) {
  if (matches.length === 0) return `Nobody here is named “${said}”. Who is it?`;

  return matches.length === 1 ? `Who is “${said}”?` : `Which “${said}”?`;
}

function PersonPicker({
  slot,
  everyone,
  onPick,
}: {
  slot: Slot;
  everyone: ConnectionRef[];
  onPick: (person: ConnectionRef) => void;
}) {
  const [filter, setFilter] = useState("");
  const isSearch = slot.matches.length <= 1;
  const candidates = candidatesOf(slot, everyone, filter);

  return (
    <View role="group" aria-label={`Who is ${slot.said}?`} className="gap-2">
      <Text variant="muted">{pickerPrompt(slot)}</Text>
      {isSearch ? (
        <Input
          aria-label={`Find ${slot.said}`}
          placeholder="Type a name"
          value={filter}
          onChangeText={setFilter}
        />
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {candidates.map((person) => (
          <Button
            key={person.id}
            size="sm"
            variant="outline"
            className="h-11"
            onPress={() => onPick(person)}
          >
            <Text>{person.name}</Text>
          </Button>
        ))}
      </View>
    </View>
  );
}

interface SlotProps {
  slot: Slot;
  everyone: ConnectionRef[];
  update: (slot: Slot) => void;
  remove: () => void;
}

function SlotRow({ slot, everyone, update, remove }: SlotProps) {
  return (
    <View className="border-border gap-2 rounded-lg border p-3">
      {slot.picked === null ? (
        <PersonPicker
          slot={slot}
          everyone={everyone}
          onPick={(picked) => update({ ...slot, picked })}
        />
      ) : (
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="flex-1">{slot.picked.name}</Text>
          <Button
            variant="ghost"
            className="h-11"
            onPress={() => update({ ...slot, picked: null })}
          >
            <Text>Change</Text>
          </Button>
        </View>
      )}
      <Button variant="ghost" className="h-11 self-start" onPress={remove}>
        <Text>Leave out {slot.picked?.name ?? slot.said}</Text>
      </Button>
    </View>
  );
}

function ReviewForm({
  start,
  everyone,
  onDone,
}: {
  start: Review;
  everyone: ConnectionRef[];
  onDone: (saved: boolean) => void;
}) {
  const [review, setReview] = useState(start);
  const isOnline = useIsOnline();
  const save = useSaveProposedInteraction();
  // eslint-disable-next-line eslint-react/purity -- the day picker stops at today's Toronto Day
  const today = torontoDay(new Date());
  const { slots } = review;
  const pickedPeople = slots.flatMap(({ picked }) => picked ?? []);
  const allPicked = slots.length > 0 && pickedPeople.length === slots.length;

  const setSlot = (index: number) => (slot: Slot) =>
    setReview({ ...review, slots: slots.map((s, i) => (i === index ? slot : s)) });

  const submit = () =>
    save.mutate(
      {
        connectionIds: [...new Set(pickedPeople.map(({ id }) => id))],
        day: review.day,
        ...interactionOf(review.draft),
        followUp: review.followUp.trim(),
      },
      { onSuccess: () => onDone(true) },
    );

  return (
    <View role="form" aria-label="Review Interaction" className="gap-3">
      <Text variant="muted">“{review.text}”</Text>
      {slots.map((slot, index) => (
        <SlotRow
          // Names are unique per sentence; the server drops repeats.
          key={slot.said}
          slot={slot}
          everyone={everyone}
          update={setSlot(index)}
          remove={() => setReview({ ...review, slots: slots.filter((_, i) => i !== index) })}
        />
      ))}
      {slots.length === 0 ? <Text variant="muted">Nobody left. Cancel and try again.</Text> : null}
      <DateField
        label="Day"
        value={review.day}
        max={today}
        onChange={(day) => setReview({ ...review, day })}
      />
      <InteractionInputs
        draft={review.draft}
        onChange={(draft) => setReview({ ...review, draft })}
        noteLabel="What did you talk about?"
      />
      <Input
        aria-label="Follow-up"
        maxLength={MAX_FOLLOW_UP}
        placeholder="Follow-up for next time (optional)"
        value={review.followUp}
        onChangeText={(followUp) => setReview({ ...review, followUp })}
      />
      <View className="flex-row gap-2">
        <Button
          className="h-11 flex-1"
          disabled={!isOnline || !allPicked || save.isPending}
          onPress={submit}
        >
          <Text>Save</Text>
        </Button>
        <Button variant="outline" className="h-11 flex-1" onPress={() => onDone(false)}>
          <Text>Cancel</Text>
        </Button>
      </View>
      {save.isError ? <Text role="alert">Couldn&apos;t save. Try again.</Text> : null}
    </View>
  );
}

/** The model only guesses: the sentence opens a review form, and nothing saves until Save. */
export function InteractionBox({ everyone }: { everyone: ConnectionRef[] }) {
  type BoxState =
    | { status: "idle" }
    | { status: "reading" }
    | { status: "failed"; problem: string }
    | { status: "reviewing"; review: Review }
    | { status: "saved" };

  const isOnline = useIsOnline();
  const [text, setText] = useState("");
  const [state, setState] = useState<BoxState>({ status: "idle" });
  const spinnerColor = useCSSVariable("--color-primary-foreground");

  if (state.status === "reviewing")
    return (
      <ReviewForm
        start={state.review}
        everyone={everyone}
        onDone={(didSave) => {
          setState({ status: didSave ? "saved" : "idle" });

          if (didSave) setText("");
        }}
      />
    );

  const canSend = isOnline && state.status !== "reading" && text.trim() !== "";

  const submit = async () => {
    if (!canSend) return;
    const sentence = text.trim();

    setState({ status: "reading" });
    const read = await proposeInteraction(sentence);

    setState(
      read.type === "proposal"
        ? { status: "reviewing", review: reviewOf(sentence, read.proposal) }
        : { status: "failed", problem: read.text },
    );
  };

  return (
    <View className="gap-1">
      <View className="flex-row gap-2">
        <Input
          aria-label="Log an Interaction"
          className="flex-1"
          placeholder="“Called Cindy about her trip”"
          value={text}
          editable={isOnline}
          onChangeText={setText}
          onSubmitEditing={() => void submit()}
        />
        <Button
          size="icon"
          aria-label="Read sentence"
          className="h-11 w-11"
          disabled={!canSend}
          onPress={() => void submit()}
        >
          {state.status === "reading" ? (
            <ActivityIndicator size="small" color={spinnerColor} />
          ) : (
            <Icon as={Sparkles} />
          )}
        </Button>
      </View>
      {state.status === "failed" && (
        <Text aria-live="polite" className="text-destructive text-sm">
          {state.problem}
        </Text>
      )}
      {state.status === "saved" ? (
        <Text variant="muted" aria-live="polite">
          Saved.
        </Text>
      ) : null}
      {isOnline ? null : (
        <Text variant="muted" aria-live="polite">
          {INTERACTION_OFFLINE_NOTICE}
        </Text>
      )}
    </View>
  );
}

import {
  canSkip,
  clockLabel,
  defaultAnswer,
  dueDateLabel,
  reviewNoteLine,
  suggestedCause,
  torontoDay,
  type ReviewAnswer,
  type ReviewEvent,
  type ReviewNote,
} from "@/core";
import { Button, Text } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { ChoiceRow, type Choice } from "@/components/choice-row";
import { Screen, Section } from "@/components/screen";
import { StatusText } from "@/components/status-text";
import { eveningReviewQuery, useConfirmReview } from "@/lib/data/evening-review";

type Pick = "done" | "no" | "outside" | "avoidance";

const DONE: Choice<Pick> = { value: "done", label: "Done" };
const NO: Choice<Pick> = { value: "no", label: "Didn't" };
const OUTSIDE: Choice<Pick> = { value: "outside", label: "Skip: outside" };
const AVOIDANCE: Choice<Pick> = { value: "avoidance", label: "Skip: avoidance" };

// A removed event was never done, and one cancelled by someone else offers its outside Skip first.
function choicesOf(event: ReviewEvent): Choice<Pick>[] {
  const causes = suggestedCause(event) === "outside" ? [OUTSIDE, AVOIDANCE] : [AVOIDANCE, OUTSIDE];
  const skips = canSkip(event) ? causes : [];

  return event.removed ? [{ ...NO, label: "Log nothing" }, ...skips] : [DONE, NO, ...skips];
}

const pickOf = (answer: ReviewAnswer): Pick => (answer.done ? "done" : (answer.cause ?? "no"));

const answerOf = (eventId: string, pick: Pick): ReviewAnswer =>
  pick === "done" || pick === "no"
    ? { eventId, done: pick === "done" }
    : { eventId, done: false, cause: pick };

function EventRow({
  event,
  pick,
  onPick,
}: {
  event: ReviewEvent;
  pick: Pick;
  onPick: (pick: Pick) => void;
}) {
  return (
    <View role="listitem" className="border-border gap-2 border-b pb-3">
      <Text className="font-sans-bold">{event.summary}</Text>
      <Text variant="muted">{`${clockLabel(event.startTime)} · ${event.habitName}`}</Text>
      <ChoiceRow
        legend={`What happened at ${event.summary}?`}
        choices={choicesOf(event)}
        selected={pick}
        onPick={onPick}
      />
    </View>
  );
}

function Review({ day, events }: { day: string; events: ReviewEvent[] }) {
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const confirm = useConfirmReview();
  const pickFor = (event: ReviewEvent) => picks[event.eventId] ?? pickOf(defaultAnswer(event));

  const row = (event: ReviewEvent) => (
    <EventRow
      key={event.eventId}
      event={event}
      pick={pickFor(event)}
      onPick={(pick) => setPicks({ ...picks, [event.eventId]: pick })}
    />
  );

  const kept = events.filter((event) => !event.removed);
  const removed = events.filter((event) => event.removed);

  return (
    <>
      {kept.length > 0 && <View role="list">{kept.map((event) => row(event))}</View>}
      {removed.length > 0 && (
        <Section title="Removed from calendar">
          <View role="list">{removed.map((event) => row(event))}</View>
        </Section>
      )}
      <Button
        className="h-11"
        disabled={confirm.isPending}
        onPress={() =>
          confirm.mutate({
            day,
            answers: events.map((event) => answerOf(event.eventId, pickFor(event))),
          })
        }
      >
        <Text>Confirm day</Text>
      </Button>
      {confirm.isError && (
        <StatusText tone="error">Couldn't save. Check the connection and try again.</StatusText>
      )}
    </>
  );
}

function DayNotes({ notes }: { notes: ReviewNote[] }) {
  if (notes.length === 0) return null;

  return (
    <Section title="Notes">
      <View role="list" className="gap-1">
        {notes.map((note, index) => (
          // eslint-disable-next-line eslint-react/no-array-index-key -- read-only lines that never reorder, and the same line can repeat
          <Text key={index} role="listitem">
            {reviewNoteLine(note)}
          </Text>
        ))}
      </View>
    </Section>
  );
}

const FAILURE_TEXT = {
  "not-connected": "Google Calendar isn't connected. Run scripts/setup-google-calendar.sh.",
  unreachable: "Couldn't reach Google Calendar.",
} as const;

export default function EveningReview() {
  const { day: asked } = useLocalSearchParams<{ day?: string }>();
  const [today] = useState(() => torontoDay(new Date()));
  const day = asked ?? today;
  const review = useQuery(eveningReviewQuery(day));

  const body = () => {
    if (review.isPending) return <Text variant="muted">Loading…</Text>;

    if (review.isError || review.data.status !== "ok")
      return (
        <View className="gap-3">
          <StatusText tone="error">
            {review.data === undefined || review.data.status === "ok"
              ? "Couldn't load the review."
              : FAILURE_TEXT[review.data.status]}
          </StatusText>
          <Button variant="outline" className="h-11" onPress={() => void review.refetch()}>
            <Text>Try again</Text>
          </Button>
        </View>
      );

    if (review.data.reviewed) return <StatusText>This day is confirmed.</StatusText>;

    if (review.data.events.length === 0)
      return (
        <Text variant="muted">
          No linked events on this day. Link a calendar series from a Habit's page.
        </Text>
      );

    return <Review day={day} events={review.data.events} />;
  };

  return (
    <Screen>
      <Text aria-level={2} variant="headline">
        {dueDateLabel(day)}
      </Text>
      {body()}
      {review.data && <DayNotes notes={review.data.notes} />}
    </Screen>
  );
}

import {
  isoWeekOf,
  isWeek,
  lastFullWeek,
  mondayOfWeek,
  shiftDay,
  shiftWeek,
  torontoDay,
  weekLabel,
  type WeeklyReviewBody,
} from "@/core";
import { Button, Text } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, TextInput, View } from "react-native";

import { NavRow } from "@/components/nav-row";
import { PillarBars } from "@/components/pillar-bars";
import { INPUT_CLASS } from "@/components/note-body";
import { Screen, Section } from "@/components/screen";
import { StatusText } from "@/components/status-text";
import { WeekTargets } from "@/components/target-review";
import { WeeklyReviewDays } from "@/components/weekly-review-days";
import { useDiscardGuard } from "@/hooks/use-discard-guard";
import { useKeyedDrafts } from "@/hooks/use-keyed-drafts";
import { ApiError } from "@/lib/api/errors";
import { confirm } from "@/lib/confirm";
import { useIsOnline } from "@/lib/data/data-provider";
import { useSaveRetro, weeklyReviewQuery } from "@/lib/data/weekly-review";
import { saveErrorMessage } from "@/lib/notes";

const CONFLICT = 409;

export default function WeeklyReview() {
  const { week: asked } = useLocalSearchParams<{ week?: string }>();
  const [now] = useState(() => new Date());

  const [week, setWeek] = useState(() =>
    asked !== undefined && isWeek(asked) ? asked : lastFullWeek(now),
  );

  const thisWeek = isoWeekOf(torontoDay(now));
  const drafts = useKeyedDrafts<string>();

  useDiscardGuard(drafts.dirty, "The retro you wrote is not saved.");

  return (
    <Screen>
      <View className="flex-row items-center justify-between gap-3">
        <Button variant="outline" className="h-11" onPress={() => setWeek(shiftWeek(week, -1))}>
          <Text>Prev</Text>
        </Button>
        <Text className="font-sans-bold">{weekLabel(week)}</Text>
        <Button
          variant="outline"
          className="h-11"
          disabled={week >= thisWeek}
          onPress={() => setWeek(shiftWeek(week, 1))}
        >
          <Text>Next</Text>
        </Button>
      </View>
      <WeekReview
        key={week}
        week={week}
        typed={drafts.get(week)}
        onType={(body, unchanged) =>
          drafts.update(
            week,
            () => body,
            () => unchanged,
          )
        }
        onSaved={() => drafts.drop(week)}
      />
    </Screen>
  );
}

interface DraftProps {
  /** The retro as typed, kept above the form so Prev and Next don't lose it; undefined until the owner types. */
  typed: string | undefined;
  onType: (body: string, unchanged: boolean) => void;
  onSaved: () => void;
}

function WeekReview({ week, ...draft }: DraftProps & { week: string }) {
  const online = useIsOnline();
  const review = useQuery(weeklyReviewQuery(week));

  async function refetch() {
    const { data } = await review.refetch();

    return data;
  }

  // A failed refetch keeps the loaded week, so the retro being typed stays on screen.
  if (review.data !== undefined)
    return <RetroForm review={review.data} refetch={refetch} {...draft} />;

  if (!online) return <Text variant="muted">Writing the retro needs a connection.</Text>;

  if (review.isError)
    return (
      <StatusText tone="error" className="text-destructive">
        Couldn&apos;t read the week. Try again.
      </StatusText>
    );

  return <Text variant="muted">Reading the week and drafting…</Text>;
}

interface RetroFormProps extends DraftProps {
  review: WeeklyReviewBody;
  /** Reads the week again, for a retro saved elsewhere since it opened. */
  refetch: () => Promise<WeeklyReviewBody | undefined>;
}

const RETRO_CONFLICT =
  "Couldn't save: another retro for this week clashes. Your text is still here; try again.";

const isConflict = (error: Error) => error instanceof ApiError && error.status === CONFLICT;

const askToReplace = (week: string) =>
  confirm({
    title: "Replace the retro?",
    message: `A retro for ${week} exists. Replace it?`,
    action: "Replace",
  });

function RetroForm({ review, refetch, typed, onType, onSaved }: RetroFormProps) {
  const online = useIsOnline();
  const body = typed ?? review.draft;
  const [saved, setSaved] = useState(false);
  const save = useSaveRetro();
  const { week } = review;

  const onSuccess = () => {
    onSaved();
    setSaved(true);
  };

  async function replace(id: number) {
    if (await askToReplace(week)) save.mutate({ week, body, id }, { onSuccess });
  }

  // A retro for the week was saved elsewhere since this opened: read it, then ask before replacing it.
  // Without a saved retro to replace, the 409 stays on screen so the press is never lost.
  async function replaceNewer() {
    const fresh = await refetch();

    if (!fresh?.existing) return;

    save.reset();
    await replace(fresh.existing.id);
  }

  function onSave() {
    setSaved(false);

    if (review.existing !== null) {
      void replace(review.existing.id);

      return;
    }

    save.mutate(
      { week, body, id: null },
      { onSuccess, onError: (error) => (isConflict(error) ? void replaceNewer() : undefined) },
    );
  }

  return (
    <View className="gap-6">
      {review.existing && (
        <View className="gap-1">
          <Text variant="muted">
            A retro for {week} is saved. Saving replaces it, after asking.
          </Text>
          <NavRow
            href={{
              pathname: "/notes/[type]/[id]",
              params: { type: "reflections", id: String(review.existing.id) },
            }}
            label="Open the saved retro"
          />
        </View>
      )}
      <Section title="The week">
        <WeeklyReviewDays days={review.days} />
      </Section>
      <PillarBars end={shiftDay(mondayOfWeek(week), 6)} />
      <WeekTargets end={shiftDay(mondayOfWeek(week), 6)} />
      <Section title="Retro">
        {!review.drafted && (
          <Text variant="muted">The AI draft failed; write it yourself below.</Text>
        )}
        <TextInput
          aria-label="Retro"
          className={`${INPUT_CLASS} min-h-80`}
          multiline
          rows={Platform.OS === "web" ? 16 : undefined}
          textAlignVertical="top"
          value={body}
          onChangeText={(text) => onType(text, text === review.draft)}
        />
        <Button disabled={!online || save.isPending || body.trim() === ""} onPress={onSave}>
          <Text>Save</Text>
        </Button>
        {!online && <Text variant="muted">Saving needs a connection.</Text>}
        {saved && <StatusText>Saved</StatusText>}
        {save.isError && (
          <StatusText tone="error" className="text-destructive">
            {isConflict(save.error) ? RETRO_CONFLICT : saveErrorMessage(save.error)}
          </StatusText>
        )}
      </Section>
    </View>
  );
}

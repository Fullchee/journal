import { minutesLabel } from "@/core";
import { Button, Text } from "@/ui";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useEffectEvent } from "react";

import { Screen } from "@/components/screen";
import { useImportDurations } from "@/lib/data/habits";
import { tileEntry } from "@/lib/widgets/habit-widgets";
import { clearTileSession } from "@/lib/widgets/tile-session";

/**
 * `/habit/<id>/duration?start=<ms>&end=<ms>`: the Android Quick Settings tile's stop. Logs the session as one
 * Duration entry, then lands on Today. An import skips an entry the Habit already has, so a replayed link adds
 * nothing. The tile keeps the session until the save succeeds; a failure offers a retry or a discard.
 */
export default function TileDurationLink() {
  const { id, start, end } = useLocalSearchParams<{ id: string; start?: string; end?: string }>();
  const startedAtMs = Number(start);
  const endedAtMs = Number(end);

  // A link typed or shared by hand can drop or blank the times; Today is the tile's landing either way.
  const isSession = startedAtMs > 0 && Number.isFinite(endedAtMs) && endedAtMs >= startedAtMs;

  if (!isSession) return <Redirect href="/" />;

  return <TileSave id={id} startedAtMs={startedAtMs} endedAtMs={endedAtMs} />;
}

function TileSave({
  id,
  startedAtMs,
  endedAtMs,
}: {
  id: string;
  startedAtMs: number;
  endedAtMs: number;
}) {
  const router = useRouter();
  const { habit, ...entry } = tileEntry(id, startedAtMs, endedAtMs);
  const { mutate, status } = useImportDurations();

  const save = () =>
    mutate({ habit, entries: [entry] }, { onSuccess: () => clearTileSession(startedAtMs) });

  const saveOnOpen = useEffectEvent(save);

  useEffect(() => saveOnOpen(), [id, startedAtMs, endedAtMs]);

  if (status === "success") return <Redirect href="/" />;

  const minutes = minutesLabel(entry.minutes);

  const discard = () => {
    clearTileSession(startedAtMs);
    router.replace("/");
  };

  return (
    <Screen>
      {status === "error" ? (
        <>
          <Text>{`Couldn't save ${minutes}.`}</Text>
          <Button className="self-start" onPress={save}>
            <Text>Try again</Text>
          </Button>
          <Button variant="outline" className="self-start" onPress={discard}>
            <Text>Discard</Text>
          </Button>
        </>
      ) : (
        <Text variant="muted">{`Saving ${minutes}…`}</Text>
      )}
    </Screen>
  );
}

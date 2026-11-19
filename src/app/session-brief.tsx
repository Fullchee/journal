import {
  briefMarkdown,
  briefRecordTitle,
  shiftDay,
  torontoDay,
  windowNote,
  type BriefBody,
} from "@/core";
import { Button, Text, cn, DateField } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";

import { NavRow } from "@/components/nav-row";
import { Screen } from "@/components/screen";
import { SessionBriefView } from "@/components/session-brief-view";
import { StatusText } from "@/components/status-text";
import { ApiError } from "@/lib/api/errors";
import { useIsOnline } from "@/lib/data/data-provider";
import { useCreateHealthRecord } from "@/lib/data/notes";
import { briefWindowQuery, sessionBriefQuery, type WindowBody } from "@/lib/data/session-brief";
import { SHARE_LABEL, shareText } from "@/lib/share-text";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default function SessionBrief() {
  const online = useIsOnline();
  const lastSession = useQuery(briefWindowQuery);

  return (
    <Screen>
      <Text variant="muted">
        Private. Nothing here is saved until you press Save as Health record; leaving the page
        clears it.
      </Text>
      {online && lastSession.isPending ? (
        <Text variant="muted">Finding your last session…</Text>
      ) : (
        <BriefForm
          lastSession={lastSession.data ?? null}
          lookupFailed={lastSession.isError}
          online={online}
        />
      )}
    </Screen>
  );
}

interface BriefFormProps {
  lastSession: WindowBody | null;
  lookupFailed: boolean;
  online: boolean;
}

function BriefForm({ lastSession, lookupFailed, online }: BriefFormProps) {
  const [now] = useState(() => new Date());
  const [start, setStart] = useState(() => lastSession?.start ?? shiftDay(torontoDay(now), -7));
  // The start date of the brief on screen: the default window on open, then the date of the last rewrite.
  const [asked, setAsked] = useState(start);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const brief = useQuery(sessionBriefQuery(asked));

  function write() {
    setShareNote(null);

    if (asked === start) void brief.refetch();
    else setAsked(start);
  }

  async function share(markdown: string) {
    try {
      setShareNote(await shareText(markdown));
    } catch {
      setShareNote("Couldn't share the brief.");
    }
  }

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="font-sans-bold">Since</Text>
        <View className="flex-row flex-wrap items-center gap-3">
          <DateField
            label="Since"
            value={start}
            max={lastSession?.today ?? torontoDay(now)}
            onChange={setStart}
          />
          <Button
            className="h-11"
            disabled={!online || brief.isFetching || !DAY.test(start)}
            onPress={write}
          >
            <Text>Rewrite brief</Text>
          </Button>
        </View>
        {lastSession && <WindowNote lastSession={lastSession} />}
        {lookupFailed && (
          <Text variant="muted">
            Couldn&apos;t look up your last session, so this covers the last 7 days.
          </Text>
        )}
        {!online && <Text variant="muted">Writing the brief needs a connection.</Text>}
        <BriefStatus isFetching={brief.isFetching} isError={brief.isError} />
      </View>

      {brief.data && !brief.isFetching && (
        <BriefResult brief={brief.data} online={online} shareNote={shareNote} onShare={share} />
      )}
    </View>
  );
}

function WindowNote({ lastSession }: { lastSession: WindowBody }) {
  const needsReconnect = lastSession.calendar === "not-connected";

  return (
    <Text
      role={needsReconnect ? "alert" : undefined}
      className={cn("text-sm", needsReconnect ? "text-destructive" : "text-muted-foreground")}
    >
      {windowNote(lastSession, lastSession.coach)}
    </Text>
  );
}

function BriefStatus({ isFetching, isError }: { isFetching: boolean; isError: boolean }) {
  if (isFetching) return <Text variant="muted">Writing the brief…</Text>;

  if (!isError) return null;

  return (
    <Text role="alert" className="text-destructive">
      Couldn&apos;t write the brief. Try again.
    </Text>
  );
}

interface BriefResultProps {
  brief: BriefBody;
  online: boolean;
  shareNote: string | null;
  onShare: (markdown: string) => Promise<void>;
}

function BriefResult({ brief, online, shareNote, onShare }: BriefResultProps) {
  const save = useCreateHealthRecord();
  const title = briefRecordTitle(brief);

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="h-11 self-start"
          onPress={() => onShare(briefMarkdown(brief))}
        >
          <Text>{SHARE_LABEL}</Text>
        </Button>
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={!online || save.isPending || save.isSuccess}
          onPress={() => save.mutate({ title, body: briefMarkdown(brief) })}
        >
          <Text>Save as Health record</Text>
        </Button>
        {shareNote !== null && <Text variant="muted">{shareNote}</Text>}
      </View>
      {save.isSuccess && (
        <View>
          <StatusText>Saved as the Health record “{title}”.</StatusText>
          <NavRow
            href={{
              pathname: "/notes/[type]/[id]",
              params: { type: "health-records", id: String(save.data.id) },
            }}
            label="Open the Health record"
          />
        </View>
      )}
      {save.isError && (
        <StatusText tone="error" className="text-destructive">
          {saveError(save.error, title)}
        </StatusText>
      )}
      <SessionBriefView brief={brief} />
    </View>
  );
}

const CONFLICT = 409;

function saveError(error: Error, title: string) {
  return error instanceof ApiError && error.status === CONFLICT
    ? `Couldn't save: a Health record named “${title}” exists.`
    : "Couldn't save the brief. Try again.";
}

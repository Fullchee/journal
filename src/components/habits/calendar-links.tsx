import type { CalendarLink, CalendarSeries } from "@/core";
import { Button, Text } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";

import { ChoiceRow } from "@/components/choice-row";
import { StatusText } from "@/components/status-text";
import { useIsOnline } from "@/lib/data/data-provider";
import {
  calendarLinksQuery,
  calendarSeriesQuery,
  useChangeLink,
  type LinkChange,
} from "@/lib/data/evening-review";

const DEFAULTS = [
  { value: true, label: "Assume done" },
  { value: false, label: "Ask" },
];

const seriesKey = (s: { calendarId: string; seriesId: string }) => `${s.calendarId}\n${s.seriesId}`;

function LinkedRow({
  link,
  canChange,
  onChange,
}: {
  link: CalendarLink;
  canChange: boolean;
  onChange: (change: LinkChange) => void;
}) {
  return (
    <View role="listitem" className="border-border gap-2 border-b pb-3">
      <Text>{link.summary}</Text>
      <ChoiceRow
        legend="When I don't review the day"
        choices={DEFAULTS}
        selected={link.assumeDone}
        onPick={(assumeDone) => {
          if (canChange) onChange({ type: "link", ...link, assumeDone });
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-11 self-start"
        disabled={!canChange}
        onPress={() =>
          onChange({ type: "unlink", calendarId: link.calendarId, seriesId: link.seriesId })
        }
      >
        <Text>Unlink</Text>
      </Button>
    </View>
  );
}

const FAILURE_TEXT = {
  "not-connected": "Google Calendar isn't connected. Run scripts/setup-google-calendar.sh.",
  unreachable: "Couldn't reach Google Calendar.",
} as const;

/** Recurring series not yet linked here, read from Google only while the picker is open. */
function SeriesPicker({
  habit,
  linked,
  onLink,
}: {
  habit: string;
  linked: Set<string>;
  onLink: (change: LinkChange) => void;
}) {
  const { data, isPending } = useQuery(calendarSeriesQuery);

  if (isPending) return <Text variant="muted">Loading your calendars…</Text>;

  const series = data?.series;

  if (series?.status !== "ok")
    return (
      <StatusText tone="error">
        {series === undefined ? "Couldn't load your calendars." : FAILURE_TEXT[series.status]}
      </StatusText>
    );

  const open = series.value.filter((s) => !linked.has(seriesKey(s)));

  if (open.length === 0)
    return <Text variant="muted">No other recurring events in the last 30 days.</Text>;

  const link = (s: CalendarSeries) =>
    onLink({
      type: "link",
      habit,
      calendarId: s.calendarId,
      seriesId: s.seriesId,
      summary: s.summary,
      assumeDone: false,
      ownCalendar: s.ownCalendar,
    });

  return (
    <View role="list" className="gap-2">
      {open.map((s) => (
        <Button
          key={seriesKey(s)}
          role="listitem"
          variant="outline"
          // oxlint-disable-next-line shadcn/no-restyle -- a long series name wraps, so the row grows past one line
          className="h-auto min-h-11 justify-start py-2"
          onPress={() => link(s)}
        >
          <Text>{`${s.summary} · ${s.calendarName} · ${String(s.count)}×`}</Text>
        </Button>
      ))}
    </View>
  );
}

/** A saved Habit's Calendar links: the series that feed its Evening review, and a picker to add one. */
export function CalendarLinks({ habit }: { habit: string }) {
  const isOnline = useIsOnline();
  const { data } = useQuery(calendarLinksQuery);
  const change = useChangeLink();
  const [picking, setPicking] = useState(false);
  const links = (data?.links ?? []).filter((link) => link.habit === habit);
  const canChange = isOnline && !change.isPending;

  return (
    <View className="border-border gap-3 border-t pt-4">
      <Text aria-level={2} variant="headline">
        Calendar
      </Text>
      {links.length === 0 ? (
        <Text variant="muted">Not linked to any calendar event.</Text>
      ) : (
        <View role="list" className="gap-3">
          {links.map((link) => (
            <LinkedRow
              key={seriesKey(link)}
              link={link}
              canChange={canChange}
              onChange={(c) => change.mutate(c)}
            />
          ))}
        </View>
      )}
      {picking ? (
        <SeriesPicker
          habit={habit}
          linked={new Set(links.map((link) => seriesKey(link)))}
          onLink={(c) => change.mutate(c, { onSuccess: () => setPicking(false) })}
        />
      ) : (
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={!isOnline}
          onPress={() => setPicking(true)}
        >
          <Text>Link a recurring event</Text>
        </Button>
      )}
      {change.isError && <StatusText tone="error">Couldn't save the link. Try again.</StatusText>}
    </View>
  );
}

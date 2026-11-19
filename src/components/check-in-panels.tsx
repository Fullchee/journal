import {
  hasNextDay,
  torontoDay,
  periodLabel,
  periodStep,
  shiftPeriod,
  type CheckIn,
  type Days,
  formatDay,
  TIME_ZONE,
} from "@/core";
import { Button, Icon, Text } from "@/ui";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { useCheckInSearch } from "@/lib/data/check-ins";
import { useIsOnline } from "@/lib/data/data-provider";

/** `before` names the period each trend compares with; "Day" and "All" have none. */
export interface Range {
  label: string;
  days: Days;
  before?: string;
}

export const DAY: Range = { label: "Day", days: "day" };
export const MONTH: Range = { label: "Month", days: 30, before: "the month before" };
export const ALL: Range = { label: "All", days: "all" };

const RANGES: Range[] = [
  DAY,
  { label: "Week", days: 7, before: "the week before" },
  MONTH,
  { label: "3 months", days: 90, before: "the 3 months before" },
  { label: "Year", days: 365, before: "the year before" },
  ALL,
];

const dayLabel = (day: string) =>
  formatDay(day, { weekday: "long", month: "short", day: "numeric" });

/**
 * The period on screen: "Week" stops being true once the arrows step back, so a past period names its dates.
 */
export function periodName(range: Range, end: string) {
  if (range.days === "all" || !hasNextDay(end)) return range.label.toLowerCase();

  return range.days === "day" ? dayLabel(end) : periodLabel(end, range.days);
}

interface RangePickerProps {
  range: Range;
  /** The last day of the period the arrows have stepped to. */
  end: string;
  onRange: (range: Range) => void;
  onEnd: (end: string) => void;
}

export function RangePicker({ range, end, onRange, onEnd }: RangePickerProps) {
  const { days } = range;

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2" role="radiogroup" aria-label="Range">
        {RANGES.map((r) => (
          <Button
            key={r.label}
            size="sm"
            className="min-h-12"
            variant={r === range ? "default" : "outline"}
            role="radio"
            aria-checked={r === range}
            // A new range starts on the current today, even if the app stayed open overnight.
            onPress={() => {
              onRange(r);
              onEnd(torontoDay(new Date()));
            }}
          >
            <Text>{r.label}</Text>
          </Button>
        ))}
      </View>
      {days !== "all" && (
        <View className="flex-row items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="min-h-12 min-w-12"
            accessibilityLabel={`Previous ${days === "day" ? "day" : "period"}`}
            onPress={() => onEnd(shiftPeriod(end, -periodStep(days)))}
          >
            <Icon as={ChevronLeft} />
          </Button>
          <Text className="flex-1 text-center" aria-live="polite">
            {days === "day" ? dayLabel(end) : periodLabel(end, days)}
          </Text>
          <Button
            variant="outline"
            size="icon"
            className="min-h-12 min-w-12"
            accessibilityLabel={`Next ${days === "day" ? "day" : "period"}`}
            disabled={!hasNextDay(end)}
            onPress={() => onEnd(shiftPeriod(end, periodStep(days)))}
          >
            <Icon as={ChevronRight} />
          </Button>
        </View>
      )}
    </View>
  );
}

interface SignalRow {
  label: string;
  value: string;
  trend: string;
}

/** A Signal is shown only when it has data in the period. */
export function SignalSummary({ title, rows }: { title: string; rows: SignalRow[] }) {
  return (
    <View className="gap-1">
      <Text aria-level={2} variant="title">
        {title}
      </Text>
      {rows.map((row) => (
        <Text key={row.label}>
          <Text variant="muted">{row.label} </Text>
          {row.value}
          {row.trend === "" ? null : <Text variant="muted">, {row.trend}</Text>}
        </Text>
      ))}
    </View>
  );
}

const dateOf = (c: CheckIn) =>
  new Date(c.checkedInAt).toLocaleDateString("en-US", { timeZone: TIME_ZONE });

/** Online only: the server searches every Check-in's text. A found Check-in opens in the list. */
export function CheckInSearch({ onOpen }: { onOpen: (checkIn: CheckIn) => void }) {
  const isOnline = useIsOnline();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const { data: found } = useCheckInSearch(query);
  const search = () => setQuery(text.trim());

  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <TextInput
          className="border-input bg-background text-foreground min-h-11 flex-1 rounded-md border px-3 font-sans text-base"
          accessibilityLabel="Search Check-ins"
          placeholder="Search Check-ins"
          placeholderTextColorClassName="accent-muted-foreground"
          editable={isOnline}
          value={text}
          onChangeText={setText}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <Button className="min-h-12" disabled={!isOnline} onPress={search}>
          <Text>Search</Text>
        </Button>
      </View>
      {!isOnline && <Text variant="muted">Search needs a connection.</Text>}
      {query !== "" && found && (
        <View className="gap-1">
          <Text aria-level={2} variant="title">
            Check-ins found ({found.length})
          </Text>
          {found.map((c) => {
            const said = c.note === "" ? c.thought : c.note;

            return (
              <Pressable
                key={c.id}
                role="button"
                aria-label={`Open Check-in, ${dateOf(c)}, ${c.zone}`}
                onPress={() => onOpen(c)}
                className="active:bg-accent min-h-12 justify-center py-2"
              >
                <Text className="text-sm">
                  {dateOf(c)} · {c.zone}
                  {said === "" ? "" : ` · ${said}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

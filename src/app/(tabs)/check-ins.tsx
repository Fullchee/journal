import {
  activityRows,
  chartData,
  checkInsWithin,
  checkInWindow,
  torontoDay,
  pagesFor,
  signalPeriods,
  sleepRows,
  sleepSummary,
  workoutRows,
  isoAt,
  type CheckIn,
} from "@/core";
import { sleepZoneRows } from "@/core/sleep-zones";
import { Button, CheckInChart, Text } from "@/ui";
import { Link } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, View, type HostInstance, type ScrollViewInstance } from "react-native";

import { CheckInList } from "@/components/check-in-list";
import {
  ALL,
  CheckInSearch,
  DAY,
  MONTH,
  RangePicker,
  SignalSummary,
  periodName,
  type Range,
} from "@/components/check-in-panels";
import { useIsWide } from "@/hooks/use-is-wide";
import {
  checkInKey,
  useActivity,
  useCheckInParts,
  useCheckInPlaces,
  useCheckIns,
  useSleep,
  useUpdateCheckIn,
  useWorkouts,
  type ShownCheckIn,
} from "@/lib/data/check-ins";
import { useHabitNames } from "@/lib/data/habits";

// The chart opens on the last month, as journal's page does.
const DEFAULT_RANGE = MONTH;

function SessionBriefLink() {
  return (
    <Link href="/session-brief" asChild>
      <Button variant="ghost" size="sm" className="mr-2">
        <Text>Write Session brief</Text>
      </Button>
    </Link>
  );
}

interface NoCheckInsProps {
  /** What the range lacks, e.g. "No Check-ins". */
  subject: string;
  isAll: boolean;
  onShowAll: () => void;
}

// An empty range is usually a narrow one, so the next step widens it; with nothing at all, the owner checks in on Today.
function NoCheckIns({ subject, isAll, onShowAll }: NoCheckInsProps) {
  if (!isAll) {
    return (
      <View className="items-start gap-2">
        <Text variant="muted">{subject} in this range.</Text>
        <Button variant="outline" className="min-h-12" onPress={onShowAll}>
          <Text>Show all</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="items-start gap-2">
      <Text variant="muted">{subject} yet.</Text>
      <Link href="/" asChild>
        <Button variant="outline" className="min-h-12">
          <Text>Check in on Today</Text>
        </Button>
      </Link>
    </View>
  );
}

type Key = number | string;

export default function CheckInsScreen() {
  const isWide = useIsWide();
  const { data } = useCheckIns();
  const { data: sleep = [] } = useSleep();

  const [range, setRange] = useState(DEFAULT_RANGE);
  const [end, setEnd] = useState(() => torontoDay(new Date()));
  const [pages, setPages] = useState(1);
  const [selectedKey, setSelectedKey] = useState<Key>();
  const { scrollRef, listRef, listTopRef, cardRef } = useScrollToCard(selectedKey, pages);

  const checkIns = data?.checkIns ?? [];
  // "All" ends today; any other range ends on the day the arrows stepped to.
  // eslint-disable-next-line eslint-react/purity -- "All" ends at this moment, so each render reads the clock
  const rangeEnd = range.days === "all" ? new Date() : new Date(isoAt(end));
  const chart = chartData(checkIns, range.days, rangeEnd, sleep);
  const inRange = checkInsWithin(checkIns, range.days, rangeEnd);

  const select = (c: ShownCheckIn) => {
    setSelectedKey(checkInKey(c));
    setPages((p) => Math.max(p, pagesFor(inRange, c)));
  };

  // A found Check-in may sit outside the range, so its own Day opens with it picked.
  const openFound = (c: CheckIn) => {
    setRange(DAY);
    setEnd(torontoDay(new Date(c.checkedInAt)));
    setPages(1);
    setSelectedKey(c.id);
  };

  const noCheckIns = (subject: string) => (
    <NoCheckIns
      subject={subject}
      isAll={range === ALL}
      onShowAll={() => {
        setRange(ALL);
        setPages(1);
      }}
    />
  );

  const overview = (
    <>
      <RangePicker
        range={range}
        end={end}
        onRange={(r) => {
          setRange(r);
          setPages(1);
        }}
        onEnd={setEnd}
      />
      <View className="border-border bg-card rounded-md border p-4">
        <CheckInChart data={chart} empty={noCheckIns("No Check-ins or sleep")} onSelect={select} />
      </View>
      <SignalSummaries range={range} end={end} chart={chart} inRange={inRange} />
      <CheckInSearch onOpen={openFound} />
    </>
  );

  const list = (
    <View
      ref={listRef}
      className="gap-3"
      onLayout={(e) => (listTopRef.current = e.nativeEvent.layout.y)}
    >
      <CheckInsList
        inRange={inRange}
        pages={pages}
        loaded={data !== undefined}
        selectedKey={selectedKey}
        cardRef={cardRef}
        empty={noCheckIns("No Check-ins")}
        onShowOlder={() => setPages(pages + 1)}
      />
    </View>
  );

  return (
    <>
      <Tabs.Screen options={{ headerRight: SessionBriefLink }} />
      {isWide ? (
        <View className="bg-background flex-1 flex-row">
          <ScrollView className="flex-1" contentContainerClassName="gap-6 p-4">
            {overview}
          </ScrollView>
          <ScrollView
            ref={scrollRef}
            className="border-border flex-1 border-l"
            contentContainerClassName="p-4"
          >
            {list}
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          className="bg-background flex-1"
          contentContainerClassName="w-full max-w-2xl gap-6 self-center p-4"
        >
          {overview}
          {list}
        </ScrollView>
      )}
    </>
  );
}

// Scrolls once the picked card has rendered, which may take "Show older" pages first.
function useScrollToCard(selectedKey: Key | undefined, pages: number) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const listRef = useRef<HostInstance>(null);
  // Where the list starts inside the scrolled content, below the chart on a phone.
  const listTopRef = useRef(0);
  const cardsRef = useRef(new Map<Key, HostInstance>());

  useEffect(() => {
    const card = selectedKey === undefined ? undefined : cardsRef.current.get(selectedKey);
    const list = listRef.current;

    if (card && list) {
      card.measureLayout(list, (_x, y) =>
        scrollRef.current?.scrollTo({ y: listTopRef.current + y, animated: true }),
      );
    }
  }, [selectedKey, pages]);

  const cardRef = (key: Key, view: HostInstance | null) => {
    if (view) cardsRef.current.set(key, view);
    else cardsRef.current.delete(key);
  };

  return { scrollRef, listRef, listTopRef, cardRef };
}

interface SignalSummariesProps {
  range: Range;
  end: string;
  chart: ReturnType<typeof chartData>;
  inRange: ShownCheckIn[];
}

function SignalSummaries({ range, end, chart, inRange }: SignalSummariesProps) {
  const { data: sleep = [] } = useSleep();
  const { data: activity = [] } = useActivity();
  const { data: workouts = [] } = useWorkouts();
  const nights = signalPeriods(sleep, range.days, chart);
  const sleepShown = sleepSummary(nights.current, nights.previous);
  const activityDays = signalPeriods(activity, range.days, chart);
  const before = range.before ?? "";
  const activityShown = activityRows(activityDays.current, activityDays.previous, before);
  const workoutsDone = signalPeriods(workouts, range.days, chart).current;
  const period = periodName(range, end);
  // A Day's Check-ins share one night, so the Day range never fills two buckets and hides the card.
  const zoneRows = sleepZoneRows(inRange, sleep);

  return (
    <>
      {sleepShown && (
        <SignalSummary
          title={`Sleep, ${period} (${nights.current.length} nights)`}
          rows={sleepRows(sleepShown, before)}
        />
      )}
      {zoneRows.length > 0 && (
        <SignalSummary
          title={`Sleep and the next day, ${period} (${inRange.length} Check-ins)`}
          rows={zoneRows}
        />
      )}
      {activityShown.length > 0 && (
        <SignalSummary
          title={`Activity, ${period} (${activityDays.current.length} days)`}
          rows={activityShown}
        />
      )}
      {workoutsDone.length > 0 && (
        <SignalSummary
          title={`Workouts, ${period} (${workoutsDone.length})`}
          rows={workoutRows(workoutsDone)}
        />
      )}
    </>
  );
}

interface CheckInsListProps {
  inRange: ShownCheckIn[];
  pages: number;
  loaded: boolean;
  selectedKey: Key | undefined;
  cardRef: (key: Key, view: HostInstance | null) => void;
  /** Shown in place of the list when the range holds no Check-ins. */
  empty: ReactNode;
  onShowOlder: () => void;
}

function CheckInsList({
  inRange,
  pages,
  loaded,
  selectedKey,
  cardRef,
  empty,
  onShowOlder,
}: CheckInsListProps) {
  const places = useCheckInPlaces();
  const habitNames = useHabitNames();
  const partNames = useCheckInParts();
  const update = useUpdateCheckIn();
  const listed = checkInWindow(inRange, pages);

  return (
    <>
      <Text aria-level={2} variant="headline">
        Check-ins ({listed.shown.length}
        {listed.hasOlder ? ` of ${inRange.length}` : ""})
      </Text>
      {!loaded && <Text variant="muted">Loading Check-ins…</Text>}
      {loaded && listed.shown.length === 0 && empty}
      {loaded && listed.shown.length > 0 && (
        <CheckInList
          checkIns={listed.shown}
          places={places}
          habitNames={habitNames}
          partNames={partNames}
          selectedKey={selectedKey}
          onEdit={(c, patch) => update(checkInKey(c), patch)}
          cardRef={cardRef}
        />
      )}
      {listed.hasOlder && (
        <Button variant="outline" onPress={onShowOlder}>
          <Text>Show older</Text>
        </Button>
      )}
    </>
  );
}

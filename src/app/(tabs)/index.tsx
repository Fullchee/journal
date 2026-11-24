import {
  currentStreakLabel,
  fixHolds,
  freezesLabel,
  ZONES,
  type Position,
  type Streak,
  type Zone,
  TIME_ZONE,
} from "@/core";
import { Button, CheckInCard, PlanNext, Text } from "@/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, View } from "react-native";

import { CelebrationSpot, useCelebrate } from "@/components/celebration";
import { ConnectionsTodaySection } from "@/components/connections-today-section";
import { LogComposer } from "@/components/log-composer";
import { newPartButton } from "@/components/new-part-button";
import { Section } from "@/components/screen";
import { EveningReviewRow } from "@/components/today/evening-review-row";
import { HabitsDueToday } from "@/components/today/habits-due-today";
import { WorkAnchor } from "@/components/today/work-anchor";
import { useIsWide } from "@/hooks/use-is-wide";
import { useLogDraft } from "@/hooks/use-log-draft";
import { dismissCapture, retryCapture, useFailedCaptures } from "@/lib/data/captures";
import {
  guessPlace,
  useCheckInParts,
  useCheckInPlaces,
  useCreateCheckIn,
  useUpdateCheckIn,
} from "@/lib/data/check-ins";
import { useIsOnline } from "@/lib/data/data-provider";
import { useHabitNames } from "@/lib/data/habits";
import { usePlanNext } from "@/lib/data/plan";
import { useCheckInStreak } from "@/lib/data/streaks";
import { currentPosition } from "@/lib/location/current-position";

const todayTitle = () =>
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  });

// Widgets and shortcuts link to `?zone=<Zone>` and `?log`; each acts once, then drops so a reload doesn't repeat it.
// The hook's router works during a deep link's first render; the imperative one isn't bound yet.
// `setParams` is this screen's; the router's targets the root route, not the tab.
function useDeepLinkParams() {
  const { zone, log } = useLocalSearchParams<{ zone?: string; log?: string }>();
  const { push } = useRouter();

  const { setParams } = useNavigation<{
    setParams: (params: Partial<Record<"zone" | "log", undefined>>) => void;
  }>();

  // `param` is the `?zone` last seen, so each widget tap counts once; `at` remounts the Check-in card to mark it again.
  const [asked, setAsked] = useState<{
    param?: string | undefined;
    zone?: Zone | undefined;
    at: number;
  }>({ at: 0 });

  if (zone !== asked.param) {
    setAsked(
      zone === undefined
        ? { ...asked, param: zone }
        : { param: zone, zone: ZONES.find((z) => z === zone), at: asked.at + 1 },
    );
  }

  useEffect(() => {
    if (zone !== undefined) setParams({ zone: undefined });
  }, [zone, setParams]);

  useEffect(() => {
    if (log === undefined) return;
    setParams({ log: undefined });
    push("/log");
  }, [log, setParams, push]);

  return asked;
}

/**
 * Saves the phone's position on each new Check-in and lends it to that Check-in's Place guess.
 * The card guesses right after each new Check-in, so the guess reads the position that Check-in got.
 */
function useCheckInPosition() {
  const updateCheckIn = useUpdateCheckIn();
  const positionRef = useRef<Promise<Position | null>>(Promise.resolve(null));

  // A position says where the owner is now, so a Check-in set further back gets none.
  const savePosition = (id: string, checkedInAt: string) => {
    positionRef.current = fixHolds(new Date().toISOString(), checkedInAt)
      ? currentPosition()
      : Promise.resolve(null);
    void positionRef.current.then((position) => {
      if (position) updateCheckIn(id, { ...position, fixedAt: new Date().toISOString() });
    });
  };

  const guessNear = async (at: string) => guessPlace(at, await positionRef.current);

  return { updateCheckIn, savePosition, guessNear };
}

// A Streak of 0 reads as a loss, so Today shows the line only while one runs.
const checkInStreakLine = (streak: Streak | null) =>
  streak !== null && streak.current > 0
    ? `Check-in Streak: ${currentStreakLabel(streak)} · ${freezesLabel(streak)}`
    : undefined;

function CheckInSection({ zone }: { zone?: Zone | undefined }) {
  const isOnline = useIsOnline();
  const { open } = useLogDraft();
  const createCheckIn = useCreateCheckIn();
  const { updateCheckIn, savePosition, guessNear } = useCheckInPosition();
  const { celebrate } = useCelebrate();
  // eslint-disable-next-line eslint-react/purity -- the Streak counts up to today, so each render reads the clock
  const streak = useCheckInStreak(new Date());

  // Every new Check-in, queued offline or not, earns a celebration; edits go through onUpdate and don't.
  const checkIn = (score: number, checkedInAt: string) => {
    const id = createCheckIn(score, checkedInAt);

    savePosition(id, checkedInAt);
    celebrate({ kind: "check-in", target: "check-in" });

    return id;
  };

  return (
    <CelebrationSpot target="check-in" holdsBig>
      <CheckInCard
        places={useCheckInPlaces()}
        habitNames={useHabitNames()}
        partNames={useCheckInParts()}
        newPart={isOnline ? newPartButton : undefined}
        onCheckIn={checkIn}
        onUpdate={updateCheckIn}
        onDoingSent={(text, span) => {
          if (isOnline) void open(text, span);
        }}
        {...(isOnline ? { guessPlace: guessNear } : {})}
        {...(zone === undefined ? {} : { zone })}
        offline={!isOnline}
        streak={checkInStreakLine(streak)}
      />
    </CelebrationSpot>
  );
}

/** Captures that failed to save, each kept until the owner retries or dismisses it. */
function FailedCaptures() {
  const client = useQueryClient();
  const failed = useFailedCaptures();

  if (failed.length === 0) return null;

  return (
    <View testID="failed-captures" className="border-border bg-card gap-3 rounded-md border p-4">
      {failed.map(({ id, message }) => (
        <View key={id} className="gap-2">
          <Text>{message}</Text>
          <View className="flex-row flex-wrap gap-2">
            <Button
              size="sm"
              className="min-h-12"
              accessibilityLabel={`Retry: ${message}`}
              onPress={() => retryCapture(client, id)}
            >
              <Text>Retry</Text>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-12"
              accessibilityLabel={`Dismiss: ${message}`}
              onPress={() => dismissCapture(client, id)}
            >
              <Text>Dismiss</Text>
            </Button>
          </View>
        </View>
      ))}
    </View>
  );
}

function PlanSection() {
  const isOnline = useIsOnline();
  const { push } = useRouter();

  return (
    <Section title="Plan the day">
      <PlanNext {...usePlanNext()} offline={!isOnline} onOpenPlan={() => push("/plan")} />
    </Section>
  );
}

function Column({ testID, children }: { testID: string; children: ReactNode }) {
  return (
    <View testID={testID} className="flex-1 gap-6">
      {children}
    </View>
  );
}

/** Every daily capture shares this one screen, so none needs navigation. */
export default function TodayScreen() {
  const asked = useDeepLinkParams();
  const isWide = useIsWide();
  const client = useQueryClient();
  const headerHeight = useHeaderHeight();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    // Active queries are the ones on screen: every Today section, plus any tab already opened.
    await client.refetchQueries({ type: "active" });
    setRefreshing(false);
  };

  const left = [
    <CheckInSection key={`check-in-${asked.at}`} zone={asked.zone} />,
    <WorkAnchor key="anchor" />,
    <HabitsDueToday key="habits" />,
    <EveningReviewRow key="evening-review" />,
  ];

  const right = [<ConnectionsTodaySection key="connections" />, <PlanSection key="plan" />];

  return (
    <View className="bg-background flex-1">
      <Tabs.Screen options={{ headerTitle: todayTitle() }} />
      {/* Edge-to-edge Android no longer resizes for the keyboard, so padding keeps the composer above it.
          The view measures itself from below the header, so the offset adds the header back. */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        className="flex-1"
        testID="today-keyboard-avoider"
      >
        <ScrollView
          testID="today-scroll"
          className="flex-1"
          contentContainerClassName="w-full max-w-5xl gap-6 self-center p-4"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          keyboardShouldPersistTaps="handled"
        >
          <FailedCaptures />
          {isWide ? (
            <View className="flex-row items-start gap-8">
              <Column testID="today-left">{left}</Column>
              <Column testID="today-right">{right}</Column>
            </View>
          ) : (
            [...left, ...right]
          )}
        </ScrollView>
        <LogComposer />
      </KeyboardAvoidingView>
    </View>
  );
}

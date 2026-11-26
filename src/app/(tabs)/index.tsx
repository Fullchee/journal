import { fixHolds, ZONES, type Position, type Zone } from "@/core";
import { Button, CheckInCard, Text } from "@/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, View } from "react-native";

import { CelebrationSpot, useCelebrate } from "@/components/celebration";
import { LogComposer } from "@/components/log-composer";
import { newPartButton } from "@/components/new-part-button";
import { useLogDraft } from "@/hooks/use-log-draft";
import { useRefresh } from "@/hooks/use-refresh";
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
import { currentPosition } from "@/lib/location/current-position";

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

function CheckInSection({ zone }: { zone?: Zone | undefined }) {
  const isOnline = useIsOnline();
  const { open } = useLogDraft();
  const createCheckIn = useCreateCheckIn();
  const { updateCheckIn, savePosition, guessNear } = useCheckInPosition();
  const { celebrate } = useCelebrate();

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

/** The home tab: a Check-in now or at a time picked, with the Log box below. */
export default function CheckInScreen() {
  const asked = useDeepLinkParams();
  const headerHeight = useHeaderHeight();
  const { refreshing, refresh } = useRefresh();

  return (
    <View className="bg-background flex-1">
      {/* Edge-to-edge Android no longer resizes for the keyboard, so padding keeps the composer above it.
          The view measures itself from below the header, so the offset adds the header back. */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        className="flex-1"
        testID="check-in-keyboard-avoider"
      >
        <ScrollView
          testID="check-in-scroll"
          className="flex-1"
          contentContainerClassName="w-full max-w-2xl gap-6 self-center p-4"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          keyboardShouldPersistTaps="handled"
        >
          <FailedCaptures />
          <CheckInSection key={`check-in-${asked.at}`} zone={asked.zone} />
        </ScrollView>
        <LogComposer />
      </KeyboardAvoidingView>
    </View>
  );
}

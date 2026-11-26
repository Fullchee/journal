import { TIME_ZONE } from "@/core";
import { PlanNext } from "@/ui";
import { useRouter } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { ConnectionsTodaySection } from "@/components/connections-today-section";
import { Section } from "@/components/screen";
import { EveningReviewRow } from "@/components/today/evening-review-row";
import { HabitsDueToday } from "@/components/today/habits-due-today";
import { WorkAnchor } from "@/components/today/work-anchor";
import { useIsWide } from "@/hooks/use-is-wide";
import { useRefresh } from "@/hooks/use-refresh";
import { useIsOnline } from "@/lib/data/data-provider";
import { usePlanNext } from "@/lib/data/plan";

const todayTitle = () =>
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  });

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

/** The Day's to-dos: the Habits due, then the Work Anchor, Evening review, Connections and plan. */
export default function TodayScreen() {
  const isWide = useIsWide();
  const { refreshing, refresh } = useRefresh();

  const left = [
    <HabitsDueToday key="habits" />,
    <WorkAnchor key="anchor" />,
    <EveningReviewRow key="evening-review" />,
  ];

  const right = [<ConnectionsTodaySection key="connections" />, <PlanSection key="plan" />];

  return (
    <View className="bg-background flex-1">
      <Tabs.Screen options={{ headerTitle: todayTitle() }} />
      <ScrollView
        testID="today-scroll"
        className="flex-1"
        contentContainerClassName="w-full max-w-5xl gap-6 self-center p-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {isWide ? (
          <View className="flex-row items-start gap-8">
            <Column testID="today-left">{left}</Column>
            <Column testID="today-right">{right}</Column>
          </View>
        ) : (
          [...left, ...right]
        )}
      </ScrollView>
    </View>
  );
}

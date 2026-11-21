import { Tabs } from "expo-router/js-tabs";
import {
  BookOpen,
  CalendarCheck,
  CloudSun,
  Sprout,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

import { StreakMilestones } from "@/components/streak-milestones";
import { TAB_BAR_HEIGHT, TAB_LABEL_MAX_SCALE } from "@/components/tab-bar";
import { useIsWide } from "@/hooks/use-is-wide";
import type { FontFace } from "@/lib/fonts";

const tabIcon = (Icon: LucideIcon) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon color={color} size={size} />;
  };

const BAR = {
  // The default 49dp bar fits only a 10px label under the icon, so the bar grows to fit a legible one.
  phone: (bottomInset: number) =>
    ({
      tabBarPosition: "bottom",
      tabBarLabelPosition: "below-icon",
      tabBarStyle: { height: TAB_BAR_HEIGHT + bottomInset },
    }) as const,
  // Equal-width tabs spread five labels across a desktop window; a top bar sizes each tab to its label.
  wide: () =>
    ({
      tabBarPosition: "top",
      tabBarLabelPosition: "beside-icon",
      tabBarItemStyle: { maxWidth: 144 },
    }) as const,
};

// Small caps label the controls, at 13px rather than the tab bar's 10px default so they stay legible.
const tabLabel = {
  fontFamily: "AlegreyaSansSC_500Medium",
  fontSize: 13,
  lineHeight: 16,
} as const satisfies {
  fontFamily: FontFace;
  fontSize: number;
  lineHeight: number;
};

const besideIcon = { marginStart: 6 } as const;

interface TabLabelProps {
  color: ColorValue;
  position: "beside-icon" | "below-icon";
  children: string;
}

function TabLabel({ color, position, children }: TabLabelProps) {
  return (
    <Text
      maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
      numberOfLines={1}
      // oxlint-disable-next-line shadcn/no-inline-styles -- React Navigation passes the tab's tint color
      style={[tabLabel, { color }, position === "beside-icon" && besideIcon]}
    >
      {children}
    </Text>
  );
}

/** Five tabs is Android's maximum, so nothing hides behind a More sheet. */
export default function TabsLayout() {
  const isWide = useIsWide();
  const { bottom } = useSafeAreaInsets();
  // Leaf green marks the open tab; graphite, not faded ink, keeps the others readable.
  const active = String(useCSSVariable("--color-primary"));
  const inactive = String(useCSSVariable("--color-muted-foreground"));

  return (
    // Past 1024px the app keeps a page width, so the tab bar, headers and panes share one set of edges.
    <View className="bg-muted flex-1 lg:items-center">
      <View className="lg:border-border w-full max-w-5xl flex-1 lg:border-x">
        <Tabs
          screenOptions={{
            ...BAR[isWide ? "wide" : "phone"](bottom),
            tabBarLabel: TabLabel,
            tabBarActiveTintColor: active,
            tabBarInactiveTintColor: inactive,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{ title: "Today", tabBarIcon: tabIcon(CalendarCheck) }}
          />
          <Tabs.Screen name="habits" options={{ title: "Habits", tabBarIcon: tabIcon(Sprout) }} />
          <Tabs.Screen
            name="check-ins"
            options={{ title: "Check-ins", tabBarIcon: tabIcon(CloudSun) }}
          />
          <Tabs.Screen
            name="connections"
            options={{ title: "Connections", headerShown: false, tabBarIcon: tabIcon(Users) }}
          />
          <Tabs.Screen
            name="(notes)"
            options={{
              title: "Notes",
              headerShown: false,
              href: "/notes",
              tabBarIcon: tabIcon(BookOpen),
            }}
          />
        </Tabs>
        <StreakMilestones />
      </View>
    </View>
  );
}

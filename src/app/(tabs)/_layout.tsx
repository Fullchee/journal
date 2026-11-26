import { Tabs } from "expo-router/js-tabs";
import { CalendarCheck, CloudSun, type LucideIcon } from "lucide-react-native";
import { Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

import { SidebarButton, SidebarLayout } from "@/components/sidebar";
import { StreakMilestones } from "@/components/streak-milestones";
import { TAB_BAR_HEIGHT, TAB_LABEL_MAX_SCALE } from "@/components/tab-bar";
import { useIsWide } from "@/hooks/use-is-wide";
import type { FontFace } from "@/lib/fonts";

const tabIcon = (Icon: LucideIcon) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon color={color} size={size} />;
  };

// The default 49dp bar fits only a 10px label under the icon, so the bar grows to fit a legible one.
// From 768px the sidebar lists every page, so the tab bar hides.
const tabBarStyle = (isWide: boolean, bottomInset: number) =>
  isWide ? ({ display: "none" } as const) : { height: TAB_BAR_HEIGHT + bottomInset };

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

interface TabLabelProps {
  color: ColorValue;
  children: string;
}

function TabLabel({ color, children }: TabLabelProps) {
  return (
    <Text
      maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
      numberOfLines={1}
      // oxlint-disable-next-line shadcn/no-inline-styles -- React Navigation passes the tab's tint color
      style={[tabLabel, { color }]}
    >
      {children}
    </Text>
  );
}

const IN_SIDEBAR = { tabBarItemStyle: { display: "none" } } as const;

/** Two tabs, Check-in and Today; the sidebar holds every page. */
export default function TabsLayout() {
  const isWide = useIsWide();
  const { bottom } = useSafeAreaInsets();
  // Leaf green marks the open tab; graphite, not faded ink, keeps the others readable.
  const active = String(useCSSVariable("--color-primary"));
  const inactive = String(useCSSVariable("--color-muted-foreground"));

  return (
    // Past 1024px the app keeps a page width, so the sidebar, headers and panes share one set of edges.
    <View className="bg-muted flex-1 lg:items-center">
      <View className="lg:border-border w-full max-w-5xl flex-1 lg:border-x">
        <SidebarLayout>
          <Tabs
            screenOptions={{
              tabBarPosition: "bottom",
              tabBarLabelPosition: "below-icon",
              tabBarStyle: tabBarStyle(isWide, bottom),
              tabBarLabel: TabLabel,
              tabBarActiveTintColor: active,
              tabBarInactiveTintColor: inactive,
              headerLeft: SidebarButton,
            }}
          >
            <Tabs.Screen
              name="index"
              options={{ title: "Check-in", tabBarIcon: tabIcon(CloudSun) }}
            />
            <Tabs.Screen
              name="today"
              options={{ title: "Today", tabBarIcon: tabIcon(CalendarCheck) }}
            />
            {/* The sidebar reaches the rest. SDK 58's `href: null` redirects away from a tab, so only its button hides. */}
            <Tabs.Screen name="habits" options={{ title: "Habits", ...IN_SIDEBAR }} />
            <Tabs.Screen name="check-ins" options={{ title: "Check-ins", ...IN_SIDEBAR }} />
            <Tabs.Screen name="connections" options={{ headerShown: false, ...IN_SIDEBAR }} />
            <Tabs.Screen name="(notes)" options={{ headerShown: false, ...IN_SIDEBAR }} />
          </Tabs>
        </SidebarLayout>
        <StreakMilestones />
      </View>
    </View>
  );
}

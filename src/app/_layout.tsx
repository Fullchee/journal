import "@/lib/array-copy-methods";
import "@/global.css";

import { Button, MarkdownImageSourceProvider, OfflineBar, Text, Toaster } from "@/ui";
import * as Sentry from "@sentry/react-native";
import { useFonts } from "expo-font";
import { router, Stack, ThemeProvider, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";

import { CelebrationProvider } from "@/components/celebration";
import { TAB_BAR_HEIGHT } from "@/components/tab-bar";
import { useIsWide } from "@/hooks/use-is-wide";
import { useNavigationTheme } from "@/hooks/use-navigation-theme";
import { resolveImageSource } from "@/lib/api/image-source";
import { useAlarmActions } from "@/lib/alarms/alarm-actions";
import { useAlarmSchedule } from "@/lib/alarms/use-alarm-schedule";
import { useAuth } from "@/lib/auth/auth-provider";
import { useCheckInPrompt } from "@/lib/check-in-prompt/use-check-in-prompt";
import { DataProvider, useIsOnline } from "@/lib/data/data-provider";
import { useCalmAutoLog } from "@/lib/health/calm-auto-log";
import { useFitbitAutoLog } from "@/lib/health/fitbit-auto-log";
import { FONTS } from "@/lib/fonts";
import { initSentry } from "@/lib/sentry";
import { useHabitWidgets } from "@/lib/widgets/use-habit-widgets";

// Before the first render, so errors and the app start trace from boot are captured.
initSentry();

// The stored session and the fonts take a moment to load; the splash covers them so nothing flashes.
void SplashScreen.preventAutoHideAsync();

/** A deep link or launcher shortcut straight to /log or /plan still has the tabs to go back to. */
export const unstable_settings = { anchor: "(tabs)" };

// On web, modals render as plain routes: a transparent one keeps the page visible behind the dialog.
const webModal: { presentation?: "transparentModal"; animation?: "none" } = Platform.select({
  web: { presentation: "transparentModal", animation: "none" },
  default: {},
});

/** A render error lands here on the plate, in plain words; the raw error goes to Sentry, not to the owner. */
function CrashScreen({ retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();

  async function backToToday() {
    router.replace("/");
    await retry();
  }

  return (
    <View
      className="bg-background flex-1 justify-center gap-4 p-4"
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
    >
      <StatusBar style="auto" />
      <Text aria-level={1} variant="headline">
        This screen stopped working.
      </Text>
      <Text>Nothing you saved is lost. Try again, or go back to Today.</Text>
      <View className="flex-row flex-wrap gap-2">
        <Button className="min-h-12" onPress={() => void retry()}>
          <Text>Retry</Text>
        </Button>
        <Button variant="outline" className="min-h-12" onPress={() => void backToToday()}>
          <Text>Back to Today</Text>
        </Button>
      </View>
    </View>
  );
}

/** React stops a render error at the boundary, so the wrapper reports it to Sentry. */
export const ErrorBoundary = Sentry.wrapExpoRouterErrorBoundary(CrashScreen);

// The gap that keeps the Undo toast just clear of the phone tab bar.
const TOAST_GAP = 8;

function RootLayout() {
  const theme = useNavigationTheme();
  const insets = useSafeAreaInsets();
  const aboveTabBar = useIsWide() ? 0 : TAB_BAR_HEIGHT;

  // The Toaster's swipe to dismiss needs the gesture root above every screen.
  return (
    <GestureHandlerRootView style={styles.root}>
      <DataProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="auto" />
          <MarkdownImageSourceProvider value={resolveImageSource}>
            <OfflineFrame>
              <CelebrationProvider>
                <RootStack />
              </CelebrationProvider>
            </OfflineFrame>
            <Toaster bottomOffset={insets.bottom + aboveTabBar + TOAST_GAP} />
          </MarkdownImageSourceProvider>
        </ThemeProvider>
      </DataProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({ root: { flex: 1 } });

// The bar takes the status bar's inset, so the screens below it get a top inset of 0 and add no gap of their own.
// The provider always renders, so going offline never remounts the screens.
function OfflineFrame({ children }: { children: ReactNode }) {
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1">
      {!isOnline && (
        <>
          {/* The bar inverts the theme's ink, so the status bar icons over it invert too. */}
          <StatusBar style="inverted" />
          <OfflineBar topInset={insets.top} />
        </>
      )}
      <SafeAreaInsetsContext value={isOnline ? insets : { ...insets, top: 0 }}>
        {children}
      </SafeAreaInsetsContext>
    </View>
  );
}

function RootStack() {
  const { status } = useAuth();
  const signedIn = status === "signed-in";

  // Signed out too: while this client lives, a notification button must queue through it, not a second one.
  useAlarmActions();

  // A font that fails to load falls back to the system face rather than holding the splash forever.
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const ready = status !== "loading" && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      {signedIn && (
        <>
          <AlarmSchedule />
          <CheckInPrompt />
          <CalmAutoLog />
          <HabitWidgets />
          <FitbitAutoLog />
        </>
      )}
      <Stack>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="plan" options={{ title: "Plan the day" }} />
          <Stack.Screen name="session-brief" options={{ title: "Session brief" }} />
          <Stack.Screen name="weekly-review" options={{ title: "Weekly retro" }} />
          <Stack.Screen name="evening-review" options={{ title: "Evening review" }} />
          <Stack.Screen name="close-period" options={{ title: "Close a period" }} />
          <Stack.Screen
            name="log"
            options={{ headerShown: false, presentation: "modal", ...webModal }}
          />
          {/* Full screen on phone: a half-height sheet fights the Android keyboard. */}
          <Stack.Screen
            name="habit/[id]/index"
            options={{ headerShown: false, presentation: "fullScreenModal", ...webModal }}
          />
          <Stack.Screen name="habit/[id]/history" options={{ title: "History" }} />
          {/* The Android Habits widget's tick and the Quick Settings tile's stop link here. */}
          <Stack.Screen name="habit/[id]/done" options={{ title: "Done" }} />
          <Stack.Screen name="habit/[id]/duration" options={{ title: "Duration entry" }} />
          <Stack.Screen
            name="log-entry"
            options={{ headerShown: false, presentation: "fullScreenModal", ...webModal }}
          />
          <Stack.Screen
            name="one-off"
            options={{ headerShown: false, presentation: "fullScreenModal", ...webModal }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

// Signed in only: the schedule reads the owner's Habits and Connections, and asks for notifications with the first Alarm.
function AlarmSchedule() {
  useAlarmSchedule();

  return null;
}

// Signed in only: it plans the midday Check-in prompt from the owner's Check-ins and opens Today on a tap.
function CheckInPrompt() {
  useCheckInPrompt();

  return null;
}

// Signed in only: it pushes today's open Habits to the Android widget and Quick Settings tile.
function HabitWidgets() {
  useHabitWidgets();

  return null;
}

// Signed in only: it posts Calm's new Health Connect sessions to the linked Habit.
function CalmAutoLog() {
  useCalmAutoLog();

  return null;
}

// Signed in only: it completes the linked Habits from Fitbit's Health Connect data.
function FitbitAutoLog() {
  useFitbitAutoLog();

  return null;
}

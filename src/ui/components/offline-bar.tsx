import { View } from "react-native";

import { Text } from "./text";

/** A thin inverted-ink strip across the top of every screen while the app has no connection. */
export function OfflineBar() {
  return (
    // pt-safe fills the area behind the status bar, so the label sits just below it.
    <View className="border-border bg-foreground items-center border-b pt-safe">
      <Text
        aria-live="polite"
        className="text-background font-label text-xs leading-4 tracking-wide"
      >
        Offline
      </Text>
    </View>
  );
}

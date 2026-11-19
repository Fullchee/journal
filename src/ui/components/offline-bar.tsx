import { View } from "react-native";

import { Text } from "./text";

interface OfflineBarProps {
  /** The status bar's height: the bar fills the area behind it, so its label sits just below. */
  topInset: number;
}

/** A thin inverted-ink strip across the top of every screen while the app has no connection. */
export function OfflineBar({ topInset }: OfflineBarProps) {
  return (
    <View
      className="border-border bg-foreground items-center border-b"
      style={{ paddingTop: topInset }}
    >
      <Text
        aria-live="polite"
        className="text-background font-label text-xs leading-4 tracking-wide"
      >
        Offline
      </Text>
    </View>
  );
}

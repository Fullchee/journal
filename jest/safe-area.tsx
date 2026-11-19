import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

// A phone with a 24dp gesture bar, so a sheet's bottom inset shows in its style.
const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 900 },
  insets: { top: 0, left: 0, right: 0, bottom: 24 },
};

/** The root layout's SafeAreaProvider, for a component test that renders a sheet outside the router. */
export function InSafeArea({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={PHONE}>{children}</SafeAreaProvider>;
}

import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState } from "react-native";

/** React Native has no window online or focus events, so TanStack Query learns both here. */
export function watchConnectivity() {
  onlineManager.setEventListener((setOnline) => {
    const subscription = Network.addNetworkStateListener(({ isConnected, isInternetReachable }) =>
      // isInternetReachable is unknown (undefined) right after start; only a definite "no" counts as offline.
      setOnline(Boolean(isConnected) && isInternetReachable !== false),
    );

    return () => subscription.remove();
  });

  const appState = AppState.addEventListener("change", (state) =>
    focusManager.setFocused(state === "active"),
  );

  return () => {
    onlineManager.setEventListener(() => {
      // No listener: the app stops reporting connectivity until watched again.
    });
    appState.remove();
  };
}

import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";

import { watchConnectivity } from "@/lib/data/connectivity.native";

jest.mock("expo-network", () => ({ addNetworkStateListener: jest.fn() }));

describe("watchConnectivity", () => {
  it("follows the device's network state, counting an unknown reachability as online", () => {
    const remove = jest.fn();
    jest.mocked(Network.addNetworkStateListener).mockReturnValue({ remove });

    const stop = watchConnectivity();
    const report = jest.mocked(Network.addNetworkStateListener).mock.lastCall?.[0];

    report?.({ isConnected: false });
    expect(onlineManager.isOnline()).toBe(false);
    report?.({ isConnected: true });
    expect(onlineManager.isOnline()).toBe(true);
    report?.({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    stop();
    expect(remove).toHaveBeenCalled();
    onlineManager.setOnline(true);
  });

  it("refetches on focus when the app comes to the foreground", () => {
    jest.mocked(Network.addNetworkStateListener).mockReturnValue({ remove: jest.fn() });
    const remove = jest.fn();
    const appStateSpy = jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove });

    const stop = watchConnectivity();
    const report: ((state: AppStateStatus) => void) | undefined = appStateSpy.mock.lastCall?.[1];

    report?.("background");
    expect(focusManager.isFocused()).toBe(false);
    report?.("active");
    expect(focusManager.isFocused()).toBe(true);

    stop();
    expect(remove).toHaveBeenCalled();
  });
});

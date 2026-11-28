import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** A switch only Android's Settings can flip, read again each time the owner comes back to the app. */
export function useSettingAccess(read: () => boolean, open: () => void) {
  const [granted, setGranted] = useState(read);

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") setGranted(read());
    });

    return () => listener.remove();
  }, [read]);

  return { granted, open };
}

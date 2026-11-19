import { Platform } from "react-native";
import { ENV } from "varlock/env";

export const PRODUCTION_ORIGIN = "https://journal.fullchee.workers.dev";

/** Web is served from the API's own origin, so Access's cookie rides along on same-origin requests. */
export const API_BASE_URL =
  ENV.EXPO_PUBLIC_API_URL ?? (Platform.OS === "web" ? "" : PRODUCTION_ORIGIN);

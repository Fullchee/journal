import { Text } from "@/ui";
import type { ComponentProps } from "react";

type StatusTextProps = Omit<
  ComponentProps<typeof Text>,
  "role" | "aria-live" | "accessibilityLiveRegion"
> & {
  /** An error interrupts TalkBack; any other status waits until it finishes speaking. */
  tone?: "status" | "error";
};

// React Native's Text drops `aria-live` on Android, so TalkBack needs `accessibilityLiveRegion` as well.
/** A save result or other status line that TalkBack and screen readers speak when it appears or changes. */
export function StatusText({ tone = "status", ...props }: StatusTextProps) {
  return tone === "error" ? (
    <Text role="alert" aria-live="assertive" accessibilityLiveRegion="assertive" {...props} />
  ) : (
    <Text role="status" aria-live="polite" accessibilityLiveRegion="polite" {...props} />
  );
}

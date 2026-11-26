import { AccessibilityInfo } from "react-native";

/** How long a toast's button stays offered (#106): long enough to read the message and reach the button in Storm. */
const ACTION_MS = 10_000;

export interface ActionToast {
  /** Toasts share an id to replace each other, so only one shows at a time. */
  id: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  /** Called when the toast leaves: timed out, swiped away or replaced by its action. */
  onClose?: () => void;
}

export type UndoToast = Omit<ActionToast, "actionLabel" | "onAction"> & { onUndo: () => void };

const screenReader = { on: false };

/** A screen reader user may still be hearing the message when time runs out, so the toast waits for a swipe. */
export const actionDuration = () => (screenReader.on ? Infinity : ACTION_MS);

/** Keeps `actionDuration` in step with TalkBack; the Toaster subscribes while it is mounted. */
export function followScreenReader() {
  void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
    screenReader.on = on;
  });

  const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", (on) => {
    screenReader.on = on;
  });

  return () => subscription.remove();
}

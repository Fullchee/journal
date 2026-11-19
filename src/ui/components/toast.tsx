import { useEffect } from "react";
import { Toaster as SonnerToaster, toast } from "sonner-native";
import { useCSSVariable } from "uniwind";

import { followScreenReader, undoDuration, type UndoToast } from "./undo-toast";

/** Shows one toast with an Undo button; a toast with the same id replaces it and restarts its clock. */
export function showUndoToast({ id, message, onUndo, onClose }: UndoToast) {
  toast(message, {
    id,
    duration: undoDuration(),
    action: {
      label: "Undo",
      onClick: () => {
        toast.dismiss(id);
        onUndo();
      },
    },
    ...(onClose && { onDismiss: onClose, onAutoClose: onClose }),
  });
}

const TOKENS = [
  "--color-card",
  "--color-foreground",
  "--color-input",
  "--color-primary",
  "--font-sans",
  "--font-label",
] as const;

export interface ToasterProps {
  /** Distance from the window's bottom edge, so the toast sits above the tab bar and the gesture bar. */
  bottomOffset: number;
}

/**
 * Mount once, above every screen. Paper on the plate, a sepia edge and no shadow, as the Folio's sheets.
 * Bottom-centre, where Android puts a snackbar and the thumb already is.
 */
export function Toaster({ bottomOffset }: ToasterProps) {
  // Native styles need real values, not `var(...)`, so the tokens are read in JS.
  const [paper, ink, edge, leaf, sans, label] = useCSSVariable([...TOKENS]).map(String);

  useEffect(followScreenReader, []);

  return (
    <SonnerToaster
      position="bottom-center"
      offset={bottomOffset}
      visibleToasts={1}
      toastOptions={{
        style: {
          backgroundColor: paper,
          borderColor: edge,
          borderWidth: 1,
          borderRadius: 3,
          // eslint-disable-next-line expo/prefer-box-shadow -- sonner-native sets these two itself, and a boxShadow can't cancel them.
          shadowOpacity: 0,
          // eslint-disable-next-line expo/prefer-box-shadow -- as above.
          elevation: 0,
        },
        titleStyle: { color: ink, fontFamily: sans, fontSize: 17 },
        actionButtonStyle: { backgroundColor: "transparent", minHeight: 48, paddingHorizontal: 12 },
        actionButtonTextStyle: { color: leaf, fontFamily: label, fontSize: 16 },
      }}
    />
  );
}

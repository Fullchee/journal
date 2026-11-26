import { useEffect } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

import type { ToasterProps } from "./toast";
import { actionDuration, followScreenReader, type ActionToast, type UndoToast } from "./undo-toast";

/** Shows one toast with a button; a toast with the same id replaces it. The native twin is toast.tsx. */
export function showActionToast({ id, message, actionLabel, onAction, onClose }: ActionToast) {
  toast(message, {
    id,
    duration: actionDuration(),
    // sonner dismisses the toast after the click.
    action: { label: actionLabel, onClick: onAction },
    ...(onClose && { onDismiss: onClose, onAutoClose: onClose }),
  });
}

export function showUndoToast({ onUndo, ...toast }: UndoToast) {
  showActionToast({ ...toast, actionLabel: "Undo", onAction: onUndo });
}

/** Mount once, above every screen. The DOM resolves `var(...)`, so the tokens follow night mode by themselves. */
export function Toaster({ bottomOffset }: ToasterProps) {
  useEffect(followScreenReader, []);

  return (
    <SonnerToaster
      position="bottom-center"
      offset={{ bottom: bottomOffset }}
      mobileOffset={{ bottom: bottomOffset }}
      visibleToasts={1}
      toastOptions={{
        style: {
          background: "var(--color-card)",
          color: "var(--color-foreground)",
          border: "1px solid var(--color-input)",
          borderRadius: 3,
          boxShadow: "none",
          fontFamily: "var(--font-sans)",
          fontSize: 17,
        },
        actionButtonStyle: {
          background: "transparent",
          color: "var(--color-primary)",
          fontFamily: "var(--font-label)",
          fontSize: 16,
          minHeight: 44,
        },
      }}
    />
  );
}

import { cn } from "@/ui";
import { useEffect } from "react";
import { Pressable, View } from "react-native";

import type { ModalFrameProps } from "@/components/modal-frame";
import { dismissModal, ModalHeader } from "@/components/modal-header";

/** Expo Router renders web modals as plain routes, so the backdrop, Escape and the panel are drawn here. */
export function ModalFrame({ title, variant, children }: ModalFrameProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissModal();
    };

    addEventListener("keydown", onKeyDown);

    return () => removeEventListener("keydown", onKeyDown);
  }, []);

  const isSideSheet = variant === "side-sheet";

  return (
    <View
      className={cn(
        "flex-1 bg-black/40",
        isSideSheet ? "flex-row justify-end" : "items-center justify-center p-6",
      )}
    >
      <Pressable aria-label="Close" onPress={dismissModal} className="absolute inset-0" />
      <View
        role="dialog"
        aria-modal
        aria-label={title}
        className={cn(
          "bg-background",
          isSideSheet
            ? "h-full w-full max-w-md border-l border-border"
            : "max-h-full w-full max-w-xl rounded-lg border border-border",
        )}
      >
        <ModalHeader title={title} />
        {children}
      </View>
    </View>
  );
}

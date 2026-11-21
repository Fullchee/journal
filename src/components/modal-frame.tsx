import type { ReactNode } from "react";
import { KeyboardAvoidingView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ModalHeader } from "@/components/modal-header";

/**
 * The web twin (modal-frame.web.tsx) draws the dialog or side sheet; on Android the stack presents the screen.
 */
export interface ModalFrameProps {
  title: string;
  variant: "dialog" | "side-sheet";
  children: ReactNode;
}

export function ModalFrame({ title, children }: ModalFrameProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-background flex-1"
      // oxlint-disable-next-line shadcn/no-inline-styles -- OfflineFrame zeroes the top inset in context, which pt-safe ignores
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ModalHeader title={title} />
      {/* Edge-to-edge Android no longer resizes for the keyboard, so padding lifts a form's pinned Save above it.
          The frame fills the window from its top edge, so the view's own position needs no offset. */}
      <KeyboardAvoidingView behavior="padding" className="flex-1" testID="modal-keyboard-avoider">
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

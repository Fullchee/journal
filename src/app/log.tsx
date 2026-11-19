import { View } from "react-native";

import { LogComposer } from "@/components/log-composer";
import { ModalFrame } from "@/components/modal-frame";

/** The widget's and shortcut's way in: one box that logs at once, or becomes the form for what it understood. */
export default function LogScreen() {
  return (
    // ModalFrame keeps the composer above the keyboard.
    <ModalFrame title="Log" variant="dialog">
      <View className="flex-1 justify-end web:h-[40vh]">
        <View className="flex-1" />
        <LogComposer autoFocus replace />
      </View>
    </ModalFrame>
  );
}

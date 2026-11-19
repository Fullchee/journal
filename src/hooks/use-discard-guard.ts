import { usePreventRemove } from "expo-router";
import { useState } from "react";

import { confirm } from "@/lib/confirm";

/** Back, Close or a link away asks before dropping unsaved text; `message` says what would be lost. */
export function useDiscardGuard(changed: boolean, message: string) {
  const [leaving, setLeaving] = useState(false);

  usePreventRemove(changed && !leaving, ({ repeat }) => {
    void confirm({ title: "Discard edits?", message, action: "Discard" }).then((discard) => {
      if (!discard) return;

      setLeaving(true);
      repeat();
    });
  });
}

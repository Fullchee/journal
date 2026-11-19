import type { Logged } from "@/core";
import { Button, Text } from "@/ui";
import { View } from "react-native";

import { dismissModal } from "@/components/modal-header";
import { StatusText } from "@/components/status-text";
import { useIsOnline } from "@/lib/data/data-provider";
import { logError, useUndoLog } from "@/lib/data/log";

interface LogReceiptProps {
  logged: Logged;
  /** Replaces the text once Undo lands. */
  undone: string;
  /** A form's Receipt closes the form; the Log box's clears itself. */
  onDone?: () => void;
}

/** What a log saved, with its single-use Undo. */
export function LogReceipt({ logged, undone, onDone = dismissModal }: LogReceiptProps) {
  const isOnline = useIsOnline();
  const undo = useUndoLog();

  return (
    <View className="gap-4 p-4">
      <StatusText>{undo.isSuccess ? undone : logged.text}</StatusText>
      {undo.error && (
        <StatusText tone="error" className="text-destructive">
          {logError(undo.error)}
        </StatusText>
      )}
      <View className="flex-row gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={!isOnline || undo.isPending || undo.isSuccess}
          onPress={() => undo.mutate(logged.action)}
        >
          <Text>Undo</Text>
        </Button>
        <Button className="flex-1" onPress={onDone}>
          <Text>Done</Text>
        </Button>
      </View>
    </View>
  );
}

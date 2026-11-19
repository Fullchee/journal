import { Button, Text } from "@/ui";
import { View } from "react-native";

import { dismissModal } from "@/components/modal-header";
import { StatusText } from "@/components/status-text";
import { logError } from "@/lib/data/log";

interface LogSaveFooterProps {
  error: Error | null;
  /** Why Save is off, shown and spoken beside it; null when the form is ready. */
  reason: string | null;
  disabled: boolean;
  onSave: () => void;
}

export function LogSaveFooter({ error, reason, disabled, onSave }: LogSaveFooterProps) {
  return (
    <View className="border-border gap-2 border-t p-4">
      {error && (
        <StatusText tone="error" className="text-destructive">
          {logError(error)}
        </StatusText>
      )}
      {reason !== null && <StatusText variant="muted">{reason}</StatusText>}
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={dismissModal}>
          <Text>Cancel</Text>
        </Button>
        <Button className="flex-1" disabled={disabled} onPress={onSave}>
          <Text>Save</Text>
        </Button>
      </View>
    </View>
  );
}

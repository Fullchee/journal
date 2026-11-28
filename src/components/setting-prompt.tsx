import { Button, Text } from "@/ui";
import { View } from "react-native";

interface SettingPromptProps {
  /** `null` off Android, where the setting doesn't exist. */
  access: { granted: boolean; open: () => void } | null;
  reason: string;
  action: string;
}

/** Asks the owner to switch on an Android setting the app can't turn on itself; quiet once it's on. */
export function SettingPrompt({ access, reason, action }: SettingPromptProps) {
  if (access === null || access.granted) return null;

  return (
    <View className="gap-2">
      <Text variant="muted">{reason}</Text>
      <Button variant="outline" className="self-start" onPress={access.open}>
        <Text>{action}</Text>
      </Button>
    </View>
  );
}

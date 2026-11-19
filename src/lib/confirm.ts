import { Alert, Platform } from "react-native";

interface Ask {
  title: string;
  message: string;
  action: string;
}

/** React Native Web's Alert does nothing, so the browser's own dialog asks there. */
export function confirm({ title, message, action }: Ask): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm(`${title}\n\n${message}`));

  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: action, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

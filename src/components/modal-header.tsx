import { Button, Icon, Text } from "@/ui";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { View } from "react-native";

/** A modal opened from a deep link or a launcher shortcut has nothing under it to go back to. */
export const dismissModal = () => (router.canGoBack() ? router.back() : router.replace("/"));

export function ModalHeader({ title }: { title: string }) {
  return (
    <View className="border-border flex-row items-center gap-2 border-b px-4 py-1">
      <Text aria-level={1} variant="title" className="flex-1">
        {title}
      </Text>
      <Button variant="ghost" size="icon" aria-label="Close" onPress={dismissModal}>
        <Icon as={X} />
      </Button>
    </View>
  );
}

import {
  imageMarkdown,
  insertOnOwnLine,
  removePlaceholder,
  replacePlaceholder,
  uploadingPlaceholder,
} from "@/core";
import { Button, Icon, Text } from "@/ui";
import { ImagePlus } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { View, type TextInputSelectionChangeEvent } from "react-native";

import { useIsOnline } from "@/lib/data/data-provider";
import { pickImage, uploadImage } from "@/lib/image-upload";

export const OFFLINE_IMAGES = "Adding images needs a connection.";

/**
 * Picks a photo and uploads it into a Markdown field at the cursor; spread `onSelectionChange` onto its TextInput.
 */
export function useAddImage(text: string, onChangeText: (text: string) => void) {
  const isOnline = useIsOnline();
  const [error, setError] = useState("");
  const selectionRef = useRef({ start: text.length, end: text.length });
  // The upload finishes after more typing, so the placeholder is swapped in the newest text.
  const latestRef = useRef(text);

  useEffect(() => {
    latestRef.current = text;
  });

  const change = (next: string) => {
    latestRef.current = next;
    onChangeText(next);
  };

  async function addImage() {
    const asset = await pickImage();

    if (!asset) return;
    const name = asset.fileName ?? "image";
    const placeholder = uploadingPlaceholder(name);
    const { start, end } = selectionRef.current;
    const inserted = insertOnOwnLine(latestRef.current, start, end, placeholder);

    selectionRef.current = { start: inserted.cursor, end: inserted.cursor };
    change(inserted.text);

    const url = await uploadImage(asset);

    if (url === null) {
      setError(`Couldn't upload ${name}.`);
      change(removePlaceholder(latestRef.current, placeholder));
    } else {
      setError("");
      change(replacePlaceholder(latestRef.current, placeholder, imageMarkdown(name, url)));
    }
  }

  return {
    isOnline,
    error,
    addImage,
    onSelectionChange: (event: TextInputSelectionChangeEvent) => {
      selectionRef.current = event.nativeEvent.selection;
    },
  };
}

export function AddImageButton({ images }: { images: ReturnType<typeof useAddImage> }) {
  return (
    <View className="gap-1">
      <Button
        variant="outline"
        className="h-11 self-start"
        disabled={!images.isOnline}
        onPress={() => void images.addImage()}
      >
        <Icon as={ImagePlus} />
        <Text>Add image</Text>
      </Button>
      {images.isOnline ? null : <Text variant="muted">{OFFLINE_IMAGES}</Text>}
      {images.error === "" ? null : <Text role="alert">{images.error}</Text>}
    </View>
  );
}

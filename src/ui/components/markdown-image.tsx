import { Image, type ImageSource } from "expo-image";
import { createContext, use, useEffect, useState } from "react";
import { View } from "react-native";

/** Turns a Markdown image URL into what expo-image loads: the app adds its API origin and auth. */
export type ImageSourceResolver = (url: string) => Promise<ImageSource>;

const ImageSourceContext = createContext<ImageSourceResolver>((url) =>
  Promise.resolve({ uri: url }),
);

export const MarkdownImageSourceProvider = ImageSourceContext.Provider;

// Until the image loads, reserve a landscape box so the text below doesn't jump far.
const LOADING_ASPECT_RATIO = 4 / 3;

interface Size {
  width: number;
  height: number;
}

// Like journal's `max-w-full h-auto`: natural size, shrunk to fit the width.
const sizeStyle = (size: Size | null) =>
  size
    ? { width: "100%" as const, maxWidth: size.width, aspectRatio: size.width / size.height }
    : { width: "100%" as const, aspectRatio: LOADING_ASPECT_RATIO };

export function MarkdownImage({ alt, url }: { alt: string; url: string }) {
  const resolve = use(ImageSourceContext);
  const [source, setSource] = useState<ImageSource | null>(null);
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    let current = true;

    void resolve(url).then((resolved) => {
      if (current) setSource(resolved);
    });

    return () => {
      current = false;
    };
  }, [resolve, url]);

  // oxlint-disable-next-line shadcn/no-inline-styles -- the placeholder keeps the image's measured size
  if (!source) return <View testID="markdown-image-loading" style={sizeStyle(size)} />;

  return (
    <Image
      source={source}
      alt={alt}
      // The disk cache ignores the server's no-cache, so a seen image still shows offline.
      cachePolicy="disk"
      contentFit="contain"
      onLoad={({ source: loaded }) => setSize({ width: loaded.width, height: loaded.height })}
      // oxlint-disable-next-line shadcn/no-inline-styles -- expo-image takes no className, and the size is the image's own
      style={[sizeStyle(size), { marginBottom: 12 }]}
    />
  );
}

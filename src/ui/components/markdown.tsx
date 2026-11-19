import { splitImages } from "@/core";
import { View } from "react-native";
import {
  EnrichedMarkdownText,
  type LinkPressEvent,
  type MarkdownStyle,
} from "react-native-enriched-markdown";
import { useCSSVariable } from "uniwind";

import { MarkdownImage } from "./markdown-image";

const COLOR_TOKENS = [
  "--color-foreground",
  "--color-muted-foreground",
  "--color-primary",
  "--color-border",
  "--color-muted",
] as const;

// `large` is for reading in Storm: the Health plan.
const SIZES = {
  default: { body: 16, h1: 26, h2: 22, h3: 18 },
  large: { body: 21, h1: 32, h2: 27, h3: 23 },
} as const;

interface MarkdownProps {
  markdown: string;
  size?: keyof typeof SIZES;
  /** Without it, links open in the browser. */
  onLinkPress?: (url: string) => void;
  testID?: string;
}

// A token the theme doesn't define is left out, so the Markdown view keeps its own default colour.
function definedColors<K extends string>(
  colors: Record<K, string | undefined>,
): Partial<Record<K, string>> {
  const defined: Partial<Record<K, string>> = {};

  for (const key in colors) {
    const color = colors[key];

    if (color !== undefined) defined[key] = color;
  }

  return defined;
}

function useMarkdownStyle(size: keyof typeof SIZES): MarkdownStyle {
  const [foreground, muted, primary, border, mutedBackground] = useCSSVariable([
    ...COLOR_TOKENS,
  ]).map((value) => (value === undefined ? undefined : String(value)));

  const scale = SIZES[size];

  const block = (fontSize: number, fontWeight = "normal") => ({
    fontSize,
    fontWeight,
    ...definedColors({ color: foreground }),
    lineHeight: Math.round(fontSize * 1.5),
    marginBottom: Math.round(fontSize * 0.6),
  });

  return {
    paragraph: block(scale.body),
    h1: block(scale.h1, "bold"),
    h2: block(scale.h2, "bold"),
    h3: block(scale.h3, "bold"),
    h4: block(scale.body, "bold"),
    list: { ...block(scale.body), ...definedColors({ bulletColor: muted, markerColor: muted }) },
    blockquote: { ...block(scale.body), ...definedColors({ color: muted, borderColor: border }) },
    link: { ...definedColors({ color: primary }), underline: true },
    code: definedColors({ backgroundColor: mutedBackground, color: foreground }),
    codeBlock: {
      ...block(scale.body * 0.9),
      ...definedColors({ backgroundColor: mutedBackground, borderColor: border }),
    },
    thematicBreak: definedColors({ color: border }),
  };
}

// Read-only Markdown in the theme's colours; editing is a plain TextInput beside it.
// Images go to expo-image: the Markdown view can't send auth headers on a relative URL or show an image offline.
function Markdown({ markdown, size = "default", onLinkPress, testID }: MarkdownProps) {
  const markdownStyle = useMarkdownStyle(size);

  return (
    <View testID={testID}>
      {splitImages(markdown).map((block, index) =>
        block.type === "image" ? (
          // eslint-disable-next-line eslint-react/no-array-index-key -- blocks are split from one string and have no identity of their own
          <MarkdownImage key={index} alt={block.alt} url={block.url} />
        ) : (
          <EnrichedMarkdownText
            // eslint-disable-next-line eslint-react/no-array-index-key -- blocks are split from one string and have no identity of their own
            key={index}
            markdown={block.markdown}
            flavor="github"
            md4cFlags={{ latexMath: false }}
            markdownStyle={markdownStyle}
            enableTaskListItemToggle={false}
            {...(onLinkPress && { onLinkPress: ({ url }: LinkPressEvent) => onLinkPress(url) })}
          />
        ),
      )}
    </View>
  );
}

export { Markdown };

export type { MarkdownProps };

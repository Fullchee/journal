import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { useCSSVariable, useUniwind } from "uniwind";

import type { FontFace } from "@/lib/fonts";

const TOKENS = [
  "--color-primary",
  "--color-background",
  "--color-card",
  "--color-foreground",
  "--color-border",
  "--color-destructive",
] as const;

const face = (fontFamily: FontFace) => ({ fontFamily, fontWeight: "normal" }) as const;

// Header titles draw from `medium`, so it takes the caption face headings use; the tab bar sets its own small caps.
const FONTS: Theme["fonts"] = {
  regular: face("AlegreyaSans_400Regular"),
  medium: face("Alegreya_400Regular_Italic"),
  bold: face("Alegreya_400Regular_Italic"),
  heavy: face("AlegreyaSans_700Bold"),
};

/**
 * React Navigation draws headers and the tab bar from plain colour strings, so they come from the same tokens as className.
 */
export function useNavigationTheme(): Theme {
  const { theme } = useUniwind();
  const base = theme === "dark" ? DarkTheme : DefaultTheme;

  const [primary, background, card, text, border, notification] = useCSSVariable([...TOKENS]).map(
    // A token is missing before the stylesheet loads and in Jest; a colour token is never a bare number.
    (value) => (value === undefined ? undefined : String(value)),
  );

  return {
    ...base,
    fonts: FONTS,
    colors: {
      primary: primary ?? base.colors.primary,
      background: background ?? base.colors.background,
      card: card ?? base.colors.card,
      text: text ?? base.colors.text,
      border: border ?? base.colors.border,
      notification: notification ?? base.colors.notification,
    },
  };
}

import { Alegreya_400Regular_Italic } from "@expo-google-fonts/alegreya/400Regular_Italic";
import { Alegreya_500Medium_Italic } from "@expo-google-fonts/alegreya/500Medium_Italic";
import { AlegreyaSans_400Regular } from "@expo-google-fonts/alegreya-sans/400Regular";
import { AlegreyaSans_500Medium } from "@expo-google-fonts/alegreya-sans/500Medium";
import { AlegreyaSans_700Bold } from "@expo-google-fonts/alegreya-sans/700Bold";
import { AlegreyaSansSC_500Medium } from "@expo-google-fonts/alegreya-sans-sc/500Medium";
import { AlegreyaSansSC_700Bold } from "@expo-google-fonts/alegreya-sans-sc/700Bold";

/** The faces the --font-* roles in tokens.css name; each loads under its key, so a role's family is the key. */
export const FONTS = {
  Alegreya_400Regular_Italic,
  Alegreya_500Medium_Italic,
  AlegreyaSans_400Regular,
  AlegreyaSans_500Medium,
  AlegreyaSans_700Bold,
  AlegreyaSansSC_500Medium,
  AlegreyaSansSC_700Bold,
};

export type FontFace = keyof typeof FONTS;

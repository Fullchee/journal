import { Share } from "react-native";

export const SHARE_LABEL = "Share";

/** Android hands the text to the share sheet; the web twin (share-text.web.ts) copies it. */
export async function shareText(text: string): Promise<string | null> {
  await Share.share({ message: text });

  return null;
}

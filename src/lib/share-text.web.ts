export const SHARE_LABEL = "Copy Markdown";

/**
 * The web has no share sheet on desktop, so the Markdown goes to the clipboard; the result is the note to show.
 */
export async function shareText(text: string): Promise<string | null> {
  await navigator.clipboard.writeText(text);

  return "Copied. Paste it into a message to your coach.";
}

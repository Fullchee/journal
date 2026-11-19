/**
 * Images display as blocks of their own, so the snippet replaces the selection on a line of its own and the text matches what shows.
 */
export const insertOnOwnLine = (
  text: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: string,
) => {
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const line = (before === "" || before.endsWith("\n") ? "" : "\n") + snippet;

  return {
    text: before + line + (after === "" || after.startsWith("\n") ? "" : "\n") + after,
    cursor: before.length + line.length,
  };
};

export const uploadingPlaceholder = (name: string) => `![Uploading ${name}…]()`;

/** The alt text is the file name without its extension. */
export const imageMarkdown = (name: string, url: string) =>
  `![${name.replace(/\.[^.]+$/, "")}](${url})`;

const COMPRESS_ABOVE_BYTES = 300_000;
const MAX_EDGE = 1600;

/** GIFs are skipped because re-encoding keeps only the first frame. */
export const needsCompression = (type: string, size: number) =>
  type !== "image/gif" && size > COMPRESS_ABOVE_BYTES;

/** Scales down so the longer edge is at most MAX_EDGE; never scales up. */
export const fitWithin = (width: number, height: number) => {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

export const replacePlaceholder = (text: string, placeholder: string, replacement: string) =>
  text.replace(placeholder, () => replacement);

/** The placeholder sits on its own line, so a failed upload takes one of its line breaks with it. */
export const removePlaceholder = (text: string, placeholder: string) => {
  for (const line of [`${placeholder}\n`, `\n${placeholder}`, placeholder]) {
    if (text.includes(line)) return text.replace(line, "");
  }

  return text;
};

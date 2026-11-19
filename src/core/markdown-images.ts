export type MarkdownBlock =
  | { type: "markdown"; markdown: string }
  | { type: "image"; alt: string; url: string };

// A backslash before `!` escapes the image.
const IMAGE = /(?<!\\)!\[([^\]]*)\]\(\s*<?([^\s<>()]+)>?(?:\s+"[^"]*")?\s*\)/g;

// Four spaces or a tab make an indented code block; a backtick may hide the image in inline code.
const isLiteral = (line: string) => /^(?: {4}|\t)/.test(line) || line.includes("`");
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Every image becomes its own block, splitting its line around it; Android can't draw an image inside text. An upload placeholder has no URL, so it stays Markdown.
 */
export function splitImages(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let pending: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (pending.join("").trim() !== "")
      blocks.push({ type: "markdown", markdown: pending.join("\n") });
    pending = [];
  };

  // Leaves everything untouched and returns false when the line has no image.
  const pushImages = (line: string) => {
    let found = false;
    let rest = 0;

    // The replace callback is typed per group, and both groups always take part in a match.
    const images: { whole: string; alt: string; url: string; index: number }[] = [];

    line.replaceAll(IMAGE, (whole: string, alt: string, url: string, index: number) => {
      images.push({ whole, alt, url, index });

      return whole;
    });

    for (const { whole, alt, url, index } of images) {
      const text = line.slice(rest, index);

      if (text.trim() !== "") pending.push(found ? text.trim() : text.trimEnd());
      flush();
      blocks.push({ type: "image", alt, url });
      found = true;
      rest = index + whole.length;
    }

    const tail = line.slice(rest).trim();

    if (found && tail !== "") pending.push(tail);

    return found;
  };

  for (const line of markdown.split("\n")) {
    if (fence === null && !isLiteral(line) && pushImages(line)) continue;

    const marker = FENCE.exec(line)?.[1];

    // A fence closes only on its own character: ``` inside ~~~ is code.
    if (marker !== undefined) {
      const char = marker.charAt(0);

      if (fence === null) fence = char;
      else if (char === fence) fence = null;
    }

    pending.push(line);
  }

  flush();

  return blocks;
}

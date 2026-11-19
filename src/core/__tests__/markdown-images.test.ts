import assert from "node:assert/strict";

import { splitImages } from "@/core/markdown-images";

test("splitImages keeps Markdown without images as one block", () => {
  assert.deepEqual(splitImages("# Walk\n\nEvery morning."), [
    { type: "markdown", markdown: "# Walk\n\nEvery morning." },
  ]);
});

test("splitImages returns nothing for blank Markdown", () => {
  assert.deepEqual(splitImages("  \n"), []);
});

test("splitImages splits an image line out between text", () => {
  assert.deepEqual(splitImages("Before\n\n![IMG_1](/api/attachments/habits/a.webp)\n\nAfter"), [
    { type: "markdown", markdown: "Before\n" },
    { type: "image", alt: "IMG_1", url: "/api/attachments/habits/a.webp" },
    { type: "markdown", markdown: "\nAfter" },
  ]);
});

test("splitImages reads titles, angle brackets, indent and empty alt", () => {
  assert.deepEqual(splitImages('  ![](<https://example.com/a.png> "A title")\n![x](/b.png)'), [
    { type: "image", alt: "", url: "https://example.com/a.png" },
    { type: "image", alt: "x", url: "/b.png" },
  ]);
});

test("splitImages pulls an image out of the middle of a line", () => {
  assert.deepEqual(splitImages("See ![x](/a.png) here ![y](/b.png)"), [
    { type: "markdown", markdown: "See" },
    { type: "image", alt: "x", url: "/a.png" },
    { type: "markdown", markdown: "here" },
    { type: "image", alt: "y", url: "/b.png" },
  ]);
});

test("splitImages keeps the text after the last image on its line", () => {
  assert.deepEqual(splitImages("![x](/a.png) after"), [
    { type: "image", alt: "x", url: "/a.png" },
    { type: "markdown", markdown: "after" },
  ]);
});

test.each([
  ["image in inline code", "Type `![x](/a.png)` to embed"],
  ["escaped image", String.raw`Not \![x](/a.png) an image`],
  ["upload placeholder", "![Uploading IMG_1.jpg…]()"],
  ["indented code", "    ![x](/a.png)"],
])("splitImages leaves an %s as Markdown", (_case, markdown) => {
  assert.deepEqual(splitImages(markdown), [{ type: "markdown", markdown }]);
});

test("splitImages leaves images inside fenced code alone", () => {
  const fenced = "```md\n![x](/a.png)\n~~~\n```";

  assert.deepEqual(splitImages(`${fenced}\n![y](/b.png)`), [
    { type: "markdown", markdown: fenced },
    { type: "image", alt: "y", url: "/b.png" },
  ]);
});

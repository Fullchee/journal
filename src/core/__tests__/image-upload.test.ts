import assert from "node:assert/strict";

import {
  fitWithin,
  imageMarkdown,
  insertOnOwnLine,
  needsCompression,
  removePlaceholder,
  replacePlaceholder,
  uploadingPlaceholder,
} from "@/core/image-upload";

test("insertOnOwnLine breaks the line around the snippet, over a selection", () => {
  assert.deepEqual(insertOnOwnLine("ab", 1, 1, "X"), { text: "a\nX\nb", cursor: 3 });
  assert.deepEqual(insertOnOwnLine("ab", 2, 2, "XY"), { text: "ab\nXY", cursor: 5 });
  assert.deepEqual(insertOnOwnLine("abcd", 1, 3, "X"), { text: "a\nX\nd", cursor: 3 });
});

test("insertOnOwnLine adds no break at the edges or next to an existing one", () => {
  assert.deepEqual(insertOnOwnLine("", 0, 0, "X"), { text: "X", cursor: 1 });
  assert.deepEqual(insertOnOwnLine("a\n\nb", 2, 2, "X"), { text: "a\nX\nb", cursor: 3 });
  assert.deepEqual(insertOnOwnLine("a\n", 2, 2, "X"), { text: "a\nX", cursor: 3 });
});

test("imageMarkdown uses the file name without its extension as alt text", () => {
  assert.equal(imageMarkdown("shot.final.png", "/u.png"), "![shot.final](/u.png)");
  assert.equal(imageMarkdown("noext", "/u.png"), "![noext](/u.png)");
});

test("replacePlaceholder swaps the placeholder for the image", () => {
  const placeholder = uploadingPlaceholder("a.png");

  assert.equal(
    replacePlaceholder(`a\n${placeholder}\nb`, placeholder, "![a](/u.png)"),
    "a\n![a](/u.png)\nb",
  );
  assert.equal(replacePlaceholder("gone", placeholder, "x"), "gone");
});

test("removePlaceholder removes the placeholder with the line break it was given", () => {
  const placeholder = uploadingPlaceholder("a.png");

  assert.equal(removePlaceholder(`a\n${placeholder}\nb`, placeholder), "a\nb");
  assert.equal(removePlaceholder(`a\n${placeholder}`, placeholder), "a");
  assert.equal(removePlaceholder(`${placeholder}\nb`, placeholder), "b");
  assert.equal(removePlaceholder(placeholder, placeholder), "");
  assert.equal(removePlaceholder("gone", placeholder), "gone");
});

test("needsCompression skips gifs and small files", () => {
  assert.equal(needsCompression("image/png", 500_000), true);
  assert.equal(needsCompression("image/png", 1000), false);
  assert.equal(needsCompression("image/gif", 5_000_000), false);
});

test("fitWithin caps the longer edge and never scales up", () => {
  assert.deepEqual(fitWithin(3200, 1600), { width: 1600, height: 800 });
  assert.deepEqual(fitWithin(1000, 4000), { width: 400, height: 1600 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
});

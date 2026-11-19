import { shareText } from "@/lib/share-text.web";

it("copies the text to the clipboard on web", async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

  await expect(shareText("# Brief")).resolves.toMatch(/^Copied/);
  expect(writeText).toHaveBeenCalledWith("# Brief");
});

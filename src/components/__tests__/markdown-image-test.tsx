import { Markdown, MarkdownImageSourceProvider } from "@/ui";
import { render, screen } from "@testing-library/react-native";

const DESCRIPTION = "Walk daily.\n\n![Trail map](/api/attachments/habits/map.webp)";

describe("Markdown images", () => {
  it("draws an image line with the source the app resolves", async () => {
    const resolve = jest.fn((url: string) =>
      Promise.resolve({ uri: `https://api.test${url}`, headers: { authorization: "Bearer a1" } }),
    );

    await render(
      <MarkdownImageSourceProvider value={resolve}>
        <Markdown markdown={DESCRIPTION} />
      </MarkdownImageSourceProvider>,
    );

    expect(await screen.findByLabelText("Trail map")).toBeOnTheScreen();
    expect(resolve).toHaveBeenCalledWith("/api/attachments/habits/map.webp");
  });

  it("keeps the space for an image while its source resolves", async () => {
    await render(
      <MarkdownImageSourceProvider value={() => Promise.withResolvers<never>().promise}>
        <Markdown markdown={DESCRIPTION} />
      </MarkdownImageSourceProvider>,
    );

    expect(screen.getByTestId("markdown-image-loading")).toBeOnTheScreen();
  });

  it("loads the URL as written without an app resolver", async () => {
    await render(<Markdown markdown="![Logo](https://example.com/logo.png)" />);

    expect(await screen.findByLabelText("Logo")).toBeOnTheScreen();
  });
});

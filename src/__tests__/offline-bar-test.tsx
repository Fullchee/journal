import { OfflineBar } from "@/ui";
import { render, screen } from "@testing-library/react-native";

it("fills the status bar inset and labels itself Offline below it", async () => {
  await render(<OfflineBar />);

  const label = screen.getByText("Offline");

  expect(label).toBeOnTheScreen();
  expect(label.parent).toHaveProp("className", expect.stringContaining("pt-safe"));
});

it("inverts the ink: a foreground fill under a background label", async () => {
  await render(<OfflineBar />);

  const label = screen.getByText("Offline");

  expect(label).toHaveProp("className", expect.stringContaining("text-background"));
  expect(label.parent).toHaveProp("className", expect.stringContaining("bg-foreground"));
});

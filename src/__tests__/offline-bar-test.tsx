import { OfflineBar } from "@/ui";
import { render, screen } from "@testing-library/react-native";

it("fills the status bar inset and labels itself Offline below it", async () => {
  await render(<OfflineBar topInset={24} />);

  const label = screen.getByText("Offline");

  expect(label).toBeOnTheScreen();
  expect(label.parent).toHaveStyle({ paddingTop: 24 });
});

it("inverts the ink: a foreground fill under a background label", async () => {
  await render(<OfflineBar topInset={24} />);

  const label = screen.getByText("Offline");

  expect(label).toHaveProp("className", expect.stringContaining("text-background"));
  expect(label.parent).toHaveProp("className", expect.stringContaining("bg-foreground"));
});

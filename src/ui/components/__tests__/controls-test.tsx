import { render, screen, userEvent } from "@testing-library/react-native";

import { Button, buttonVariants } from "@/ui/components/button";
import { Switch } from "@/ui/components/switch";
import { Text } from "@/ui/components/text";

describe("Switch", () => {
  it("toggles from a tap on its label and reports its state", async () => {
    const onCheckedChange = jest.fn();
    await render(
      <Switch aria-label="Grow closer" checked={false} onCheckedChange={onCheckedChange}>
        Grow closer: prompt me to make plans
      </Switch>,
    );

    expect(screen.getByRole("switch", { name: "Grow closer" })).not.toBeChecked();
    await userEvent.press(screen.getByText("Grow closer: prompt me to make plans"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("shows on, and ignores taps while disabled", async () => {
    const onCheckedChange = jest.fn();
    await render(
      <Switch aria-label="Opt-out" checked disabled onCheckedChange={onCheckedChange}>
        Opt-out
      </Switch>,
    );

    expect(screen.getByRole("switch", { name: "Opt-out" })).toBeChecked();
    await userEvent.press(screen.getByText("Opt-out"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});

describe("Button", () => {
  it.each(["default", "sm", "lg", "icon"] as const)(
    "keeps the %s size at least 48dp at every width",
    (size) => {
      const classes = buttonVariants({ size });

      expect(classes).toContain("min-h-12");
      expect(classes).not.toMatch(/\bsm:/);
    },
  );

  it("lets a caller's height win", async () => {
    await render(
      <Button className="h-14" onPress={jest.fn()}>
        <Text>Save</Text>
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveProp(
      "className",
      expect.stringMatching(/\bh-14\b/),
    );
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveProp(
      "className",
      expect.stringMatching(/(^| )h-12( |$)/),
    );
  });
});

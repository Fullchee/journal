import { Input } from "@/ui";
import { render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { TextField } from "@/components/habits/form-fields";

afterEach(() => jest.restoreAllMocks());

describe.each([
  ["Input", () => <Input aria-label="Why" multiline rows={3} />],
  ["TextField", () => <TextField label="Why" multiline rows={3} />],
])("%s", (_name, renderField) => {
  it("starts a web textarea at its rows", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    await render(renderField());

    expect(screen.getByLabelText("Why")).toHaveProp("rows", 3);
  });

  it("leaves the height to native, where rows would fix it", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await render(renderField());

    expect(screen.getByLabelText("Why")).not.toHaveProp("rows");
  });
});

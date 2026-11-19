import { renderHook } from "@testing-library/react-native";
import { DarkTheme } from "expo-router";

import { useNavigationTheme } from "@/hooks/use-navigation-theme";

interface CssVariables {
  tokens: (string | undefined)[];
}

const mockCss: CssVariables = { tokens: [] };

jest.mock("uniwind", () => ({
  useUniwind: () => ({ theme: "dark", hasAdaptiveThemes: true }),
  useCSSVariable: () => mockCss.tokens,
}));

describe("useNavigationTheme", () => {
  it("colours headers and tabs from the tokens", async () => {
    mockCss.tokens = ["#9cc78e", "#141811", "#1c2118", "#ece6d4", "#3a4033", "#ec7f70"];

    const { result } = await renderHook(useNavigationTheme);

    expect(result.current.dark).toBe(true);
    expect(result.current.colors).toEqual({
      primary: "#9cc78e",
      background: "#141811",
      card: "#1c2118",
      text: "#ece6d4",
      border: "#3a4033",
      notification: "#ec7f70",
    });
  });

  it("keeps the base theme colour for a missing token", async () => {
    mockCss.tokens = [undefined, "#141811"];

    const { result } = await renderHook(useNavigationTheme);

    expect(result.current.colors.primary).toBe(DarkTheme.colors.primary);
    expect(result.current.colors.background).toBe("#141811");
  });

  it("sets header titles in the caption face", async () => {
    const { result } = await renderHook(useNavigationTheme);

    expect(result.current.fonts.medium.fontFamily).toBe("Alegreya_400Regular_Italic");
  });
});

import { Text } from "@/ui";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { BottomTabBarHeightContext } from "expo-router/js-tabs";
import { HeaderHeightContext } from "expo-router/react-navigation";
import type * as ReactModule from "react";
import type { ReactNode } from "react";
import { DeviceEventEmitter } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { ModalFrame } from "@/components/modal-frame";
import { NavRow } from "@/components/nav-row";
import { Screen } from "@/components/screen";
import { DefaultDetail, hrefPath, TwoPane } from "@/components/two-pane";

const mockShell = { wide: true, pathname: "/notes", depth: 1 };
const mockSetOptions = jest.fn();

// Each rendered Link's `replace`.
const mockReplaces: boolean[] = [];

jest.mock("@/hooks/use-is-wide", () => ({ useIsWide: () => mockShell.wide }));

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof ReactModule>("react");

  return {
    usePathname: () => mockShell.pathname,
    useNavigation: () => ({ setOptions: mockSetOptions }),
    useRoute: () => ({ key: "here" }),
    // Focus starts and ends with the mount, which is all these components need.
    useFocusEffect: (effect: () => () => void) => useEffect(effect, [effect]),
    Link: ({ children, replace }: { children: ReactNode; replace: boolean }) => {
      mockReplaces.push(replace);

      return children;
    },
  };
});

jest.mock("expo-router/react-navigation", () => ({
  ...jest.requireActual<object>("expo-router/react-navigation"),
  useNavigationState: (pick: (state: { routes: { key: string }[] }) => number) =>
    pick({
      routes: Array.from({ length: mockShell.depth + 1 }, (_, index) => ({
        key: index === mockShell.depth ? "here" : `below-${index}`,
      })),
    }),
}));

beforeEach(() => {
  Object.assign(mockShell, { wide: true, pathname: "/notes", depth: 1 });
  mockSetOptions.mockClear();
  mockReplaces.length = 0;
});

const INSETS = { top: 0, left: 0, right: 0, bottom: 24 };

describe("Screen", () => {
  it("keeps the last control clear of the gesture bar on a stack screen", async () => {
    await render(
      <SafeAreaInsetsContext value={INSETS}>
        <Screen>
          <Text>Form</Text>
        </Screen>
      </SafeAreaInsetsContext>,
    );

    expect(screen.getByTestId("screen-scroll")).toHaveProp("contentContainerStyle", {
      paddingBottom: 40,
    });
  });

  it("leaves the gesture bar to the bottom tab bar", async () => {
    await render(
      <SafeAreaInsetsContext value={INSETS}>
        <BottomTabBarHeightContext value={73}>
          <Screen>
            <Text>List</Text>
          </Screen>
        </BottomTabBarHeightContext>
      </SafeAreaInsetsContext>,
    );

    expect(screen.getByTestId("screen-scroll")).toHaveProp("contentContainerStyle", {
      paddingBottom: 16,
    });
  });

  it("lifts the page above the keyboard, measured from below the header", async () => {
    await render(
      <HeaderHeightContext value={64}>
        <Screen>
          <Text>Form</Text>
        </Screen>
      </HeaderHeightContext>,
    );

    const avoider = screen.getByTestId("screen-keyboard-avoider");

    const keyboard = {
      duration: 0,
      endCoordinates: { screenX: 0, screenY: 600, width: 390, height: 300 },
    };

    // The keyboard's top meets the view's measured bottom, so the padding is the header offset alone.
    await fireEvent(avoider, "layout", {
      persist: jest.fn(),
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 600 } },
    });
    await act(() => {
      DeviceEventEmitter.emit("keyboardWillShow", keyboard);
      DeviceEventEmitter.emit("keyboardDidShow", keyboard);
    });

    expect(avoider).toHaveStyle({ paddingBottom: 64 });
  });
});

describe("ModalFrame", () => {
  it("lifts a form's pinned Save above the keyboard", async () => {
    await render(
      <SafeAreaInsetsContext value={INSETS}>
        <ModalFrame title="Log habits" variant="side-sheet">
          <Text>Save</Text>
        </ModalFrame>
      </SafeAreaInsetsContext>,
    );

    const avoider = screen.getByTestId("modal-keyboard-avoider");

    const keyboard = {
      duration: 0,
      endCoordinates: { screenX: 0, screenY: 500, width: 390, height: 400 },
    };

    await fireEvent(avoider, "layout", {
      persist: jest.fn(),
      nativeEvent: { layout: { x: 0, y: 60, width: 390, height: 600 } },
    });
    await act(() => {
      DeviceEventEmitter.emit("keyboardWillShow", keyboard);
      DeviceEventEmitter.emit("keyboardDidShow", keyboard);
    });

    expect(avoider).toHaveStyle({ paddingBottom: 160 });
  });
});

const notes = (detail: ReactNode) => (
  <TwoPane
    list={
      <>
        <NavRow href="/health-plan" label="Health plan" />
        <NavRow href={{ pathname: "/parts" }} label="Parts" />
      </>
    }
  >
    {detail}
  </TwoPane>
);

const row = (name: string) => screen.getByRole("link", { name });

describe("TwoPane", () => {
  it("marks the open row beside its detail, and the parent row of a page under it", async () => {
    mockShell.pathname = "/parts/5";
    await render(notes(null));

    expect(row("Parts")).toBeSelected();
    expect(row("Health plan")).not.toBeSelected();
  });

  it("marks the default detail's row while it stands in for an empty pane", async () => {
    await render(
      notes(
        <DefaultDetail href="/health-plan">
          <Text>The plan</Text>
        </DefaultDetail>,
      ),
    );

    expect(screen.getByText("The plan")).toBeOnTheScreen();
    expect(row("Health plan")).toBeSelected();
  });

  it("swaps the detail from a list row instead of stacking it", async () => {
    await render(notes(null));

    expect(mockReplaces).toEqual([true, true]);
  });

  it("hides Up on the first detail beside the list", async () => {
    await render(notes(<Screen>{null}</Screen>));

    expect(mockSetOptions).toHaveBeenCalledWith(
      expect.objectContaining({ headerBackVisible: false }),
    );
  });

  it("keeps Up on a page opened from inside a detail", async () => {
    mockShell.depth = 2;
    await render(notes(<Screen>{null}</Screen>));

    expect(mockSetOptions).toHaveBeenCalledWith({
      headerBackVisible: true,
      headerLeft: undefined,
    });
  });

  it("leaves a phone's Up arrow alone and shows no list", async () => {
    mockShell.wide = false;
    await render(
      notes(
        <DefaultDetail href="/health-plan">
          <Screen>{null}</Screen>
        </DefaultDetail>,
      ),
    );

    expect(screen.queryByTestId("list-pane")).not.toBeOnTheScreen();
    expect(mockSetOptions).not.toHaveBeenCalled();
  });
});

describe("NavRow", () => {
  it("is never marked open outside a list pane, and pushes", async () => {
    mockShell.pathname = "/health-plan";
    await render(<NavRow href="/health-plan" label="Open the Health plan" />);

    expect(screen.getByRole("link", { name: "Open the Health plan" })).not.toBeSelected();
    expect(mockReplaces).toEqual([false]);
  });
});

describe("hrefPath", () => {
  it.each([
    ["/connections/3", "/connections/3"],
    [{ pathname: "/parts/[id]", params: { id: "5" } }, "/parts/5"],
    [{ pathname: "/parts" }, "/parts"],
  ] as const)("resolves %j to %s", (href, path) => {
    expect(hrefPath(href)).toBe(path);
  });
});

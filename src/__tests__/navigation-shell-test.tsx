import {
  act,
  fireEvent,
  renderRouter,
  screen,
  testRouter,
  waitFor,
  within,
} from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import { Uniwind } from "uniwind";

import type * as ReactModule from "react";

import type * as LogData from "@/lib/data/log";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setOnline } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";

jest.mock("@/lib/data/data-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockDataProvider(),
);

jest.mock("@/lib/auth/auth-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockAuthProvider(),
);

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockUniwind(),
);

// Screens stay loading: no request ever answers.
jest.mock("@/lib/api/api-fetch", () => ({
  apiFetch: () => Promise.withResolvers<never>().promise,
}));

// One cached person stands in for the API, so the Connections routes have content.
jest.mock("@/lib/data/connections", () => {
  const sam = {
    id: 3,
    name: "Sam",
    closeness: "friend",
    circles: [],
    cadenceDays: null,
    lastContactedOn: null,
    followUps: "",
    howWeMet: "",
    metThrough: null,
    introduced: [],
    links: [],
    meetups: [],
    dates: [],
    growCloser: false,
    planCheckedAt: null,
  };

  const idle = { mutate: jest.fn(), isPending: false, isError: false };

  return {
    useConnections: () => ({ data: { connections: [sam] } }),
    useConnection: () => ({ connection: { ...sam, title: "Sam", body: "", interactions: [] } }),
    useConnectionSearch: () => ({ data: [] }),
    useLogInteraction: () => jest.fn(),
    useEditInteraction: () => idle,
    useDeleteInteraction: () => idle,
    useCreateConnection: () => idle,
    useUpdateConnection: () => idle,
    useSaveConnectionNotes: () => idle,
  };
});

jest.mock("@/lib/data/log", () => ({
  ...jest.requireActual<typeof LogData>("@/lib/data/log"),
  draftLog: () => Promise.resolve({ type: "entries", entries: [{ habit: null }] }),
}));

const mockWindow = { width: 390 };

// Records the styles of the mounted StatusBars; the last mounted one sets the icons.
const mockStatusBarStyles = new Set<string>();

jest.mock("expo-status-bar", () => ({
  ...jest.requireActual<object>("expo-status-bar"),
  StatusBar: ({ style }: { style: string }) => {
    jest.requireActual<typeof ReactModule>("react").useEffect(() => {
      mockStatusBarStyles.add(style);

      return () => {
        mockStatusBarStyles.delete(style);
      };
    }, [style]);

    return null;
  },
}));

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWindow.width, height: 900, scale: 1, fontScale: 1 }),
}));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

afterEach(resetRouteMocks);

// Jest renders iOS, where a tab is a button named by its label.
const tab = (name: string) => screen.getByRole("button", { name });

describe("phone layout", () => {
  beforeEach(() => {
    mockWindow.width = 390;
  });

  it("opens on Check-in with two tabs and the log composer", async () => {
    await renderRouter(APP_DIR);

    expect(screen).toHavePathname("/");
    expect(tab("Check-in")).toBeOnTheScreen();
    expect(tab("Today")).toBeOnTheScreen();
    expect(screen.getByLabelText("Log something")).toBeOnTheScreen();
  });

  it("hides the other pages' tabs", async () => {
    await renderRouter(APP_DIR);

    for (const name of ["Habits", "Check-ins"]) {
      expect(screen.queryByRole("button", { name })).not.toBeOnTheScreen();
    }
  });

  it("opens every page from the sidebar and marks the open one", async () => {
    await renderRouter(APP_DIR);

    await userEvent.press(screen.getByRole("button", { name: "Open sidebar" }));
    const sidebar = within(screen.getByTestId("sidebar"));

    expect(sidebar.getByRole("link", { name: "Check-in" })).toBeSelected();
    expect(sidebar.getAllByRole("link")).toHaveLength(9);

    await userEvent.press(sidebar.getByRole("link", { name: "Habits" }));

    expect(screen).toHavePathname("/habits");
    expect(screen.queryByTestId("sidebar")).not.toBeOnTheScreen();
  });

  it("closes the sidebar from the scrim and from Back", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/notes" });

    await userEvent.press(screen.getByRole("button", { name: "Open sidebar" }));
    await userEvent.press(screen.getByRole("button", { name: "Close sidebar" }));
    expect(screen.queryByTestId("sidebar")).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Open sidebar" }));
    // The Modal hears Back as requestClose, which bubbles up from inside it.
    await fireEvent(screen.getByLabelText("Sidebar"), "requestClose");
    expect(screen.queryByTestId("sidebar")).not.toBeOnTheScreen();
  });

  it.each([
    ["/habits", "New habit"],
    ["/check-ins", "Write Session brief"],
    ["/connections", "Sam"],
    ["/notes", "Health plan"],
  ])("shows the %s tab", async (url, text) => {
    await renderRouter(APP_DIR, { initialUrl: url });

    expect(screen).toHavePathname(url);
    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it("switches tabs from the tab bar", async () => {
    await renderRouter(APP_DIR);

    await userEvent.press(tab("Today"));

    expect(screen).toHavePathname("/today");
  });

  it.each([
    ["/log", "Log"],
    ["/log-entry", "Log habits"],
    ["/one-off", "New One-off"],
    ["/habit/new", "New habit"],
    ["/habit/7", "Edit habit"],
  ])("opens %s as a modal with a close button", async (url, title) => {
    await renderRouter(APP_DIR, { initialUrl: url });

    expect(screen.getByRole("heading", { name: title })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Close" })).toBeOnTheScreen();
  });

  it("closes a deep-linked modal back to Today", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/log" });

    await userEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(screen).toHavePathname("/");
  });

  it("sends from the composer and opens the log form", async () => {
    await renderRouter(APP_DIR);

    await userEvent.paste(screen.getByLabelText("Log something"), "walked 20 min");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen).toHavePathname("/log-entry"));
    expect(screen.getByRole("heading", { name: "Log habits" })).toBeOnTheScreen();
  });

  it("opens the Habit editor from Habits", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    await userEvent.press(screen.getByText("New habit"));

    expect(screen).toHavePathname("/habit/new");
  });

  it.each([
    ["/plan", /Reading your tasks/],
    ["/session-brief", /Nothing here is saved/],
    ["/connections/3", /Reached out/],
  ])("routes %s to its screen", async (url, text) => {
    await renderRouter(APP_DIR, { initialUrl: url });

    expect(screen).toHavePathname(url);
    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it("pushes a Connection over the list and goes back", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    await userEvent.press(screen.getByText("Sam"));
    expect(screen).toHavePathname("/connections/3");

    await testRouter.back();
    expect(screen).toHavePathname("/connections");
  });

  it("hands the device insets to Uniwind for its safe-area classes", async () => {
    const updateInsets = jest.spyOn(Uniwind, "updateInsets");
    const insets = { top: 24, right: 0, bottom: 16, left: 0 };
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    const frame = { x: 0, y: 0, width: 390, height: 900 };
    await fireEvent(screen.getByTestId("safe-area-listener"), "insetsChange", {
      nativeEvent: { insets, frame },
    });

    expect(updateInsets).toHaveBeenCalledWith(insets);
  });

  it("shows the offline bar on every screen while offline and hides it online", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/habits" });
    expect(screen.queryByText("Offline")).not.toBeOnTheScreen();

    await act(() => setOnline(false));
    expect(screen.getByText("Offline")).toBeOnTheScreen();
    expect(mockStatusBarStyles).toContain("inverted");

    await userEvent.press(tab("Today"));
    expect(screen.getByText("Offline")).toBeOnTheScreen();

    await act(() => setOnline(true));
    expect(screen.queryByText("Offline")).not.toBeOnTheScreen();
    expect(mockStatusBarStyles).not.toContain("inverted");
  });

  it("spreads the bottom tabs across the width", async () => {
    await renderRouter(APP_DIR);

    expect(tab("Today").parent).not.toHaveStyle({ maxWidth: 144 });
  });

  it("sets tab labels at 13px and caps how far large system text grows them", async () => {
    await renderRouter(APP_DIR);

    const label = within(tab("Today")).getByText("Today");

    expect(label).toHaveStyle({ fontSize: 13, lineHeight: 16 });
    expect(label).toHaveProp("maxFontSizeMultiplier", 1.3);
    // The bar grows past React Navigation's 49dp, so the capped label fits under the icon.
    expect(tab("Today").parent?.parent?.parent).toHaveStyle({ height: 60 });
  });

  it("shows no list pane", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    expect(screen.queryByTestId("list-pane")).not.toBeOnTheScreen();
  });
});

describe("wide layout", () => {
  beforeEach(() => {
    mockWindow.width = 1024;
  });

  it("lists every page in a sidebar beside the page, with no tab bar or menu button", async () => {
    await renderRouter(APP_DIR);

    expect(screen.queryByRole("button", { name: "Today" })).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Open sidebar" })).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole("link", { name: "Today" }));

    expect(screen).toHavePathname("/today");
    expect(screen.getByTestId("sidebar")).toBeOnTheScreen();
  });

  it("marks a page's sidebar link on its child pages too", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    const sidebar = within(screen.getByTestId("sidebar"));

    expect(sidebar.getByRole("link", { name: "Connections" })).toBeSelected();
    expect(sidebar.getByRole("link", { name: "Check-in" })).not.toBeSelected();
  });

  it("opens Notes on the Health plan beside the list, with its row marked", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/notes" });

    const list = within(screen.getByTestId("list-pane"));

    expect(list.getByRole("link", { name: /^Health plan/ })).toBeSelected();
    expect(screen.getByRole("link", { name: /^Session brief/ })).toBeOnTheScreen();
  });

  it("shows the Connections list beside the picked Connection", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    expect(screen.getByTestId("list-pane")).toBeOnTheScreen();
    expect(screen.getByText("Pick a Connection.")).toBeOnTheScreen();

    await userEvent.press(screen.getByText("Sam"));

    expect(screen).toHavePathname("/connections/3");
    expect(screen.getByTestId("list-pane")).toBeOnTheScreen();
  });
});

import type { CheckIn, PartListRow, PartRef } from "@/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, userEvent } from "@testing-library/react-native";
import { renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NewPartButton } from "@/components/new-part-button";
import { ApiError } from "@/lib/api/errors";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import {
  preloadRoutes,
  resetRouteMocks,
  routeQueryClient,
  setOnline,
  setRouteQueryClient,
} from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, reply } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn } from "../../jest/fixtures";

jest.mock("@/lib/data/data-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockDataProvider(),
);

jest.mock("@/lib/auth/auth-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockAuthProvider(),
);

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockUniwind(),
);

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

beforeEach(() => {
  setRouteQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
});

afterEach(resetRouteMocks);

const part = (over: Partial<PartListRow> & Pick<PartListRow, "id" | "name">): PartListRow => ({
  role: "unknown",
  wants: "",
  fears: "",
  feltIn: "",
  description: "",
  retired: false,
  createdAt: "2026-11-10T00:00:00.000Z",
  recentCheckIns: 0,
  ...over,
});

const PARTS = [
  part({ id: 1, name: "Doer", role: "manager", recentCheckIns: 3 }),
  part({
    id: 2,
    name: "Child",
    role: "exile",
    wants: "company",
    description: "Fears being **left**",
    recentCheckIns: 1,
  }),
  part({ id: 3, name: "Wolf" }),
  part({ id: 4, name: "Old one", retired: true }),
];

const CHECK_INS: CheckIn[] = [
  checkIn({ id: 10, inControl: { id: 2, name: "Child" }, note: "after the call" }),
  checkIn({ id: 11, inControl: "Self", parts: [{ id: 2, name: "Child" }] }),
];

function serveParts(used = true, extra: Parameters<typeof fakeApi>[0] = {}) {
  const { recentCheckIns: _count, ...child } = PARTS[1] ?? part({ id: 2, name: "Child" });

  return fakeApi({
    "/api/parts": reply({ parts: PARTS }),
    "/api/parts/2": reply({ part: child, checkIns: used ? CHECK_INS : [], used }),
    "/api/check-ins": reply({ checkIns: [] }),
    // SAFETY: useUpdatePart is the only PATCH here, and it sends an object of Part fields.
    "PATCH /api/parts/2": ({ body }) => ({ part: { ...child, ...(body as object) } }),
    ...extra,
  });
}

describe("Parts list", () => {
  it("groups Parts by role, retired last, each with its Check-ins over 30 days", async () => {
    serveParts();
    await renderRouter(APP_DIR, { initialUrl: "/parts" });

    expect(await screen.findByText("Manager")).toBeOnTheScreen();

    for (const heading of ["Exile", "Not yet known", "Retired"])
      expect(screen.getByText(heading)).toBeOnTheScreen();
    expect(screen.getByText("3 Check-ins in 30 days")).toBeOnTheScreen();
    expect(screen.getByText("1 Check-in in 30 days")).toBeOnTheScreen();
  });

  it("says how to add one when there are none", async () => {
    fakeApi({ "/api/parts": reply({ parts: [] }) });
    await renderRouter(APP_DIR, { initialUrl: "/parts" });

    expect(await screen.findByText("No parts yet. Name one on a Check-in.")).toBeOnTheScreen();
  });

  it("is linked from the Notes tab", async () => {
    fakeApi({
      "/api/notes/goals": reply({ items: [] }),
      "/api/notes/reflections": reply({ items: [] }),
      "/api/notes/health-records": reply({ items: [] }),
      "/api/habits": reply({ habits: [] }),
    });
    await renderRouter(APP_DIR, { initialUrl: "/notes" });

    expect(screen.getByRole("link", { name: /Parts/ })).toBeOnTheScreen();
  });
});

describe("Part page", () => {
  it("edits the Part and lists the Check-ins that named it", async () => {
    const { writes } = serveParts();

    await renderRouter(APP_DIR, { initialUrl: "/parts/2" });

    await userEvent.paste(await screen.findByLabelText("Name"), "Little one");
    await userEvent.press(
      within(screen.getByLabelText("Role")).getByRole("radio", { name: "Protector" }),
    );
    await userEvent.paste(
      screen.getByLabelText("What does it fear would happen if it stopped?"),
      "being alone",
    );
    await userEvent.paste(screen.getByLabelText("Where do I feel it in my body?"), "throat");
    await userEvent.press(screen.getByRole("button", { name: "Save part" }));

    await waitFor(() =>
      expect(writes).toContainEqual({
        path: "/api/parts/2",
        method: "PATCH",
        body: {
          name: "Little one",
          role: "protector",
          wants: "company",
          fears: "being alone",
          feltIn: "throat",
          description: "Fears being **left**",
        },
      }),
    );
    expect(screen.queryByLabelText("Age")).not.toBeOnTheScreen();
    expect(await screen.findByText("Saved.")).toBeOnTheScreen();
    expect(screen.getAllByText(/In control$/)).toHaveLength(1);
    expect(screen.getAllByText(/Present$/)).toHaveLength(1);
    expect(screen.getByText("after the call")).toBeOnTheScreen();
  });

  it("retires the Part", async () => {
    const { writes } = serveParts();

    await renderRouter(APP_DIR, { initialUrl: "/parts/2" });
    await userEvent.press(await screen.findByRole("button", { name: "Retire part" }));

    await waitFor(() =>
      expect(writes).toContainEqual({
        path: "/api/parts/2",
        method: "PATCH",
        body: { retired: true },
      }),
    );
    expect(screen.queryByRole("button", { name: "Delete part" })).not.toBeOnTheScreen();
  });

  it("brings a retired Part back", async () => {
    const { recentCheckIns: _count, ...child } = PARTS[1] ?? part({ id: 2, name: "Child" });

    const { writes } = serveParts(true, {
      "/api/parts/2": reply({
        part: { ...child, retired: true },
        checkIns: CHECK_INS,
        used: true,
      }),
    });

    await renderRouter(APP_DIR, { initialUrl: "/parts/2" });
    await userEvent.press(await screen.findByRole("button", { name: "Bring back" }));

    await waitFor(() =>
      expect(writes).toContainEqual({
        path: "/api/parts/2",
        method: "PATCH",
        body: { retired: false },
      }),
    );
  });

  it("deletes a Part no Check-in names, goes back to the list, and Undo saves it again", async () => {
    const kept = PARTS.filter(({ id }) => id !== 2);

    const { writes } = serveParts(false, {
      "DELETE /api/parts/2": () => null,
      "POST /api/parts": () => ({ part: { ...PARTS[1], id: 9 } }),
      "/api/parts": () => ({ parts: writes.length > 0 ? kept : PARTS }),
    });

    await renderRouter(APP_DIR, { initialUrl: "/parts" });
    await userEvent.press(await screen.findByRole("link", { name: /Child/ }));
    await userEvent.press(await screen.findByRole("button", { name: "Delete part" }));

    await waitFor(() => expect(screen).toHavePathname("/parts"));
    expect(screen.queryByRole("link", { name: /Child/ })).toBeNull();
    expect(writes).toContainEqual({ path: "/api/parts/2", method: "DELETE" });
    expect(within(screen.getByTestId("toast")).getByText("Deleted · Child")).toBeOnTheScreen();

    await userEvent.press(
      within(screen.getByTestId("toast")).getByRole("button", { name: "Undo" }),
    );

    await waitFor(() =>
      expect(writes.at(-1)).toEqual({
        path: "/api/parts",
        method: "POST",
        body: {
          name: "Child",
          role: "exile",
          wants: "company",
          fears: "",
          feltIn: "",
          description: "Fears being **left**",
        },
      }),
    );
  });

  it("brings a deleted retired Part back retired, and offers Undo again when that fails", async () => {
    const { recentCheckIns: _count, ...child } = PARTS[1] ?? part({ id: 2, name: "Child" });
    const posts: unknown[] = [];

    const { writes } = serveParts(false, {
      "/api/parts/2": reply({
        part: { ...child, retired: true },
        checkIns: [],
        used: false,
      }),
      "DELETE /api/parts/2": () => null,
      "POST /api/parts": () => {
        posts.push(null);

        if (posts.length === 1) throw new ApiError(500, null);

        return { part: { ...child, id: 9 } };
      },
      "PATCH /api/parts/9": () => ({ part: { ...child, id: 9, retired: true } }),
    });

    // A Part opened from a link has no list cached, so there is nothing to drop it from.
    routeQueryClient().removeQueries({ queryKey: ["parts"], exact: true });
    await renderRouter(APP_DIR, { initialUrl: "/parts/2" });
    await userEvent.press(await screen.findByRole("button", { name: "Delete part" }));
    await userEvent.press(
      await within(await screen.findByTestId("toast")).findByRole("button", { name: "Undo" }),
    );

    expect(
      await within(screen.getByTestId("toast")).findByText("Couldn't undo · Child"),
    ).toBeOnTheScreen();

    await userEvent.press(
      within(screen.getByTestId("toast")).getByRole("button", { name: "Undo" }),
    );

    await waitFor(() =>
      expect(writes.at(-1)).toEqual({
        path: "/api/parts/9",
        method: "PATCH",
        body: { retired: true },
      }),
    );
  });

  it("says so when deleting fails", async () => {
    serveParts(false, {
      "DELETE /api/parts/2": reply(new ApiError(409, { error: "a Check-in names this part" })),
    });
    await renderRouter(APP_DIR, { initialUrl: "/parts/2" });
    await userEvent.press(await screen.findByRole("button", { name: "Delete part" }));

    expect(await screen.findByText("Couldn't delete the part. Try again.")).toBeOnTheScreen();
  });

  it("shows a taken name as a conflict", async () => {
    serveParts();
    fakeApi({
      "/api/parts/2": reply({
        part: { ...PARTS[1], recentCheckIns: undefined },
        checkIns: [],
        used: false,
      }),
      "/api/parts": reply({ parts: PARTS }),
      "PATCH /api/parts/2": reply(new ApiError(409, { error: "a part with that name exists" })),
    });

    await renderRouter(APP_DIR, { initialUrl: "/parts/2" });
    await userEvent.press(await screen.findByRole("button", { name: "Save part" }));

    expect(await screen.findByText("A part with that name exists.")).toBeOnTheScreen();
    expect(screen.getByText("No Check-in names this part yet.")).toBeOnTheScreen();
  });

  it("disables editing offline", async () => {
    serveParts();
    setOnline(false);

    await renderRouter(APP_DIR, { initialUrl: "/parts/2" });

    expect(await screen.findByText("Editing needs a connection.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save part" })).toBeDisabled();
  });

  it("says so when the Part is retired", async () => {
    const retired = part({ id: 4, name: "Old one", retired: true });

    fakeApi({
      "/api/parts/4": reply({
        part: { ...retired, recentCheckIns: undefined },
        checkIns: [],
        used: false,
      }),
    });

    await renderRouter(APP_DIR, { initialUrl: "/parts/4" });

    expect(await screen.findByText("Retired: hidden from the Check-in.")).toBeOnTheScreen();
  });
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 900 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderButton(onCreated: (part: PartRef) => void) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <NewPartButton onCreated={onCreated} />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe("New part…", () => {
  it("opens the Part form, creates the Part and hands it back by reference", async () => {
    const onCreated = jest.fn();

    const { writes } = fakeApi({
      "POST /api/parts": () => ({ part: part({ id: 9, name: "Critic", role: "manager" }) }),
    });

    await renderButton(onCreated);
    await userEvent.press(screen.getByRole("button", { name: "New part…" }));
    expect(screen.getByRole("button", { name: "Save part" })).toBeDisabled();
    await userEvent.paste(screen.getByLabelText("Name"), "Critic");
    await userEvent.press(screen.getByRole("radio", { name: "Manager" }));
    await userEvent.press(screen.getByRole("button", { name: "Save part" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 9, name: "Critic" }));
    expect(writes).toEqual([
      {
        path: "/api/parts",
        method: "POST",
        body: {
          name: "Critic",
          role: "manager",
          wants: "",
          fears: "",
          feltIn: "",
          description: "",
        },
      },
    ]);
    expect(screen.queryByRole("button", { name: "Save part" })).not.toBeOnTheScreen();
  });

  it("keeps the form open on a failed save, and Cancel closes it", async () => {
    const onCreated = jest.fn();

    fakeApi({ "POST /api/parts": reply(new Error("offline")) });

    await renderButton(onCreated);
    await userEvent.press(screen.getByRole("button", { name: "New part…" }));
    await userEvent.paste(screen.getByLabelText("Name"), "Critic");
    await userEvent.press(screen.getByRole("button", { name: "Save part" }));

    expect(await screen.findByText("Couldn't save the part. Try again.")).toBeOnTheScreen();
    expect(onCreated).not.toHaveBeenCalled();

    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Save part" })).not.toBeOnTheScreen();
  });
});

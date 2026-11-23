import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { ScreenTimeDays, UsageAccessPrompt } from "@/components/screen-time";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, pendingApi, reply } from "../../../jest/fake-api";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

interface AccessState {
  access: { granted: boolean; open: () => void } | null;
}

const mockAccess: AccessState = { access: null };

jest.mock("@/lib/screen-time/screen-time", () => ({
  useUsageAccess: () => mockAccess.access,
}));

const show = (node: ReactNode) =>
  render(<QueryClientProvider client={createQueryClient()}>{node}</QueryClientProvider>);

describe("ScreenTimeDays", () => {
  it("lists the last 7 Days, newest first, saying which no device sent", async () => {
    fakeApi({
      "/api/screen-time?from=2026-11-06": reply({
        days: [
          { day: "2026-11-11", minutes: 161 },
          { day: "2026-11-12", minutes: 45 },
        ],
      }),
    });

    await show(<ScreenTimeDays today="2026-11-12" />);

    expect(await screen.findByText("Today")).toBeOnTheScreen();
    expect(screen.getByText("45 m")).toBeOnTheScreen();
    expect(screen.getByText("Wed, Nov 11")).toBeOnTheScreen();
    expect(screen.getByText("2 h 41 m")).toBeOnTheScreen();
    expect(screen.getAllByText("Not sent")).toHaveLength(5);
  });

  it("shows nothing until the Days load", async () => {
    pendingApi();

    await show(<ScreenTimeDays today="2026-11-12" />);

    expect(screen.queryByText("Today")).toBeNull();
  });
});

describe("UsageAccessPrompt", () => {
  it("links a phone without Usage access to its setting", async () => {
    const open = jest.fn();
    mockAccess.access = { granted: false, open };

    await show(<UsageAccessPrompt />);
    await userEvent.press(screen.getByText("Open Usage access"));

    expect(open).toHaveBeenCalled();
  });

  it.each([
    ["granted", { granted: true, open: jest.fn() }],
    ["off Android", null],
  ])("stays quiet when %s", async (_case, access) => {
    mockAccess.access = access;

    await show(<UsageAccessPrompt />);

    expect(screen.queryByText("Open Usage access")).toBeNull();
  });
});

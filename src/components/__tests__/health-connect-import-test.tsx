import type { HealthConnectSource } from "@/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";

import { HealthConnectImport } from "@/components/habits/health-connect-import";
import { createQueryClient } from "@/lib/data/query-client";
import type { HealthConnectAutoLog, LinkResult } from "@/lib/health/health-connect-auto-log";
import type * as AutoLogModule from "@/lib/health/health-connect-auto-log";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../../jest/fake-api";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

// Stands in for the Android link; the last test swaps in the off-Android stub's null.
jest.mock("@/lib/health/health-connect-auto-log", () => ({
  healthConnectAutoLog: { linkedHabit: jest.fn(), link: jest.fn(), unlink: jest.fn() },
}));

const mocked = jest.requireMock<{ healthConnectAutoLog: HealthConnectAutoLog | null }>(
  "@/lib/health/health-connect-auto-log",
);

const autoLog = jest.requireMock<{ healthConnectAutoLog: jest.Mocked<HealthConnectAutoLog> }>(
  "@/lib/health/health-connect-auto-log",
).healthConnectAutoLog;

const LINKED: LinkResult = { status: "linked", added: 2 };

function linkedTo(habit: string | null, result = LINKED) {
  const state = { linked: habit };

  autoLog.linkedHabit.mockImplementation(() => Promise.resolve(state.linked));
  autoLog.link.mockImplementation((_source, linked) => {
    state.linked = linked;

    return Promise.resolve(result);
  });
  autoLog.unlink.mockImplementation(() => {
    state.linked = null;

    return Promise.resolve();
  });
}

const show = (source: HealthConnectSource = "calm") =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <HealthConnectImport habit="meditate" source={source} />
    </QueryClientProvider>,
  );

// The button stays disabled until the linked Habit loads from storage.
async function press(name: string) {
  const button = await screen.findByRole("button", { name });

  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.press(button);
}

beforeEach(() => fakeApi());

describe("HealthConnectImport", () => {
  it("links the Habit to Calm and says how many sessions it added", async () => {
    linkedTo(null);
    await show();

    await press("Auto-log Calm sessions");

    expect(await screen.findByText("Added 2 sessions from Calm.")).toBeOnTheScreen();
    expect(autoLog.link).toHaveBeenCalledWith("calm", "meditate", expect.any(Function));
    expect(await screen.findByRole("button", { name: "Stop logging Calm" })).toBeOnTheScreen();
    expect(
      screen.getByText("Calm sessions from Health Connect are logged here when the app opens."),
    ).toBeOnTheScreen();
  });

  it("says one session in the singular", async () => {
    linkedTo(null, { status: "linked", added: 1 });
    await show();

    await press("Auto-log Calm sessions");

    expect(await screen.findByText("Added 1 session from Calm.")).toBeOnTheScreen();
  });

  it.each([
    ["unavailable", "Health Connect isn’t on this phone. Install or update it, then try again."],
    ["denied", "Allow Journal to read Mindfulness in Health Connect, then try again."],
  ] as const)("says why it could not link: %s", async (status, message) => {
    linkedTo(null, { status });
    await show();

    await press("Auto-log Calm sessions");

    expect(await screen.findByText(message)).toBeOnTheScreen();
  });

  it("says so when reading Health Connect fails", async () => {
    linkedTo(null);
    autoLog.link.mockRejectedValue(new Error("SecurityException"));
    await show();

    await press("Auto-log Calm sessions");

    expect(await screen.findByText("Couldn't read Calm sessions. Try again.")).toBeOnTheScreen();
  });

  it("stops logging Calm on a linked Habit", async () => {
    linkedTo("meditate");
    await show();

    await press("Stop logging Calm");

    expect(await screen.findByText("Calm sessions are no longer logged here.")).toBeOnTheScreen();
    expect(autoLog.unlink).toHaveBeenCalledWith("calm");
    expect(await screen.findByRole("button", { name: "Auto-log Calm sessions" })).toBeOnTheScreen();
  });

  it("offers to link a Habit while Calm logs on another one", async () => {
    linkedTo("sit");
    await show();

    expect(await screen.findByRole("button", { name: "Auto-log Calm sessions" })).toBeOnTheScreen();
  });

  it("links the Habit to Hevy's workouts, asking for Exercise access", async () => {
    linkedTo(null, { status: "denied" });
    await show("hevy");

    await press("Auto-log Hevy workouts");

    expect(
      await screen.findByText("Allow Journal to read Exercise in Health Connect, then try again."),
    ).toBeOnTheScreen();
    expect(autoLog.link).toHaveBeenCalledWith("hevy", "meditate", expect.any(Function));
  });

  it("shows nothing off Android, where Health Connect is missing", async () => {
    const stub = jest.requireActual<typeof AutoLogModule>("@/lib/health/health-connect-auto-log");

    mocked.healthConnectAutoLog = stub.healthConnectAutoLog;
    await show();
    mocked.healthConnectAutoLog = autoLog;

    expect(stub.useHealthConnectAutoLog).not.toThrow();
    expect(screen.queryByRole("button")).not.toBeOnTheScreen();
  });
});

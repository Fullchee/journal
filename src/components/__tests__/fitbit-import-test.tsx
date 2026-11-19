import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { FitbitRule, RecordStyle } from "@/core";

import { FitbitImport } from "@/components/habits/fitbit-import";
import { createQueryClient } from "@/lib/data/query-client";
import type { LinkResult } from "@/lib/health/calm-auto-log";
import type {
  FitbitAutoLog,
  FitbitLink,
  FitbitLinks,
  FitbitWriters,
} from "@/lib/health/fitbit-auto-log";
import type * as FitbitAutoLogModule from "@/lib/health/fitbit-auto-log";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../../jest/fake-api";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

// Stands in for the Android link; the last test swaps in the off-Android stub's null.
jest.mock("@/lib/health/fitbit-auto-log", () => ({
  fitbitAutoLog: { links: jest.fn(), link: jest.fn(), setThreshold: jest.fn(), unlink: jest.fn() },
}));

interface WritersState {
  current: FitbitWriters | null;
}

const mockWriters: WritersState = { current: null };

jest.mock("@/lib/health/fitbit-writers", () => ({
  useFitbitWriters: () => mockWriters.current,
}));

const mocked = jest.requireMock<{ fitbitAutoLog: FitbitAutoLog | null }>(
  "@/lib/health/fitbit-auto-log",
);

const autoLog = jest.requireMock<{ fitbitAutoLog: jest.Mocked<FitbitAutoLog> }>(
  "@/lib/health/fitbit-auto-log",
).fitbitAutoLog;

const WRITERS: FitbitWriters = {
  counts: {},
  recordStyles: {},
  check: jest.fn(),
  importDurations: jest.fn(),
};

const LINKED: LinkResult = { status: "linked", added: 2 };

function linkedTo(links: FitbitLinks, result = LINKED) {
  const state = { links };

  autoLog.links.mockImplementation(() => Promise.resolve(state.links));
  autoLog.link.mockImplementation((rule: FitbitRule, link: FitbitLink) => {
    state.links = { ...state.links, [rule]: link };

    return Promise.resolve(result);
  });
  autoLog.setThreshold.mockImplementation((rule: FitbitRule, threshold: number) => {
    const found = state.links[rule];

    if (found) state.links = { ...state.links, [rule]: { ...found, threshold } };

    return Promise.resolve();
  });
  autoLog.unlink.mockImplementation((rule: FitbitRule) => {
    state.links = { ...state.links, [rule]: undefined };

    return Promise.resolve();
  });
}

const show = (record: RecordStyle = "check") =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <FitbitImport habit="walk" record={record} />
    </QueryClientProvider>,
  );

// The button stays disabled until the links load from storage.
async function press(name: string) {
  const button = await screen.findByRole("button", { name });

  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.press(button);
}

const WALK_STEPS: FitbitLinks = { steps: { habit: "walk", threshold: 8000 } };

beforeEach(() => {
  fakeApi();
  jest.clearAllMocks();
  mockWriters.current = WRITERS;
});

describe("FitbitImport", () => {
  it("links a check Habit to Fitbit steps at the default threshold", async () => {
    linkedTo({});
    await show();

    expect(screen.getByLabelText("Steps a day")).toHaveDisplayValue("8000");
    expect(screen.getByLabelText("Hours of sleep")).toHaveDisplayValue("7");
    expect(screen.getByLabelText("Exercise minutes a day")).toHaveDisplayValue("20");

    await press("Complete from Fitbit steps");

    expect(await screen.findByText("Marked 2 Days done from Fitbit.")).toBeOnTheScreen();
    expect(autoLog.link).toHaveBeenCalledWith("steps", { habit: "walk", threshold: 8000 }, WRITERS);
    expect(
      await screen.findByRole("button", { name: "Stop using Fitbit steps" }),
    ).toBeOnTheScreen();
    expect(screen.getByText("Done on Days with 8000 Fitbit steps or more.")).toBeOnTheScreen();
  });

  it("links sleep at the threshold the owner typed and says one Day in the singular", async () => {
    linkedTo({}, { status: "linked", added: 1 });
    await show();

    await userEvent.paste(screen.getByLabelText("Hours of sleep"), "7.5");
    await press("Complete from Fitbit sleep");

    expect(await screen.findByText("Marked 1 Day done from Fitbit.")).toBeOnTheScreen();
    expect(autoLog.link).toHaveBeenCalledWith("sleep", { habit: "walk", threshold: 7.5 }, WRITERS);
    expect(
      await screen.findByText("Done on Days after 7.5 hours of Fitbit sleep or more."),
    ).toBeOnTheScreen();
  });

  it("can't link until the threshold is a number above zero", async () => {
    linkedTo({});
    await show();

    await userEvent.paste(screen.getByLabelText("Exercise minutes a day"), "0");
    await fireEvent(screen.getByLabelText("Exercise minutes a day"), "blur");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Complete from Fitbit steps" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "Complete from Fitbit exercise" })).toBeDisabled();
    expect(autoLog.setThreshold).not.toHaveBeenCalled();

    await userEvent.paste(screen.getByLabelText("Exercise minutes a day"), "25");
    await press("Complete from Fitbit exercise");

    expect(
      await screen.findByText("Done on Days with 25 Fitbit exercise minutes or more."),
    ).toBeOnTheScreen();
  });

  it("can't link until every Habit's history loads", async () => {
    linkedTo({});
    mockWriters.current = null;
    await show();

    await waitFor(() => expect(autoLog.links).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Complete from Fitbit steps" })).toBeDisabled();
  });

  it("saves a new threshold on a linked rule when the owner leaves the field", async () => {
    linkedTo(WALK_STEPS);
    await show();
    await screen.findByText("Done on Days with 8000 Fitbit steps or more.");
    const field = screen.getByLabelText("Steps a day");

    await fireEvent(field, "blur");
    await userEvent.paste(field, "abc");
    await fireEvent(field, "blur");

    expect(autoLog.setThreshold).not.toHaveBeenCalled();

    await userEvent.paste(field, "10000");
    await fireEvent(field, "blur");

    expect(autoLog.setThreshold).toHaveBeenCalledWith("steps", 10_000);
    expect(
      await screen.findByText("Done on Days with 10000 Fitbit steps or more."),
    ).toBeOnTheScreen();
  });

  it("imports exercise minutes on a Duration Habit, with no threshold", async () => {
    linkedTo({}, { status: "linked", added: 3 });
    await show("duration");

    expect(screen.queryByLabelText("Exercise minutes a day")).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Complete from Fitbit steps" })).toBeNull();

    await press("Auto-log Fitbit exercise");

    expect(await screen.findByText("Added 3 sessions from Fitbit.")).toBeOnTheScreen();
    expect(autoLog.link).toHaveBeenCalledWith(
      "exercise",
      { habit: "walk", threshold: 20 },
      WRITERS,
    );
    expect(
      await screen.findByText("Fitbit exercise sessions are logged here when the app opens."),
    ).toBeOnTheScreen();
  });

  it("says one session in the singular", async () => {
    linkedTo({}, { status: "linked", added: 1 });
    await show("duration");

    await press("Auto-log Fitbit exercise");

    expect(await screen.findByText("Added 1 session from Fitbit.")).toBeOnTheScreen();
  });

  it.each([
    ["unavailable", "Health Connect isn’t on this phone. Install or update it, then try again."],
    ["denied", "Allow Journal to read Sleep in Health Connect, then try again."],
  ] as const)("says why it could not link: %s", async (status, message) => {
    linkedTo({}, { status });
    await show();

    await press("Complete from Fitbit sleep");

    expect(await screen.findByText(message)).toBeOnTheScreen();
  });

  it("says so when reading Health Connect fails", async () => {
    linkedTo({});
    autoLog.link.mockRejectedValue(new Error("SecurityException"));
    await show();

    await press("Complete from Fitbit steps");

    expect(await screen.findByText("Couldn't read Fitbit data. Try again.")).toBeOnTheScreen();
  });

  it("stops using Fitbit on a linked rule", async () => {
    linkedTo(WALK_STEPS);
    await show();

    await press("Stop using Fitbit steps");

    expect(await screen.findByText("Fitbit no longer completes this Habit.")).toBeOnTheScreen();
    expect(autoLog.unlink).toHaveBeenCalledWith("steps");
    expect(
      await screen.findByRole("button", { name: "Complete from Fitbit steps" }),
    ).toBeOnTheScreen();
  });

  it("offers to link a Habit while Fitbit completes another one", async () => {
    linkedTo({ steps: { habit: "run", threshold: 12_000 } });
    await show();

    expect(
      await screen.findByRole("button", { name: "Complete from Fitbit steps" }),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Steps a day")).toHaveDisplayValue("8000");
  });

  it("shows nothing for a count Habit", async () => {
    linkedTo({});
    await show("count");

    expect(screen.queryByText("Fitbit")).not.toBeOnTheScreen();
  });

  it.each([
    ["duration", "steps", "This Habit's Record style no longer takes Fitbit steps."],
    ["count", "sleep", "This Habit's Record style no longer takes Fitbit sleep."],
  ] as const)(
    "lets the owner unlink a rule the %s Habit's Record style no longer takes",
    async (record, rule, paused) => {
      linkedTo({ [rule]: { habit: "walk", threshold: 8000 } });
      await show(record);

      expect(await screen.findByText(paused)).toBeOnTheScreen();

      await press(rule === "steps" ? "Stop using Fitbit steps" : "Stop using Fitbit sleep");

      expect(autoLog.unlink).toHaveBeenCalledWith(rule);
      await waitFor(() => expect(screen.queryByText(paused)).not.toBeOnTheScreen());
    },
  );

  it("shows nothing off Android, where Health Connect is missing", async () => {
    const stub = jest.requireActual<typeof FitbitAutoLogModule>("@/lib/health/fitbit-auto-log");

    mocked.fitbitAutoLog = stub.fitbitAutoLog;
    await show();
    mocked.fitbitAutoLog = autoLog;

    expect(stub.useFitbitAutoLog).not.toThrow();
    expect(screen.queryByRole("button")).not.toBeOnTheScreen();
  });
});

import type { Draft, Goal, Habit, Stage } from "@/core";
import { Text } from "@/ui";
import { render, screen, userEvent, waitFor, within } from "@testing-library/react-native";

import { HabitForm } from "@/components/habits/habit-form";
import { pickImage, uploadImage } from "@/lib/image-upload";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../../jest/route-mocks";

jest.mock("@/lib/data/check-ins", () => ({ useCheckInPlaces: () => ["Home", "Gym"] }));

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: () => true }));

interface StageState {
  value: Stage | null;
}

const mockStage: StageState = { value: null };

jest.mock("@/lib/data/streaks", () => ({ useHabitStage: () => mockStage.value }));

afterEach(() => {
  mockStage.value = null;
});

jest.mock("@/lib/image-upload", () => ({ pickImage: jest.fn(), uploadImage: jest.fn() }));

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../../jest/route-mocks").mockUniwind(),
);

const show = async (draft: Draft, extra: { goals?: Goal[]; habits?: Habit[] } = {}) => {
  const update = jest.fn<undefined, [Partial<Draft>]>();

  await render(
    <HabitForm
      draft={draft}
      update={update}
      habits={extra.habits ?? []}
      goals={extra.goals ?? []}
      isDateLocked={false}
      detailsStatus="idle"
      circle={<Text>Circle picker</Text>}
    />,
  );
  await userEvent.press(screen.getByRole("button", { name: /^More(?: · \d+ filled)?$/ }));

  return update;
};

describe("HabitForm under More", () => {
  it("saves a good recurring Habit's Tiny version", async () => {
    const update = await show(habit());

    await userEvent.paste(screen.getByLabelText("Tiny version"), "Put on running shoes");

    expect(update).toHaveBeenCalledWith({ tinyVersion: "Put on running shoes" });
  });

  it("counts a filled Tiny version under More", async () => {
    await show(habit({ tinyVersion: "Put on running shoes" }));

    expect(screen.getByRole("button", { name: "More · 1 filled" })).toBeOnTheScreen();
  });

  it.each([
    ["a bad Habit", { kind: "bad" as const }],
    ["a One-off", { target: { type: "once" as const, count: 1, days: [] } }],
    ["a Reference Habit", { target: { type: "none" as const, count: 7, days: [] } }],
  ])("has no Tiny version for %s", async (_name, over) => {
    await show(habit(over));

    expect(screen.queryByLabelText("Tiny version")).not.toBeOnTheScreen();
  });

  it("names a stacked cue by its id when the Habit is gone", async () => {
    await show(habit({ cueType: "stacked", stackedAfter: "ghost" }));

    expect(screen.getByText(/ghost/)).toBeOnTheScreen();
  });

  it("asks what the Habit comes after, with the bad Habit's time as A time of day", async () => {
    await show(habit({ kind: "bad" }));

    const cues = within(screen.getByLabelText("After what?"));

    for (const label of [
      "A time of day",
      "Another habit",
      "Something I did",
      "A feeling",
      "Being with people",
    ])
      expect(cues.getByRole("button", { name: label })).toBeOnTheScreen();
    expect(screen.queryByLabelText("Comes after habit")).not.toBeOnTheScreen();
    expect(screen.getByText("Pick what it comes after to see it as a sentence.")).toBeOnTheScreen();
  });

  it("picks Another habit without touching the Habit it comes after", async () => {
    const update = await show(habit());

    await userEvent.press(screen.getByRole("button", { name: "Another habit" }));

    expect(update).toHaveBeenCalledWith({ cueType: "stacked" });
  });

  it("clears the Habit it comes after when another cue replaces Another habit", async () => {
    const update = await show(habit({ cueType: "stacked", stackedAfter: "teeth" }), {
      habits: [habit({ id: "teeth", name: "Brush teeth" })],
    });

    await userEvent.press(screen.getByRole("button", { name: "A feeling" }));

    expect(update).toHaveBeenCalledWith({ cueType: "emotion", stackedAfter: null });
  });

  it("picks the Habit it comes after and reads the loop as a sentence", async () => {
    const update = await show(habit({ cueType: "stacked", usualWhen: "19:00" }), {
      habits: [habit({ id: "teeth", name: "Brush teeth" })],
    });

    expect(screen.getByText("Choose the habit this one comes after.")).toBeOnTheScreen();

    await userEvent.press(
      within(screen.getByLabelText("Comes after habit")).getByRole("button", {
        name: "Brush teeth",
      }),
    );

    expect(update).toHaveBeenCalledWith({ stackedAfter: "teeth" });
  });

  it("picks None to clear the Habit it comes after", async () => {
    const update = await show(habit({ cueType: "stacked", stackedAfter: "teeth" }), {
      habits: [habit({ id: "teeth", name: "Brush teeth" })],
    });

    await userEvent.press(
      within(screen.getByLabelText("Comes after habit")).getByRole("button", { name: "None" }),
    );

    expect(update).toHaveBeenCalledWith({ stackedAfter: null });
  });

  it("shows the loop sentence once the Habit has an anchor", async () => {
    await show(habit({ cueType: "stacked", stackedAfter: "teeth", usualWhen: "19:00" }), {
      habits: [habit({ id: "teeth", name: "Brush teeth" })],
    });

    expect(screen.getByText("After “Brush teeth”, I will do “Walk” at 7:00 PM.")).toBeOnTheScreen();
  });

  it("steps a weekly count up", async () => {
    const update = await show(habit({ target: { type: "weekly", count: 3, days: [] } }));

    await userEvent.press(screen.getByRole("button", { name: "More times" }));

    expect(update).toHaveBeenCalledWith({ target: { type: "weekly", count: 4, days: [] } });
  });

  it("steps a monthly count up to 31 and no further", async () => {
    const update = await show(habit({ target: { type: "monthly", count: 30, days: [] } }));
    const group = screen.getByLabelText("Times per month");

    expect(within(group).getByText("times a month")).toBeOnTheScreen();
    await userEvent.press(within(group).getByRole("button", { name: "More times" }));

    expect(update).toHaveBeenCalledWith({ target: { type: "monthly", count: 31, days: [] } });
  });

  it("steps an interval down, but never below every 2 days", async () => {
    const update = await show(habit({ target: { type: "interval", count: 3, days: [] } }));
    const group = screen.getByLabelText("Days apart");

    expect(within(group).getByText("Every")).toBeOnTheScreen();
    await userEvent.press(within(group).getByRole("button", { name: "Fewer days" }));

    expect(update).toHaveBeenCalledWith({ target: { type: "interval", count: 2, days: [] } });
    expect(screen.getByText("Due every 3 days, checked once a day")).toBeOnTheScreen();
  });

  it("disables Fewer days at every 2 days", async () => {
    await show(habit({ target: { type: "interval", count: 2, days: [] } }));

    expect(screen.getByRole("button", { name: "Fewer days" })).toBeDisabled();
  });

  it("moves the count into range when the Frequency changes", async () => {
    const update = await show(habit({ target: { type: "monthly", count: 20, days: [] } }));

    await userEvent.press(
      within(screen.getByLabelText("Frequency")).getByRole("button", { name: "N× a week" }),
    );

    expect(update).toHaveBeenCalledWith({ target: { type: "weekly", count: 7, days: [] } });
  });

  it("marks a retired Goal", async () => {
    await show(habit(), { goals: [{ id: 1, title: "Rest", state: "retired" }] });

    expect(screen.getByRole("button", { name: "Rest (retired)" })).toBeOnTheScreen();
  });

  it("tells a plant's owner it notifies only after a missed day", async () => {
    mockStage.value = "plant";
    await show(habit({ usualWhen: "08:00", alarm: { time: "08:00", kind: "alarm" } }));

    expect(screen.getByText(/Plant Habits notify only after a missed day\./)).toBeOnTheScreen();
  });

  it("shows no alarm sound off Android", async () => {
    await show(habit({ usualWhen: "08:00", alarm: { time: "08:00", kind: "alarm" } }));

    expect(screen.queryByText(/Sound for all alarms/)).not.toBeOnTheScreen();
  });

  it("keeps minutes a day only while the text is digits", async () => {
    const update = await show(habit({ record: "duration", targetMinutes: 30 }));
    const minutes = screen.getByLabelText("Minutes a day");

    await userEvent.paste(minutes, "45");
    expect(update).toHaveBeenLastCalledWith({ targetMinutes: 45 });

    await userEvent.paste(minutes, "abc");
    expect(update).toHaveBeenLastCalledWith({ targetMinutes: null });
  });

  it("shows a blank usual length until one is set, and keeps only digits", async () => {
    const update = await show(
      habit({
        record: "duration",
        targetMinutes: 30,
        optOutFrom: "2026-11-01",
        usualMinutes: null,
      }),
    );

    const usual = screen.getByLabelText("Usual length (minutes)");

    expect(usual).toHaveDisplayValue("");

    await userEvent.paste(usual, "20");
    expect(update).toHaveBeenLastCalledWith({ usualMinutes: 20 });

    await userEvent.paste(usual, "x");
    expect(update).toHaveBeenLastCalledWith({ usualMinutes: null });
  });

  it("adds a picked image to the description", async () => {
    jest.mocked(pickImage).mockResolvedValue({
      uri: "file:///a.png",
      width: 1,
      height: 1,
      fileName: "a.png",
      mimeType: "image/png",
    });
    jest.mocked(uploadImage).mockResolvedValue("https://img/a.png");
    const update = await show(habit());

    await userEvent.press(screen.getByRole("button", { name: "Add image" }));

    await waitFor(() =>
      expect(update.mock.lastCall?.[0].description).toContain("https://img/a.png"),
    );
  });
});

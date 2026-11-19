import { shiftDay, torontoDay, type Draft } from "@/core";
import { Text } from "@/ui";
import { render, screen, userEvent } from "@testing-library/react-native";

import { HabitForm } from "@/components/habits/habit-form";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../jest/android-picker";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";

jest.mock("@/lib/data/check-ins", () => ({ useCheckInPlaces: () => ["Home", "Gym"] }));

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: () => true }));

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockUniwind(),
);

const form = (draft: Draft) => (
  <HabitForm
    draft={draft}
    update={jest.fn()}
    habits={[]}
    goals={[]}
    isDateLocked={false}
    detailsStatus="idle"
    circle={<Text>Circle picker</Text>}
  />
);

const renderForm = (draft: Draft) => render(form(draft));

const more = () => screen.getByRole("button", { name: /^More(?: · \d+ filled)?$/ });

describe("HabitForm", () => {
  it("shows Name, Kind and the schedule with More collapsed, and More toggles the rest", async () => {
    await renderForm(habit());

    expect(screen.getByLabelText("Name")).toBeOnTheScreen();
    expect(screen.getByLabelText("Kind")).toBeOnTheScreen();
    expect(screen.getByLabelText("Frequency")).toBeOnTheScreen();
    expect(screen.getByLabelText("Record")).toBeOnTheScreen();
    expect(more()).toHaveTextContent("More");
    expect(more()).not.toBeExpanded();
    expect(screen.queryByLabelText("Why")).not.toBeOnTheScreen();
    expect(screen.queryByText("Circle picker")).not.toBeOnTheScreen();

    await userEvent.press(more());

    for (const field of [
      "Why",
      "Cue",
      "I will…",
      "Places",
      "Obstacles",
      "Stage",
      "Priority",
      "Description",
    ])
      expect(screen.getByLabelText(field)).toBeOnTheScreen();
    expect(screen.getByText("Circle picker")).toBeOnTheScreen();
    expect(more()).toBeExpanded();

    await userEvent.press(more());

    expect(screen.queryByLabelText("Why")).not.toBeOnTheScreen();
  });

  it("has no Usual spot or reward field", async () => {
    await renderForm(habit({ usualWhere: "the hall", reward: "feel loose" }));
    await userEvent.press(more());

    expect(screen.queryByLabelText("Usual spot")).not.toBeOnTheScreen();
    expect(screen.queryByLabelText("Then I…")).not.toBeOnTheScreen();
    expect(screen.queryByDisplayValue("the hall")).not.toBeOnTheScreen();
    expect(screen.queryByDisplayValue("feel loose")).not.toBeOnTheScreen();
  });

  it("leaves Obstacles off a bad Habit", async () => {
    await renderForm(habit({ kind: "bad", obstacles: ["too tired"] }));
    await userEvent.press(more());

    expect(screen.getByLabelText("Why")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Obstacles")).not.toBeOnTheScreen();
    expect(screen.queryByText("too tired")).not.toBeOnTheScreen();
  });

  it("counts the filled fields under More, leaving out what a bad Habit hides", async () => {
    const filled = {
      why: "Clear head",
      cue: "lunch ends",
      places: ["Gym"],
      goals: [1],
      obstacles: ["rain"],
      replaces: "snack",
    };

    const { rerender } = await renderForm(habit({ ...filled, description: "  " }));

    expect(more()).toHaveTextContent("More · 6 filled");

    await rerender(form(habit({ ...filled, kind: "bad" })));

    expect(more()).toHaveTextContent("More · 4 filled");
  });

  it("counts only Why, Goals and Description on a One-off", async () => {
    await renderForm(
      habit({
        target: { type: "once", count: 1, days: [] },
        why: "Fun",
        routine: "Paddle",
        description: "Map",
      }),
    );

    expect(more()).toHaveTextContent("More · 2 filled");
  });

  it.each([
    ["daily", { type: "daily", count: 7, days: [] }],
    ["days", { type: "days", count: 7, days: [1, 3] }],
    ["weekly", { type: "weekly", count: 3, days: [] }],
  ] as const)("shows Started under the Frequency of a %s Habit", async (_type, target) => {
    await renderForm(habit({ target: { ...target, days: [...target.days] } }));

    expect(screen.getByLabelText("Started: 2026-01-01")).toBeOnTheScreen();
  });

  it.each([
    ["One-off", "once"],
    ["Reference Habit", "none"],
  ] as const)("hides Started on a %s", async (_name, type) => {
    await renderForm(habit({ target: { type, count: 1, days: [] } }));
    await userEvent.press(more());

    expect(screen.queryByLabelText(/^Started: /)).not.toBeOnTheScreen();
  });

  it("changes the draft's start date, at most today, and has no Start date under More", async () => {
    const picker = pickOnAndroid(new Date(2026, 2, 3));
    const update = jest.fn();

    await render(
      <HabitForm
        draft={habit()}
        update={update}
        habits={[]}
        goals={[]}
        isDateLocked={false}
        detailsStatus="idle"
        circle={null}
      />,
    );
    await userEvent.press(screen.getByLabelText("Started: 2026-01-01"));

    expect(update).toHaveBeenCalledWith({ startDate: "2026-03-03" });
    const today = new Date(`${torontoDay(new Date())}T00:00`);

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ maximumDate: today }));

    await userEvent.press(more());

    expect(screen.getAllByLabelText(/^Start/)).toHaveLength(1);
    expect(screen.queryByText("Start date")).not.toBeOnTheScreen();
  });

  it("points to History only when the Habit started before today", async () => {
    const hint = "You can log past days on its History after saving.";
    const today = torontoDay(new Date());
    const { rerender } = await renderForm(habit({ startDate: shiftDay(today, -1) }));

    expect(screen.getByText(hint)).toBeOnTheScreen();

    await rerender(form(habit({ startDate: today })));

    expect(screen.queryByText(hint)).not.toBeOnTheScreen();

    await rerender(form(habit({ startDate: "" })));

    expect(screen.getByLabelText("Started: not picked")).toBeOnTheScreen();
    expect(screen.queryByText(hint)).not.toBeOnTheScreen();
  });

  it("keeps a Scheduled cue’s time in the schedule, even on a Reference", async () => {
    await renderForm(habit({ cueType: "time", target: { type: "none", count: 7, days: [] } }));

    expect(screen.getByRole("button", { name: "Add time" })).toBeOnTheScreen();
    expect(screen.getByText("Choose a time.")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Record")).not.toBeOnTheScreen();
  });
});

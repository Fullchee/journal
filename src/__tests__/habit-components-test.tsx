import { habitDays, shiftDay, torontoDay, type DurationEntry, type Habit } from "@/core";
import { HabitCard, HabitDueRow, HabitWeek } from "@/ui";
import { act, fireEvent, render, screen, userEvent } from "@testing-library/react-native";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../jest/fixtures";

// Saturday noon in Toronto.
const TODAY = new Date("2026-11-07T12:00:00-05:00");
const DAY = torontoDay(TODAY);

type RowOver = Partial<Omit<Parameters<typeof HabitDueRow>[0], "day">> & {
  count?: number;
  entries?: DurationEntry[];
};

// Builds today's day from a stored count or entries, as the Today screen does.
const rowProps = ({
  count = 0,
  entries = [],
  habit: rowHabit = habit(),
  ...over
}: RowOver = {}) => ({
  habit: rowHabit,
  day: habitDays(rowHabit, {
    counts: { [DAY]: { [rowHabit.id]: count } },
    durations: { [DAY]: { [rowHabit.id]: entries } },
  }).on(TODAY),
  time: null,
  onChange: jest.fn(),
  onOpenDay: jest.fn(),
  onOpen: jest.fn(),
  onAddMinutes: jest.fn(),
  ...over,
});

describe("HabitDueRow", () => {
  it.each([
    { name: "Done on an empty day marks it done", button: "done", count: 0, next: 1 },
    { name: "Done on a done day clears it", button: "done", count: 1, next: 0 },
    { name: "Done on a missed day marks it done", button: "done", count: -1, next: 1 },
    { name: "Not done on an empty day marks it missed", button: "not done", count: 0, next: -1 },
    { name: "Not done on a missed day clears it", button: "not done", count: -1, next: 0 },
  ])("on a check Habit, $name", async ({ button, count, next }) => {
    const props = rowProps({ count });
    await render(<HabitDueRow {...props} />);

    await userEvent.press(screen.getByRole("checkbox", { name: `Walk ${button} today` }));

    expect(props.onChange).toHaveBeenCalledWith(next);
  });

  it("checks the button that matches the day", async () => {
    await render(<HabitDueRow {...rowProps({ count: -1 })} />);

    expect(screen.getByRole("checkbox", { name: "Walk done today" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Walk not done today" })).toBeChecked();
  });

  it("shows its time of day, or Any time", async () => {
    const { rerender } = await render(<HabitDueRow {...rowProps({ time: "7:30 AM" })} />);

    expect(screen.getByLabelText("At 7:30 AM")).toBeOnTheScreen();
    await rerender(<HabitDueRow {...rowProps()} />);
    expect(screen.getByLabelText("Any time")).toBeOnTheScreen();
  });

  it("opens the Habit from its name", async () => {
    const props = rowProps();
    await render(<HabitDueRow {...props} />);

    expect(screen.queryByText("Seed")).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole("link", { name: "Open Walk" }));

    expect(props.onOpen).toHaveBeenCalled();
  });

  it("disables the controls when asked", async () => {
    await render(<HabitDueRow {...rowProps({ disabled: true })} />);

    expect(screen.getByRole("checkbox", { name: "Walk done today" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Walk not done today" })).toBeDisabled();
  });

  it("marks an overdue One-off in plain graphite and shows its due day, never scarlet", async () => {
    const portage = habit({
      name: "Portage",
      startDate: "2026-11-02",
      target: { type: "once", count: 1, days: [] },
    });

    await render(<HabitDueRow {...rowProps({ habit: portage, time: "Mon", overdue: true })} />);

    expect(screen.getByText("Overdue")).toHaveProp(
      "className",
      expect.not.stringContaining("destructive"),
    );
    expect(screen.getByText("Mon")).toHaveProp(
      "className",
      expect.not.stringContaining("destructive"),
    );
    expect(screen.getByLabelText("Due Mon")).toBeOnTheScreen();
  });

  it("leaves a Habit that is not overdue unmarked", async () => {
    await render(<HabitDueRow {...rowProps()} />);

    expect(screen.queryByText("Overdue")).not.toBeOnTheScreen();
  });

  it("offers Reschedule only when given one", async () => {
    const onReschedule = jest.fn();
    const { rerender } = await render(<HabitDueRow {...rowProps()} />);

    expect(screen.queryByRole("button", { name: "Reschedule Walk" })).not.toBeOnTheScreen();
    await rerender(<HabitDueRow {...rowProps({ onReschedule })} />);
    await userEvent.press(screen.getByRole("button", { name: "Reschedule Walk" }));

    expect(onReschedule).toHaveBeenCalled();
  });

  it("disables Reschedule with the other controls", async () => {
    await render(<HabitDueRow {...rowProps({ onReschedule: jest.fn(), disabled: true })} />);

    expect(screen.getByRole("button", { name: "Reschedule Walk" })).toBeDisabled();
  });

  it.each([
    { name: "Skip on an empty day asks the caller to skip", count: 0, skipped: true, next: null },
    { name: "Skip on a skipped day clears it", count: -1, skipped: false, next: 0 },
  ])("on a recurring Habit, $name", async ({ count, skipped, next }) => {
    const props = rowProps({ count, onSkip: jest.fn() });
    await render(<HabitDueRow {...props} />);

    await userEvent.press(screen.getByRole("checkbox", { name: "Skip Walk today" }));

    expect(props.onSkip).toHaveBeenCalledTimes(skipped ? 1 : 0);
    expect(props.onChange).toHaveBeenCalledTimes(next === null ? 0 : 1);
    expect(screen.queryByRole("checkbox", { name: "Walk not done today" })).not.toBeOnTheScreen();
  });

  it("runs each screen-reader action on the name, without a button", async () => {
    const props = rowProps({ onSkip: jest.fn() });
    await render(<HabitDueRow {...props} />);
    const name = screen.getByRole("link", { name: "Open Walk" });

    expect(name).toHaveProp("accessibilityActions", [
      { name: "done", label: "Done" },
      { name: "skip", label: "Skip" },
    ]);
    await fireEvent(name, "accessibilityAction", { nativeEvent: { actionName: "skip" } });
    await fireEvent(name, "accessibilityAction", { nativeEvent: { actionName: "done" } });

    expect(props.onSkip).toHaveBeenCalled();
    expect(props.onChange).toHaveBeenCalledWith(1);
  });

  it("gives a bad Habit no Not done", async () => {
    await render(<HabitDueRow {...rowProps({ habit: habit({ kind: "bad" }) })} />);

    expect(screen.queryByRole("checkbox", { name: "Walk not done today" })).not.toBeOnTheScreen();
  });

  it.each([
    { typed: "4", saved: 4 },
    { typed: "0", saved: 0 },
  ])("saves a typed count of $typed on a count Habit", async ({ typed, saved }) => {
    const props = rowProps({ habit: habit({ record: "count" }), count: 2 });
    await render(<HabitDueRow {...props} />);

    const field = screen.getByLabelText("Walk count today");
    await userEvent.paste(field, typed);
    await fireEvent(field, "submitEditing");

    expect(props.onChange).toHaveBeenCalledWith(saved);
  });

  it.each(["", "abc", "2", "-1", "1.5", "100"])('ignores a typed count of "%s"', async (typed) => {
    const props = rowProps({ habit: habit({ record: "count" }), count: 2 });
    await render(<HabitDueRow {...props} />);

    const field = screen.getByLabelText("Walk count today");
    await userEvent.paste(field, typed);
    await fireEvent(field, "blur");

    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("adds typed minutes on a timed Habit and empties the field", async () => {
    const props = rowProps({ habit: habit({ record: "duration", targetMinutes: 60 }) });
    await render(<HabitDueRow {...props} />);

    const field = screen.getByLabelText("Walk minutes today");
    await userEvent.paste(field, "25");
    await fireEvent(field, "submitEditing");

    expect(props.onAddMinutes).toHaveBeenCalledWith(25);
    expect(field).toHaveDisplayValue("");
  });

  it.each(["0", "abc", "1441"])('ignores typed minutes of "%s"', async (typed) => {
    const props = rowProps({ habit: habit({ record: "duration", targetMinutes: 60 }) });
    await render(<HabitDueRow {...props} />);

    const field = screen.getByLabelText("Walk minutes today");
    await userEvent.paste(field, typed);
    await fireEvent(field, "submitEditing");

    expect(props.onAddMinutes).not.toHaveBeenCalled();
  });

  it("logs what is left of the bar when a timed Habit is marked done", async () => {
    const props = rowProps({
      habit: habit({ record: "duration", targetMinutes: 60 }),
      entries: [{ id: 1, startTime: "08:00", minutes: 20 }],
    });

    await render(<HabitDueRow {...props} />);
    await userEvent.press(screen.getByRole("checkbox", { name: "Walk done today" }));

    expect(props.onAddMinutes).toHaveBeenCalledWith(40);
  });

  it("lets an Opt-out timed Habit be skipped and marks its day planned", async () => {
    const onSkip = jest.fn();

    const optOut = habit({
      record: "duration",
      targetMinutes: 60,
      usualMinutes: 120,
      optOutFrom: DAY,
    });

    await render(<HabitDueRow {...rowProps({ habit: optOut, planned: true, onSkip })} />);

    expect(screen.getByText("Planned: counts unless skipped")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("checkbox", { name: "Skip Walk today" }));

    expect(onSkip).toHaveBeenCalled();
  });

  it("gives a timed Habit that is not Opt-out no Skip and no planned mark", async () => {
    await render(
      <HabitDueRow
        {...rowProps({
          habit: habit({ record: "duration", targetMinutes: 60 }),
          onSkip: jest.fn(),
        })}
      />,
    );

    expect(screen.queryByRole("checkbox", { name: "Skip Walk today" })).not.toBeOnTheScreen();
    expect(screen.queryByText("Planned: counts unless skipped")).not.toBeOnTheScreen();
  });

  it("opens a timed day and fills its bar", async () => {
    const props = rowProps({
      habit: habit({ record: "duration", targetMinutes: 60 }),
      entries: [{ id: 1, startTime: "08:00", minutes: 90 }],
    });

    await render(<HabitDueRow {...props} />);

    expect(screen.getByTestId("duration-bar-fill")).toHaveStyle({ width: "100%" });
    expect(screen.getByRole("checkbox", { name: "Walk done today" })).toBeDisabled();
    await userEvent.press(screen.getByRole("button", { name: "Walk today: show entries" }));

    expect(props.onOpenDay).toHaveBeenCalled();
  });
});

const days = (
  weekHabit: Habit,
  { counts = {}, durations = {} }: Partial<Parameters<typeof habitDays>[1]> = {},
) => ({
  habit: weekHabit,
  days: habitDays(weekHabit, { counts, durations }),
});

const rowName = () => screen.getByRole("link", { name: /^Open / });

const runAction = async (actionName: string) =>
  fireEvent(rowName(), "accessibilityAction", { nativeEvent: { actionName } });

const DONE = { name: "done", label: "Done" };
const SKIP = { name: "skip", label: "Skip" };

describe("due row screen-reader actions", () => {
  const portage = habit({
    name: "Portage",
    startDate: "2026-11-02",
    target: { type: "once", count: 1, days: [] },
  });

  it("offers Done and Skip on a recurring Habit", async () => {
    await render(<HabitDueRow {...rowProps({ onSkip: jest.fn() })} />);

    expect(rowName()).toHaveProp("accessibilityActions", [DONE, SKIP]);
  });

  it("offers Done, Not done and Reschedule on a One-off", async () => {
    await render(<HabitDueRow {...rowProps({ habit: portage, onReschedule: jest.fn() })} />);

    expect(rowName()).toHaveProp("accessibilityActions", [
      DONE,
      { name: "not-done", label: "Not done" },
      { name: "reschedule", label: "Reschedule" },
    ]);
  });

  it.each([
    { name: "a done day offers only Skip", over: { count: 1 }, expected: [SKIP] },
    { name: "a skipped day offers only Done", over: { count: -1 }, expected: [DONE] },
    { name: "a disabled row gets none", over: { disabled: true }, expected: [] },
  ])("leaves out the answer the day already has: $name", async ({ over, expected }) => {
    await render(<HabitDueRow {...rowProps({ ...over, onSkip: jest.fn() })} />);

    expect(rowName()).toHaveProp("accessibilityActions", expected);
  });

  it("marks Not done on a One-off", async () => {
    const oneOff = rowProps({ habit: portage });
    await render(<HabitDueRow {...oneOff} />);

    await runAction("not-done");

    expect(oneOff.onChange).toHaveBeenCalledWith(-1);
  });

  it("logs what is left of the bar for Done on a timed Habit", async () => {
    const timed = rowProps({
      habit: habit({ record: "duration", targetMinutes: 30 }),
      entries: [{ id: 1, startTime: "08:00", minutes: 10 }],
    });

    await render(<HabitDueRow {...timed} />);

    await runAction("done");

    expect(timed.onAddMinutes).toHaveBeenCalledWith(20);
  });

  it("opens Reschedule on a One-off", async () => {
    const onReschedule = jest.fn();
    await render(<HabitDueRow {...rowProps({ habit: portage, onReschedule })} />);

    await runAction("reschedule");

    expect(onReschedule).toHaveBeenCalled();
  });
});

describe("HabitWeek", () => {
  const weekProps = { today: TODAY, skips: {}, onChange: jest.fn(), onOpenDay: jest.fn() };

  it("shows a skipped day as not done, and speaks and lists its cause", async () => {
    const yesterday = shiftDay(DAY, -1);
    await render(
      <HabitWeek
        {...weekProps}
        {...days(habit(), { counts: { [yesterday]: { walk: -1 } } })}
        skips={{ [yesterday]: { walk: { cause: "avoidance", note: "tired" } } }}
      />,
    );

    const day = screen.getByRole("checkbox", {
      name: "Walk, Friday, November 6: skipped, Avoidance: tired",
    });

    expect(day).not.toBeChecked();
    expect(
      screen.getByText("Skipped Fri: Avoidance: tired", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it.each([
    { name: "a done day", over: {}, counts: { walk: 1 }, label: "done", checked: true },
    { name: "a Not done day", over: {}, counts: { walk: -1 }, label: "not done", checked: false },
    { name: "an empty day", over: {}, counts: {}, label: "not logged", checked: false },
    {
      name: "a logged weed",
      over: { kind: "bad" as const },
      counts: { walk: 1 },
      label: "logged",
      checked: true,
    },
    {
      name: "a count",
      over: { record: "count" as const },
      counts: { walk: 3 },
      label: "3 logged",
      checked: true,
    },
  ])("speaks $name with its Day and state", async ({ over, counts, label, checked }) => {
    await render(
      <HabitWeek {...weekProps} {...days(habit(over), { counts: { [DAY]: counts } })} />,
    );

    const name = `Walk, Saturday, November 7: ${label}`;

    expect(screen.getByRole("checkbox", { name, checked })).toBeOnTheScreen();
  });

  it("drops a cause whose day is no longer Not done", async () => {
    const yesterday = shiftDay(DAY, -1);
    await render(
      <HabitWeek
        {...weekProps}
        {...days(habit(), { counts: { [yesterday]: { walk: 1 } } })}
        skips={{ [yesterday]: { walk: { cause: "outside", note: "" } } }}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "Walk, Friday, November 6: done" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/^Skipped/)).not.toBeOnTheScreen();
  });

  it("marks a day off a fixed-weekday Habit as not due", async () => {
    // TODAY is a Saturday; the Habit is due on Mondays only.
    await render(
      <HabitWeek
        {...weekProps}
        {...days(habit({ target: { type: "days", count: 7, days: [1] } }))}
      />,
    );

    expect(screen.getByLabelText("Walk, Saturday, November 7: not due")).toBeOnTheScreen();
  });

  it("shows a timed day logged off its weekdays", async () => {
    // TODAY is a Saturday; the Habit is due on Mondays only, and its bar was reached today.
    const offDay = habit({
      record: "duration",
      targetMinutes: 30,
      target: { type: "days", count: 7, days: [1] },
    });

    await render(
      <HabitWeek
        {...weekProps}
        {...days(offDay, {
          durations: { [DAY]: { walk: [{ id: 1, startTime: "08:00", minutes: 45 }] } },
        })}
      />,
    );

    expect(screen.queryByLabelText("Walk, Saturday, November 7: not due")).not.toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Walk, Saturday, November 7: 45m logged, show entries" }),
    ).toBeOnTheScreen();
  });

  it("shows a counted day and opens a timed one", async () => {
    const yesterday = shiftDay(DAY, -1);
    await render(
      <HabitWeek
        {...weekProps}
        {...days(habit({ record: "count" }), { counts: { [yesterday]: { walk: 3 } } })}
      />,
    );
    expect(screen.getByText("3")).toBeOnTheScreen();

    await render(
      <HabitWeek
        {...weekProps}
        {...days(habit({ record: "duration", targetMinutes: 30 }), {
          durations: { [yesterday]: { walk: [{ id: 1, startTime: "08:00", minutes: 45 }] } },
        })}
      />,
    );
    expect(screen.getByText("45m")).toBeOnTheScreen();
    await userEvent.press(
      screen.getByRole("button", { name: "Walk, Friday, November 6: 45m logged, show entries" }),
    );

    expect(weekProps.onOpenDay).toHaveBeenCalledWith(yesterday);
  });
});

describe("HabitCard", () => {
  const cardProps = {
    counts: {},
    durations: {},
    skips: {},
    today: TODAY,
    nameOf: (id: string) => id,
    goalName: String,
    onToggle: jest.fn(),
    onOpen: jest.fn(),
    onCount: jest.fn(),
    onOpenDay: jest.fn(),
    onEdit: jest.fn(),
  };

  it("shows a bad Habit over its ceiling in red", async () => {
    await render(
      <HabitCard
        {...cardProps}
        expanded={false}
        habit={habit({
          kind: "bad",
          record: "count",
          target: { type: "weekly", count: 1, days: [] },
        })}
        counts={{ [DAY]: { walk: 2 } }}
      />,
    );

    expect(screen.getByText("2 this week (at most 1)")).toHaveProp(
      "className",
      expect.stringContaining("text-destructive"),
    );
  });

  it("still logs a tree, but nothing for a Backlog Habit", async () => {
    await render(<HabitCard {...cardProps} expanded stage="tree" habit={habit()} />);
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);

    await render(<HabitCard {...cardProps} expanded={false} habit={habit({ active: false })} />);
    expect(screen.getByText("Backlog")).toBeOnTheScreen();
    expect(screen.queryByRole("checkbox")).not.toBeOnTheScreen();
  });

  it("opens the Habit from its row and expands it from the chevron", async () => {
    const onOpen = jest.fn();
    const onToggle = jest.fn();
    await render(
      <HabitCard
        {...cardProps}
        expanded={false}
        habit={habit()}
        stage="seed"
        onOpen={onOpen}
        onToggle={onToggle}
      />,
    );

    await userEvent.press(screen.getByRole("button", { name: "Walk, Seed, 0 of 7 this week" }));

    expect(onOpen).toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();

    await userEvent.press(screen.getByRole("button", { name: "Details of Walk" }));

    expect(onToggle).toHaveBeenCalled();
  });

  it("speaks the row's stage, progress, Streak and Freeze note in its label", async () => {
    const streak = {
      unit: "day" as const,
      current: 4,
      longest: 9,
      freezes: 1,
      freezesSinceDone: 1,
      marks: {},
      repair: null,
    };

    await render(
      <HabitCard {...cardProps} expanded={false} habit={habit()} stage="sprout" streak={streak} />,
    );

    expect(screen.getByText("Sprout")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: /^Walk, Sprout, 0 of 7 this week, 4 days · longest 9, 1 Freeze, Used 1 Freeze on Walk\./,
      }),
    ).toBeOnTheScreen();
  });

  it("shows the Tiny version in an expanded card's details, and nothing when it has none", async () => {
    const { rerender } = await render(
      <HabitCard {...cardProps} expanded habit={habit({ tinyVersion: "Put on walking shoes" })} />,
    );

    expect(screen.getByText("Tiny version")).toBeOnTheScreen();
    expect(screen.getByText("Put on walking shoes")).toBeOnTheScreen();

    await rerender(<HabitCard {...cardProps} expanded habit={habit()} />);

    expect(screen.queryByText("Tiny version")).not.toBeOnTheScreen();
  });

  it("disables Edit offline", async () => {
    await render(<HabitCard {...cardProps} expanded offline habit={habit()} />);

    expect(screen.getByRole("button", { name: "Edit Walk" })).toBeDisabled();
  });

  it("shows no Stage for a Habit without one, or before its records load", async () => {
    await render(<HabitCard {...cardProps} expanded={false} habit={habit()} />);

    expect(screen.getByRole("button", { name: "Walk, 0 of 7 this week" })).toBeOnTheScreen();
    expect(screen.queryByText("Seed")).not.toBeOnTheScreen();
  });

  const manageProps = { onTree: jest.fn(), onBacklog: jest.fn(), onPastDays: jest.fn() };

  it("shows Manage only on an expanded card", async () => {
    const { rerender } = await render(
      <HabitCard {...cardProps} {...manageProps} expanded={false} habit={habit()} />,
    );

    expect(screen.queryByText("Manage")).not.toBeOnTheScreen();

    await rerender(<HabitCard {...cardProps} {...manageProps} expanded habit={habit()} />);
    expect(screen.getByText("Manage")).toBeOnTheScreen();
  });

  it("shows each Manage control only with its handler", async () => {
    await render(<HabitCard {...cardProps} expanded habit={habit()} />);

    expect(screen.getByText("Manage")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Move to Backlog" })).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Log a past day" })).not.toBeOnTheScreen();
  });

  it("hands each Manage tap to its handler, with no Stage picker", async () => {
    const props = { onTree: jest.fn(), onBacklog: jest.fn(), onPastDays: jest.fn() };

    await render(<HabitCard {...cardProps} {...props} expanded stage="plant" habit={habit()} />);

    expect(screen.queryByRole("button", { name: "Plant" })).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Slipped" })).not.toBeOnTheScreen();

    await act(() => userEvent.press(screen.getByRole("button", { name: "Move to Backlog" })));
    await act(() => userEvent.press(screen.getByRole("button", { name: "Log a past day" })));

    expect(props.onBacklog).toHaveBeenCalled();
    expect(props.onPastDays).toHaveBeenCalled();
    expect(props.onTree).not.toHaveBeenCalled();
  });

  it("asks the tree question on the collapsed card and hands Yes and Not yet to their handler", async () => {
    const onTree = jest.fn();

    await render(
      <HabitCard {...cardProps} expanded={false} asksTree onTree={onTree} habit={habit()} />,
    );

    expect(screen.getByText("Do you do this without thinking?")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Yes" }));
    await userEvent.press(screen.getByRole("button", { name: "Not yet" }));

    expect(onTree.mock.calls).toEqual([["yes"], ["not-yet"]]);
  });

  it("asks nothing without a tree handler, and disables the answers offline", async () => {
    const { rerender } = await render(
      <HabitCard {...cardProps} expanded={false} asksTree habit={habit()} />,
    );

    expect(screen.queryByText("Do you do this without thinking?")).not.toBeOnTheScreen();

    await rerender(
      <HabitCard
        {...cardProps}
        {...manageProps}
        expanded={false}
        offline
        asksTree
        habit={habit()}
      />,
    );

    expect(screen.getByRole("button", { name: "Yes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not yet" })).toBeDisabled();
  });

  it("offers Slipped on an expanded tree", async () => {
    const onTree = jest.fn();

    await render(
      <HabitCard {...cardProps} expanded stage="tree" onTree={onTree} habit={habit()} />,
    );

    expect(screen.getByText("Tree")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Slipped" }));

    expect(onTree).toHaveBeenCalledWith("slipped");
  });

  it("offers Make active on a Backlog Habit and says when a save failed", async () => {
    await render(
      <HabitCard
        {...cardProps}
        {...manageProps}
        expanded
        saveFailed
        habit={habit({ active: false })}
      />,
    );

    expect(screen.getByRole("button", { name: "Make active" })).toBeOnTheScreen();
    expect(screen.getByText("Couldn't save. Try again.")).toBeOnTheScreen();
  });

  it("disables Slipped and Backlog offline or while a save is pending, but not Log a past day", async () => {
    const { rerender } = await render(
      <HabitCard {...cardProps} {...manageProps} expanded offline stage="tree" habit={habit()} />,
    );

    expect(screen.getByRole("button", { name: "Slipped" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move to Backlog" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log a past day" })).toBeEnabled();

    await rerender(
      <HabitCard {...cardProps} {...manageProps} expanded saving stage="tree" habit={habit()} />,
    );

    expect(screen.getByRole("button", { name: "Slipped" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move to Backlog" })).toBeDisabled();
  });
});

import { shiftDay, torontoDay, type Season } from "@/core";
import { render, screen, userEvent } from "@testing-library/react-native";

import { SeasonFields } from "@/components/habits/season-fields";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../jest/android-picker";

const today = torontoDay(new Date());
const lastYear: Season = { start: shiftDay(today, -200), end: shiftDay(today, -30) };

const renderSeasons = async (seasons: Season[], over: Parameters<typeof habit>[0] = {}) => {
  const update = jest.fn();
  await render(<SeasonFields draft={habit({ seasons, ...over })} update={update} />);

  return update;
};

describe("SeasonFields", () => {
  it("reads Due all year with no Season, and Start season opens one today", async () => {
    const update = await renderSeasons([]);

    expect(screen.getByText("Due all year.")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Start season" }));

    expect(update).toHaveBeenCalledWith({ seasons: [{ start: today, end: null }] });
  });

  it("End season ends the open one today", async () => {
    const update = await renderSeasons([lastYear, { start: shiftDay(today, -3), end: null }]);

    expect(screen.queryByRole("button", { name: "Start season" })).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "End season" }));

    expect(update).toHaveBeenCalledWith({
      seasons: [lastYear, { start: shiftDay(today, -3), end: today }],
    });
  });

  it("types a future Season in ahead, then removes it", async () => {
    const update = await renderSeasons([lastYear]);

    await userEvent.press(screen.getByRole("button", { name: "Plan a season" }));
    expect(update).toHaveBeenLastCalledWith({
      seasons: [lastYear, { start: shiftDay(today, 1), end: null }],
    });

    await userEvent.press(screen.getByRole("button", { name: "Remove season 1" }));
    expect(update).toHaveBeenLastCalledWith({ seasons: [] });
  });

  it("sets and clears an end", async () => {
    const open = { start: shiftDay(today, -3), end: null };
    const update = await renderSeasons([open]);

    await userEvent.press(screen.getByRole("button", { name: "Set end of season 1" }));
    expect(update).toHaveBeenLastCalledWith({ seasons: [{ ...open, end: today }] });
  });

  it("clears an end", async () => {
    const update = await renderSeasons([lastYear]);

    await userEvent.press(screen.getByRole("button", { name: "Clear end of season 1" }));
    expect(update).toHaveBeenLastCalledWith({ seasons: [{ ...lastYear, end: null }] });
  });

  it("shows nothing for a Reference Habit", async () => {
    await renderSeasons([], { target: { type: "none", count: 7, days: [] } });

    expect(screen.queryByText("Seasons")).not.toBeOnTheScreen();
  });

  it("ends a Season that has not started on its start day", async () => {
    const ahead = { start: shiftDay(today, 5), end: null };
    const update = await renderSeasons([ahead]);

    await userEvent.press(screen.getByRole("button", { name: "Set end of season 1" }));
    expect(update).toHaveBeenLastCalledWith({ seasons: [{ ...ahead, end: ahead.start }] });
  });

  it("changes the start of one Season and leaves the other", async () => {
    const picked = shiftDay(today, -250);

    pickOnAndroid(new Date(`${picked}T00:00`));
    const second = { start: shiftDay(today, 10), end: null };
    const update = await renderSeasons([lastYear, second]);

    await userEvent.press(screen.getByLabelText(`Start of season 2: ${second.start}`));
    expect(update).toHaveBeenLastCalledWith({ seasons: [lastYear, { ...second, start: picked }] });
  });

  it("changes the end of a Season", async () => {
    const picked = shiftDay(today, -100);

    pickOnAndroid(new Date(`${picked}T00:00`));
    const update = await renderSeasons([lastYear]);

    await userEvent.press(screen.getByLabelText(`End of season 1: ${String(lastYear.end)}`));
    expect(update).toHaveBeenLastCalledWith({ seasons: [{ ...lastYear, end: picked }] });
  });
});

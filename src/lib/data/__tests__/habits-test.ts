import { HabitsBody, missingHabitText } from "@/lib/data/habits";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../../../jest/fixtures";

describe("HabitsBody", () => {
  it("reads a One-off and its Reschedules as GET /api/habits?since sends them", () => {
    const portage = habit({
      id: "portage",
      startDate: "2026-11-14",
      target: { type: "once", count: 1, days: [] },
    });

    const reschedules = {
      portage: [
        {
          from: "2026-11-07",
          to: "2026-11-14",
          cause: "outside",
          note: "",
          createdAt: "2026-11-07T18:00:00Z",
        },
      ],
    };

    expect(
      HabitsBody.parse({
        habits: [portage],
        counts: {},
        durations: {},
        reschedules,
      }),
    ).toEqual({
      habits: [portage],
      counts: {},
      durations: {},
      reschedules,
    });
  });
});

describe("missingHabitText", () => {
  it.each([
    [true, false, "This Habit no longer exists."],
    [false, true, "Couldn't load Habits."],
    [false, false, "Loading…"],
  ])("loaded %s, failed %s", (loaded, isError, text) => {
    expect(missingHabitText(loaded, isError)).toBe(text);
  });
});

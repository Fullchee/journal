import { PLACES, shiftDay, torontoDay, type CheckIn } from "@/core";
import { render, screen, userEvent } from "@testing-library/react-native";

import { CheckInList } from "@/components/check-in-list";
import {
  CheckInSearch,
  periodName,
  RangePicker,
  SignalSummary,
} from "@/components/check-in-panels";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn } from "../../../jest/fixtures";

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: () => true }));

interface SearchState {
  data: CheckIn[];
}

const mockSearch: SearchState = { data: [] };

jest.mock("@/lib/data/check-ins", () => ({
  ...jest.requireActual<object>("@/lib/data/check-ins"),
  useCheckInSearch: () => mockSearch,
}));

const TODAY = torontoDay(new Date());

const showList = async (selectedKey?: number) => {
  const onEdit = jest.fn();

  await render(
    <CheckInList
      checkIns={[checkIn({ id: 1, thought: "Calm", score: 7 })]}
      places={PLACES}
      habitNames={() => []}
      partNames={[]}
      selectedKey={selectedKey}
      onEdit={onEdit}
      cardRef={jest.fn()}
    />,
  );

  return onEdit;
};

describe("CheckInList", () => {
  it("shows each feeling as a chip", async () => {
    await showList();

    expect(screen.getByText("Calm")).toBeOnTheScreen();
  });

  it("names each row for TalkBack by what a tap edits", async () => {
    await showList();

    expect(
      screen.getByRole("button", { name: /^Edit time and zone, .+: Sun \(7\/8\)$/ }),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Edit Feelings, .+: Calm$/ })).toBeOnTheScreen();
  });

  it("saving an untouched edit sends no change", async () => {
    const onEdit = await showList(1);

    await userEvent.press(screen.getByText("Calm"));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeOnTheScreen();
  });
});

describe("RangePicker", () => {
  it("steps a past day forward", async () => {
    const onEnd = jest.fn();
    const past = shiftDay(TODAY, -3);

    await render(
      <RangePicker
        range={{ label: "Day", days: "day" }}
        end={past}
        onRange={jest.fn()}
        onEnd={onEnd}
      />,
    );
    await userEvent.press(screen.getByRole("button", { name: "Next day" }));

    expect(onEnd).toHaveBeenCalledWith(shiftDay(past, 1));
  });
});

describe("periodName", () => {
  it("names a past day by its date", () => {
    expect(periodName({ label: "Day", days: "day" }, shiftDay(TODAY, -3))).not.toBe("day");
  });

  it("names a past week by its dates", () => {
    expect(periodName({ label: "Week", days: 7 }, shiftDay(TODAY, -30))).not.toBe("week");
  });
});

describe("SignalSummary", () => {
  it("shows a trend only when there is one", async () => {
    await render(
      <SignalSummary
        title="Sleep"
        rows={[
          { label: "Hours", value: "7", trend: "up" },
          { label: "Steps", value: "9", trend: "" },
        ]}
      />,
    );

    expect(screen.getByText(", up")).toBeOnTheScreen();
    expect(screen.queryByText(", ")).not.toBeOnTheScreen();
  });
});

describe("CheckInSearch", () => {
  it("lists a found Check-in with its note, its thought, or neither", async () => {
    mockSearch.data = [
      checkIn({ id: 1, note: "wrote a note", thought: "ignored" }),
      checkIn({ id: 2, note: "", thought: "only a thought" }),
      checkIn({ id: 3, note: "", thought: "" }),
    ];

    await render(<CheckInSearch onOpen={jest.fn()} />);
    await userEvent.paste(screen.getByLabelText("Search Check-ins"), "walk");
    await userEvent.press(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByText(/wrote a note/)).toBeOnTheScreen();
    expect(screen.getByText(/only a thought/)).toBeOnTheScreen();
    expect(screen.queryByText(/ignored/)).not.toBeOnTheScreen();
  });

  it("opens a found Check-in on a tap", async () => {
    const found = checkIn({ id: 4, note: "long walk", zone: "Sun" });
    const onOpen = jest.fn();

    mockSearch.data = [found];
    await render(<CheckInSearch onOpen={onOpen} />);
    await userEvent.paste(screen.getByLabelText("Search Check-ins"), "walk");
    await userEvent.press(screen.getByRole("button", { name: "Search" }));
    await userEvent.press(screen.getByRole("button", { name: /^Open Check-in, .*, Sun$/ }));

    expect(onOpen).toHaveBeenCalledWith(found);
  });
});

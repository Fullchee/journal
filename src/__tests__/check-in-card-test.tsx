import { isoAt, PLACES, shiftDay, torontoDay } from "@/core";
import { Button, CheckInCard, Text, type CheckInCardProps } from "@/ui";
import { act, render, screen, userEvent, within } from "@testing-library/react-native";
import { Platform } from "react-native";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../jest/android-picker";

const mockWindow = { fontScale: 1 };

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 400, height: 900, scale: 1, fontScale: mockWindow.fontScale }),
}));

beforeEach(() => {
  mockWindow.fontScale = 1;
});

const half = (name: string) => screen.getByRole("button", { name });

const chip = (legend: string, name: string) =>
  within(screen.getByLabelText(legend)).getByRole("button", { name });

const WOLF = { id: 1, name: "Worry wolf" };
const DOER = { id: 2, name: "Doer" };
const CRITIC = { id: 9, name: "Critic" };

const gymOrAnywhere = (place: string) => (place === "Gym" ? ["Lift"] : ["Walk", "Read"]);

async function renderCard(props: Partial<CheckInCardProps> = {}) {
  const callbacks = {
    onCheckIn: jest.fn<string, [number, string]>(() => "client-1"),
    onUpdate: jest.fn(),
    onDoingSent: jest.fn(),
  };

  await render(
    <CheckInCard
      places={PLACES}
      habitNames={() => ["Walk", "Read"]}
      partNames={[WOLF, DOER]}
      {...callbacks}
      {...props}
    />,
  );

  return callbacks;
}

it("saves a Check-in from a zone half and opens its details", async () => {
  const { onCheckIn } = await renderCard();

  await userEvent.press(half("Cloud, upper half"));

  expect(onCheckIn).toHaveBeenCalledWith(6, expect.any(String));
  expect(screen.getByText("Saved Cloud (upper).")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save details" })).toBeOnTheScreen();
});

it("a second tap moves the open Check-in instead of logging another", async () => {
  const { onCheckIn, onUpdate } = await renderCard();

  await userEvent.press(half("Cloud, upper half"));
  await userEvent.press(half("Rain, lower half"));

  expect(onCheckIn).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith("client-1", { score: 3 });
});

it("a tap on the zone already picked changes nothing", async () => {
  const { onUpdate } = await renderCard();

  await userEvent.press(half("Cloud, upper half"));
  await userEvent.press(half("Cloud, upper half"));

  expect(onUpdate).not.toHaveBeenCalled();
});

it('saves only the details filled and sends "What were you doing?" to the log box', async () => {
  const { onUpdate, onDoingSent } = await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  await userEvent.press(screen.getByRole("button", { name: "Gym" }));
  await userEvent.press(chip("What were you doing?", "Other"));
  await userEvent.paste(screen.getByPlaceholderText("walked 20 min, read a book"), "lifted");
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { place: "Gym", doing: "lifted" });
  expect(onDoingSent).toHaveBeenCalledWith("lifted", {});
  expect(screen.queryByRole("button", { name: "Save details" })).not.toBeOnTheScreen();
});

// The clock dialog reads a Date's local fields, so a local 14:00 picks "14:00".
const pickClock = async (label: string, hour: number, minute: number) => {
  pickOnAndroid(undefined, new Date(2026, 10, 3, hour, minute));
  await userEvent.press(screen.getByLabelText(new RegExp(`^${label}: `)));
};

it('sends when "What were you doing?" started and ended, on the Check-in\'s Day', async () => {
  const { onDoingSent } = await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  expect(screen.queryByText("Started")).not.toBeOnTheScreen();
  await userEvent.press(chip("What were you doing?", "Walk"));
  await pickClock("Started", 14, 0);
  await pickClock("Ended", 15, 30);
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onDoingSent).toHaveBeenCalledWith("Walk", {
    date: torontoDay(new Date()),
    start_time: "14:00",
    minutes: 90,
  });
});

it("asks when the activity started only where it goes to the log box", async () => {
  await render(
    <CheckInCard
      places={PLACES}
      habitNames={() => ["Walk"]}
      partNames={[]}
      onCheckIn={() => "client-1"}
      onUpdate={jest.fn()}
      defaultOpen={{ id: "client-1", score: 6 }}
    />,
  );

  await userEvent.press(chip("What were you doing?", "Walk"));

  expect(screen.queryByText("Started")).not.toBeOnTheScreen();
});

it("saves who is in control and the parts present by reference", async () => {
  const { onUpdate } = await renderCard({ defaultOpen: { id: "client-1", score: 4 } });

  await userEvent.press(chip("Who's in control?", "Worry wolf"));
  await userEvent.press(chip("Who else is present?", "Doer"));
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { inControl: WOLF, parts: [DOER], note: "" });
});

it("unpicks the one in control when its chip is pressed again, and picks Self", async () => {
  const { onUpdate } = await renderCard({ defaultOpen: { id: "client-1", score: 4 } });

  await userEvent.press(chip("Who's in control?", "Worry wolf"));
  await userEvent.press(chip("Who's in control?", "Worry wolf"));
  expect(chip("Who's in control?", "Worry wolf")).toHaveProp("aria-pressed", false);
  await userEvent.press(chip("Who's in control?", "Self"));
  await userEvent.press(chip("Who else is present?", "Doer"));
  await userEvent.press(chip("Who else is present?", "Doer"));
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { inControl: "Self", parts: [], note: "" });
});

it("selects the Part the New part slot creates", async () => {
  const { onUpdate } = await renderCard({
    defaultOpen: { id: "client-1", score: 4 },
    newPart: (select) => (
      <Button onPress={() => select(CRITIC)}>
        <Text>New part…</Text>
      </Button>
    ),
  });

  await userEvent.press(screen.getByRole("button", { name: "New part…" }));
  await userEvent.press(screen.getByRole("button", { name: "New part…" }));
  expect(chip("Who else is present?", "Critic")).toBeOnTheScreen();
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { inControl: null, parts: [CRITIC], note: "" });
});

it("disables New part… without the slot, since a Part needs a connection", async () => {
  await renderCard({ defaultOpen: { id: "client-1", score: 4 } });

  expect(screen.getByRole("button", { name: "New part…" })).toBeDisabled();
  expect(screen.getByText("Needs a connection")).toBeOnTheScreen();
});

it("offers Self only as the one in control", async () => {
  await renderCard({ defaultOpen: { id: "client-1", score: 4 } });

  expect(chip("Who's in control?", "Self")).toBeOnTheScreen();
  expect(
    within(screen.getByLabelText("Who else is present?")).queryByRole("button", { name: "Self" }),
  ).not.toBeOnTheScreen();
});

it('offers the active Habits for "What were you doing?"', async () => {
  const { onUpdate } = await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  await userEvent.press(chip("What were you doing?", "Read"));
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { doing: "Read" });
});

it("offers the Habits for the picked place and keeps the picked one under Other when the place hides it", async () => {
  await renderCard({ habitNames: gymOrAnywhere, defaultOpen: { id: "client-1", score: 6 } });
  await userEvent.press(chip("What were you doing?", "Read"));
  await userEvent.press(chip("Where were you?", "Gym"));

  expect(chip("What were you doing?", "Lift")).toBeOnTheScreen();
  expect(
    within(screen.getByLabelText("What were you doing?")).queryByRole("button", { name: "Read" }),
  ).not.toBeOnTheScreen();
  expect(screen.getByLabelText("Other activity")).toHaveDisplayValue("Read");
});

it("picks the only activity a place offers when none is picked yet", async () => {
  const { onUpdate } = await renderCard({
    habitNames: gymOrAnywhere,
    defaultOpen: { id: "client-1", score: 6 },
  });

  await userEvent.press(chip("Where were you?", "Gym"));
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { place: "Gym", doing: "Lift" });
});

it("leaves the activity empty at a place that offers several", async () => {
  const { onUpdate } = await renderCard({
    habitNames: gymOrAnywhere,
    defaultOpen: { id: "client-1", score: 6 },
  });

  await userEvent.press(chip("Where were you?", "Home"));
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { place: "Home" });
});

it("shows the other-place box only after Other is picked", async () => {
  const { onUpdate } = await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  expect(screen.queryByRole("button", { name: "Out" })).not.toBeOnTheScreen();
  expect(screen.queryByLabelText("Other place")).not.toBeOnTheScreen();

  await userEvent.press(chip("Where were you?", "Other"));
  await userEvent.paste(screen.getByLabelText("Other place"), "Cafe");
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { place: "Cafe" });
});

it("a second tap on Other hides its box and clears it", async () => {
  await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  await userEvent.press(chip("Where were you?", "Other"));
  await userEvent.paste(screen.getByLabelText("Other place"), "Cafe");
  await userEvent.press(chip("Where were you?", "Other"));

  expect(screen.queryByLabelText("Other place")).not.toBeOnTheScreen();
  expect(chip("Where were you?", "Other")).toHaveProp("aria-pressed", false);
});

it("a chip picked after Other hides its box", async () => {
  const { onUpdate } = await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  await userEvent.press(chip("Where were you?", "Other"));
  await userEvent.press(chip("Where were you?", "Gym"));

  expect(screen.queryByLabelText("Other place")).not.toBeOnTheScreen();
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));
  expect(onUpdate).toHaveBeenCalledWith("client-1", { place: "Gym" });
});

it("opens a place no chip names under Other, with its box shown", async () => {
  await renderCard({ guessPlace: () => Promise.resolve("Cafe") });

  await userEvent.press(half("Sun, upper half"));
  await act(() => Promise.resolve());

  expect(chip("Where were you?", "Other")).toHaveProp("aria-pressed", true);
  expect(screen.getByLabelText("Other place")).toHaveProp("value", "Cafe");
});

it("saving untouched details sends nothing", async () => {
  const { onUpdate, onDoingSent } = await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).not.toHaveBeenCalled();
  expect(onDoingSent).not.toHaveBeenCalled();
});

it("Not now closes the details", async () => {
  await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  await userEvent.press(screen.getByRole("button", { name: "Not now" }));

  expect(screen.queryByRole("button", { name: "Save details" })).not.toBeOnTheScreen();
});

it("fills the empty place with the Place guess", async () => {
  const guessPlace = jest.fn(() => Promise.resolve("Library"));
  await renderCard({ guessPlace });

  await userEvent.press(half("Sun, upper half"));
  await act(() => Promise.resolve());

  expect(guessPlace).toHaveBeenCalledWith(expect.any(String));
  expect(screen.getByRole("button", { name: "Library" })).toHaveProp("aria-pressed", true);
});

it("saves the Place guess when it lands, so Not now keeps it", async () => {
  const { onUpdate } = await renderCard({ guessPlace: () => Promise.resolve("Library") });

  await userEvent.press(half("Sun, upper half"));
  await act(() => Promise.resolve());
  await userEvent.press(screen.getByRole("button", { name: "Not now" }));

  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith("client-1", { place: "Library" });
});

it("saves a Place guess that lands after the details close", async () => {
  const { promise, resolve } = Promise.withResolvers<string | null>();
  const { onUpdate } = await renderCard({ guessPlace: () => promise });

  await userEvent.press(half("Sun, upper half"));
  await userEvent.press(screen.getByRole("button", { name: "Not now" }));
  resolve("Library");
  await act(() => promise);

  expect(onUpdate).toHaveBeenCalledWith("client-1", { place: "Library" });
});

it("never saves a Place guess over a place the owner picked first", async () => {
  const { promise, resolve } = Promise.withResolvers<string | null>();
  const { onUpdate } = await renderCard({ guessPlace: () => promise });

  await userEvent.press(half("Sun, upper half"));
  await userEvent.press(chip("Where were you?", "Gym"));
  resolve("Library");
  await act(() => promise);

  expect(onUpdate).not.toHaveBeenCalled();
  expect(chip("Where were you?", "Gym")).toHaveProp("aria-pressed", true);
});

it("saves nothing when there is no Place guess", async () => {
  const { onUpdate } = await renderCard({ guessPlace: () => Promise.resolve(null) });

  await userEvent.press(half("Sun, upper half"));
  await act(() => Promise.resolve());

  expect(onUpdate).not.toHaveBeenCalled();
});

it("says Check-ins wait for the connection when offline", async () => {
  await renderCard({ offline: true });

  expect(screen.getByText("Offline: Check-ins save when you're back online.")).toBeOnTheScreen();
});

it("draws each zone engraving in its upper half", async () => {
  await renderCard();

  for (const zone of ["Storm", "Rain", "Cloud", "Sun"]) {
    expect(
      screen.getByTestId(`${zone} engraving`, { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  }
});

const yesterday = () => shiftDay(torontoDay(new Date()), -1);

// The dialogs answer with a Date's local fields, which the fields read as Toronto's clock.
const pickedYesterdayAt930 = () => new Date(`${yesterday()}T09:30`);

const yesterdayAt930 = () => isoAt(yesterday(), 9 * 60 + 30);

const nowButton = () => screen.getByRole("button", { name: "Now, change the time" });

afterEach(() => jest.restoreAllMocks());

// Both dialogs answer with `at`; each field keeps only its date or its time.
async function pickWhen(at: Date) {
  pickOnAndroid(at);
  await userEvent.press(screen.getByLabelText(/^Date: /));
  await userEvent.press(screen.getByLabelText(/^Time: /));
}

const checkedInAtOf = (onCheckIn: jest.Mock<string, [number, string]>) =>
  onCheckIn.mock.calls[0]?.[1] ?? "";

it("stamps a Check-in with now until the time is changed", async () => {
  const { onCheckIn } = await renderCard();
  const before = Date.now();

  expect(nowButton()).toBeOnTheScreen();
  await userEvent.press(half("Sun, lower half"));

  expect(Date.parse(checkedInAtOf(onCheckIn))).toBeGreaterThanOrEqual(before);
});

it("saves a Check-in set to yesterday with yesterday's time", async () => {
  const { onCheckIn } = await renderCard();

  await userEvent.press(nowButton());
  await pickWhen(pickedYesterdayAt930());
  await userEvent.press(half("Cloud, lower half"));

  expect(onCheckIn).toHaveBeenCalledWith(5, yesterdayAt930());
});

it("opens the date dialog on the time picked, ending today", async () => {
  const picker = pickOnAndroid();

  await renderCard();

  await userEvent.press(nowButton());
  await userEvent.press(screen.getByLabelText(/^Date: /));

  const opened = picker.mock.calls.at(-1)?.[0];
  expect(opened?.mode).toBe("date");
  const today = new Date(`${torontoDay(new Date())}T00:00`);
  expect(opened?.maximumDate?.toDateString()).toBe(today.toDateString());
});

it("a time changed after the tap moves the open Check-in when its details are saved", async () => {
  const { onUpdate } = await renderCard();

  await userEvent.press(half("Cloud, lower half"));
  await userEvent.press(nowButton());
  await pickWhen(pickedYesterdayAt930());
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { checkedInAt: yesterdayAt930() });
  expect(nowButton()).toBeOnTheScreen();
});

it("Not now sets the time back to now", async () => {
  await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  await userEvent.press(nowButton());
  await userEvent.press(screen.getByRole("button", { name: "Not now" }));

  expect(nowButton()).toBeOnTheScreen();
  expect(screen.queryByLabelText(/^Date: /)).not.toBeOnTheScreen();
});

it("saves Tense, Low and Tired as None, Some or A lot, and a re-tap clears the row", async () => {
  const { onUpdate } = await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  await userEvent.press(chip("Tense or on edge?", "A lot"));
  await userEvent.press(chip("Sad or down?", "None"));
  await userEvent.press(chip("Tired or drained?", "Some"));
  await userEvent.press(chip("Tired or drained?", "Some"));

  expect(chip("Tired or drained?", "Some")).toHaveProp("aria-pressed", false);
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { tense: 2, low: 0 });
});

it("saves the How I felt quadrant with the feelings", async () => {
  const { onUpdate } = await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  await userEvent.press(screen.getByRole("radio", { name: "Unpleasant" }));
  await userEvent.press(screen.getByRole("radio", { name: "Low" }));
  await userEvent.press(screen.getByRole("button", { name: "Tired" }));
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", {
    thought: "Tired",
    pleasantness: "Unpleasant",
    feelingEnergy: "Low",
  });
});

it("labels the note and says it is optional", async () => {
  const { onUpdate } = await renderCard({ defaultOpen: { id: "client-1", score: 6 } });

  expect(screen.getByText("Anything else? (optional)")).toBeOnTheScreen();
  await userEvent.paste(screen.getByPlaceholderText("A thought, a worry, what helped"), "tired");
  await userEvent.press(screen.getByRole("button", { name: "Save details" }));

  expect(onUpdate).toHaveBeenCalledWith("client-1", { inControl: null, parts: [], note: "tired" });
});

const platePairs = () => screen.getByTestId("zone-plates").children;

it("sets the plates side by side at default text size", async () => {
  await renderCard();

  for (const pair of platePairs())
    expect(pair).toHaveProp("className", expect.stringContaining("flex-1"));
});

it("stacks the plates two by two at large text, so each half label fits", async () => {
  mockWindow.fontScale = 2;
  await renderCard();

  for (const pair of platePairs())
    expect(pair).toHaveProp("className", expect.stringContaining("basis-full"));
});

it("on web, wraps the plates by rem width, since web text size leaves fontScale at 1", async () => {
  jest.replaceProperty(Platform, "OS", "web");
  await renderCard();

  for (const pair of platePairs())
    expect(pair).toHaveProp("className", expect.stringContaining("basis-[8.75rem]"));
});

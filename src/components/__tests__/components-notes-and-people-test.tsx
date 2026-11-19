import { torontoDay, type CloseGoal, type CloseSourcesBody, type Interaction } from "@/core";
import { render, screen, userEvent } from "@testing-library/react-native";
import { Platform } from "react-native";

import { GoalReviewField, type GoalReview } from "@/components/close-goals";
import { CloseSources } from "@/components/close-sources";
import { ConnectionDetails } from "@/components/connection-details";
import { ConnectionInteractions } from "@/components/connection-interactions";
import { LinksField } from "@/components/connection-people-fields";
import { GoalForm } from "@/components/goal-form";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../../jest/android-picker";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { connection } from "../../../jest/fixtures";

const mockEdit = { mutate: jest.fn(), isPending: false, isError: false };

jest.mock("@/lib/data/connections", () => ({
  ...jest.requireActual<object>("@/lib/data/connections"),
  useEditInteraction: () => mockEdit,
  useDeleteInteraction: () => ({ mutate: jest.fn(), isPending: false }),
}));

const webOnly = () => jest.replaceProperty(Platform, "OS", "web");

afterEach(() => {
  jest.restoreAllMocks();
});

const GOAL: CloseGoal = { id: 1, title: "Sleep", why: "", habits: [] };
const REVIEW: GoalReview = { words: "", move: "carry", revision: "" };

describe("GoalReviewField", () => {
  it("edits the words on the web, where the box has rows", async () => {
    webOnly();
    const onChange = jest.fn();

    await render(<GoalReviewField goal={GOAL} review={REVIEW} onChange={onChange} />);
    await userEvent.paste(screen.getByLabelText("Where Sleep stands"), "steady");

    expect(onChange).toHaveBeenCalledWith({ ...REVIEW, words: "steady" });
  });
});

const closeSources = (signals: string[]): Pick<CloseSourcesBody, "sources" | "signals"> => ({
  sources: [],
  signals,
});

describe("CloseSources", () => {
  it("says when a period has no signal data", async () => {
    await render(<CloseSources {...closeSources([])} />);

    expect(screen.getByText("No signal data for this period.")).toBeOnTheScreen();
  });

  it("lists each signal without its dash", async () => {
    await render(<CloseSources {...closeSources(["- Slept 7h"])} />);

    expect(screen.getByText("Slept 7h")).toBeOnTheScreen();
  });
});

const connectionDetail = (over: Partial<ReturnType<typeof connection>>) => ({
  ...connection(over),
  body: "",
  title: "Mom",
  interactions: [],
});

describe("ConnectionDetails", () => {
  it("shows a one-off past date without an age or a countdown", async () => {
    await render(
      <ConnectionDetails
        connection={connectionDetail({
          dates: [{ label: "Moved away", date: "2020-05-01", yearly: false }],
        })}
      />,
    );

    expect(screen.getByText(/Moved away: May 1, 2020/)).toBeOnTheScreen();
    expect(screen.queryByText(/turns/)).not.toBeOnTheScreen();
  });

  it("hides closeness when none is set", async () => {
    await render(<ConnectionDetails connection={connectionDetail({ closeness: "" })} />);

    expect(screen.queryByText("Closeness")).not.toBeOnTheScreen();
  });
});

describe("ConnectionInteractions", () => {
  const talk: Interaction = {
    id: 5,
    day: torontoDay(new Date()),
    kind: "call",
    note: "",
    minutes: null,
    connections: [],
    circle: null,
  };

  it("changes the day of an Interaction being edited and shows a failed save", async () => {
    mockEdit.isError = true;
    pickOnAndroid(new Date(2026, 0, 5));

    await render(<ConnectionInteractions connectionId={3} interactions={[talk]} isOnline />);
    await userEvent.press(screen.getByRole("button", { name: "Edit" }));
    await userEvent.press(screen.getByLabelText(`Day: ${talk.day}`));

    expect(screen.getByLabelText("Day: 2026-01-05")).toBeOnTheScreen();
    expect(screen.getByText("Couldn't save. Try again.")).toBeOnTheScreen();
  });
});

describe("LinksField", () => {
  it("relabels only the link being edited", async () => {
    const onChange = jest.fn();

    const people = [
      { id: 1, name: "Ana" },
      { id: 2, name: "Bo" },
    ];

    const links = [
      { id: 1, label: "partner" },
      { id: 2, label: "friend" },
    ];

    await render(<LinksField links={links} people={people} onChange={onChange} />);
    await userEvent.paste(screen.getByLabelText("How Ana is linked"), "spouse");

    expect(onChange).toHaveBeenCalledWith([
      { id: 1, label: "spouse" },
      { id: 2, label: "friend" },
    ]);
  });
});

describe("GoalForm", () => {
  it("edits the why on the web, where the box has rows", async () => {
    webOnly();
    await render(
      <GoalForm
        goalId={1}
        goals={[]}
        initial={{ title: "Rest", why: "", state: "active", parentId: null }}
        saving={false}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    await userEvent.paste(screen.getByLabelText("Why"), "to feel well");

    expect(screen.getByDisplayValue("to feel well")).toBeOnTheScreen();
  });
});

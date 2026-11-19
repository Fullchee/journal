import { torontoDay, type InteractionProposal } from "@/core";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";

import { INTERACTION_OFFLINE_NOTICE, InteractionBox } from "@/components/interaction-box";
import {
  proposeInteraction,
  type ProposedInteraction,
  type ReadSentence,
} from "@/lib/data/interaction-draft";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../../jest/android-picker";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../../jest/route-mocks";

const mockOnline = { value: true };

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: () => mockOnline.value }));

const mockSave = {
  mutate: jest.fn<undefined, [ProposedInteraction, { onSuccess: () => void }]>(),
  isPending: false,
  isError: false,
};

jest.mock("@/lib/data/interaction-draft", () => ({
  proposeInteraction: jest.fn(),
  useSaveProposedInteraction: () => mockSave,
}));

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../../jest/route-mocks").mockUniwind(),
);

const CINDY = { id: 1, name: "Cindy" };
const RAJ = { id: 2, name: "Raj Patel" };
const RAJ_K = { id: 3, name: "Raj Kumar" };
const EVERYONE = [CINDY, RAJ, RAJ_K, { id: 4, name: "Priya Shah" }];

const TODAY = torontoDay(new Date());

const proposal = (overrides: Partial<InteractionProposal>): InteractionProposal => ({
  people: [{ said: "Cindy", matches: [CINDY] }],
  day: TODAY,
  kind: "in-person",
  note: "Went to Taiwan last week",
  followUp: "Ask about the Taiwan photos",
  ...overrides,
});

const { mutate } = mockSave;

beforeEach(() => {
  mockOnline.value = true;
  mutate.mockReset();
  jest.mocked(proposeInteraction).mockReset();
  mockSave.isError = false;
});

async function send(text: string, reply: InteractionProposal | ReadSentence) {
  jest
    .mocked(proposeInteraction)
    .mockResolvedValue("type" in reply ? reply : { type: "proposal", proposal: reply });
  await render(<InteractionBox everyone={EVERYONE} />);
  await userEvent.paste(screen.getByLabelText("Log an Interaction"), text);
  await userEvent.press(screen.getByLabelText("Read sentence"));
}

const saveButton = () => screen.getByRole("button", { name: "Save" });

it("opens the Cindy sentence as a prefilled form, and Save sends one Interaction with the follow-up", async () => {
  await send(" Today I talked to Cindy about how she went to Taiwan last week ", proposal({}));

  expect(proposeInteraction).toHaveBeenCalledWith(
    "Today I talked to Cindy about how she went to Taiwan last week",
  );
  expect(screen.getByText("Cindy")).toBeOnTheScreen();
  expect(screen.getByDisplayValue("Went to Taiwan last week")).toBeOnTheScreen();
  expect(screen.getByLabelText("Follow-up")).toHaveDisplayValue("Ask about the Taiwan photos");
  expect(screen.getByRole("radio", { name: "In person" })).toBeChecked();

  await userEvent.press(saveButton());

  expect(mutate).toHaveBeenCalledWith(
    {
      connectionIds: [1],
      day: TODAY,
      kind: "in-person",
      note: "Went to Taiwan last week",
      minutes: null,
      followUp: "Ask about the Taiwan photos",
    },
    expect.anything(),
  );
});

it("saves one Interaction on everyone named", async () => {
  await send(
    "Dinner with Cindy and Raj",
    proposal({
      people: [
        { said: "Cindy", matches: [CINDY] },
        { said: "Raj Patel", matches: [RAJ] },
      ],
    }),
  );

  await userEvent.press(saveButton());

  expect(mutate.mock.calls[0]?.[0]).toMatchObject({ connectionIds: [1, 2] });
});

it("a cleared follow-up and note save empty", async () => {
  await send("Called Cindy", proposal({ kind: "call" }));
  await userEvent.paste(screen.getByLabelText("Follow-up"), "  ");

  await userEvent.press(saveButton());

  expect(mutate.mock.calls[0]?.[0]).toMatchObject({ kind: "call", followUp: "" });
});

it("asks me to pick an unknown name from my Connections and never offers to create one", async () => {
  await send("Coffee with Pri", proposal({ people: [{ said: "Pri", matches: [] }] }));

  expect(screen.getByText("Nobody here is named “Pri”. Who is it?")).toBeOnTheScreen();
  expect(saveButton()).toBeDisabled();
  expect(screen.queryByText(/new person|create/i)).toBeNull();

  await userEvent.paste(screen.getByLabelText("Find Pri"), "pri");
  await userEvent.press(screen.getByRole("button", { name: "Priya Shah" }));
  await userEvent.press(saveButton());

  expect(mutate.mock.calls[0]?.[0]).toMatchObject({ connectionIds: [4] });
});

it("asks which one when a name matches several Connections", async () => {
  await send("Called Raj", proposal({ people: [{ said: "Raj", matches: [RAJ, RAJ_K] }] }));

  expect(screen.getByText("Which “Raj”?")).toBeOnTheScreen();
  expect(screen.queryByLabelText("Find Raj")).toBeNull();

  await userEvent.press(screen.getByRole("button", { name: "Raj Kumar" }));
  await userEvent.press(saveButton());

  expect(mutate.mock.calls[0]?.[0]).toMatchObject({ connectionIds: [3] });
});

it("Change reopens the picker, and Leave out drops a name", async () => {
  await send(
    "Dinner with Cindy and Pri",
    proposal({
      people: [
        { said: "Cindy", matches: [CINDY] },
        { said: "Pri", matches: [] },
      ],
    }),
  );

  await userEvent.press(screen.getByRole("button", { name: "Change" }));
  expect(screen.getByText("Who is “Cindy”?")).toBeOnTheScreen();
  await userEvent.paste(screen.getByLabelText("Find Cindy"), "cin");
  await userEvent.press(screen.getByRole("button", { name: "Cindy" }));

  await userEvent.press(screen.getByRole("button", { name: "Leave out Pri" }));
  await userEvent.press(saveButton());

  expect(mutate.mock.calls[0]?.[0]).toMatchObject({ connectionIds: [1] });
});

it("cannot save once everyone is left out", async () => {
  await send("Called Cindy", proposal({}));
  await userEvent.press(screen.getByRole("button", { name: "Leave out Cindy" }));

  expect(screen.getByText("Nobody left. Cancel and try again.")).toBeOnTheScreen();
  expect(saveButton()).toBeDisabled();
});

it("closes the form and keeps the sentence on Cancel", async () => {
  await send("Called Cindy", proposal({}));
  await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.getByLabelText("Log an Interaction")).toHaveDisplayValue("Called Cindy");
  expect(mutate).not.toHaveBeenCalled();
});

it("closes the form and clears the box once saved", async () => {
  mutate.mockImplementation((_body, { onSuccess }) => {
    onSuccess();
  });
  await send("Called Cindy", proposal({}));
  await userEvent.press(saveButton());

  expect(screen.getByLabelText("Log an Interaction")).toHaveDisplayValue("");
  expect(screen.getByText("Saved.")).toBeOnTheScreen();
});

it("shows why the sentence could not be read", async () => {
  await send("Nice day", { type: "unclear", text: "Who was it? Try again with their name." });

  expect(screen.getByText("Who was it? Try again with their name.")).toBeOnTheScreen();
  expect(screen.queryByRole("form")).toBeNull();
});

it("shows a failed save", async () => {
  mockSave.isError = true;
  await send("Called Cindy", proposal({}));

  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
});

it("shows the offline notice and sends nothing offline", async () => {
  mockOnline.value = false;
  await render(<InteractionBox everyone={EVERYONE} />);

  expect(screen.getByText(INTERACTION_OFFLINE_NOTICE)).toBeOnTheScreen();
  expect(screen.getByLabelText("Read sentence")).toBeDisabled();
  await fireEvent(screen.getByLabelText("Log an Interaction"), "submitEditing");
  expect(proposeInteraction).not.toHaveBeenCalled();
});

it("changes the day and the kind in the review form", async () => {
  pickOnAndroid(new Date(2026, 0, 5));
  await send("Called Cindy", proposal({}));
  await userEvent.press(screen.getByLabelText(`Day: ${TODAY}`));
  await userEvent.press(screen.getByRole("radio", { name: "Call" }));

  expect(screen.getByLabelText("Day: 2026-01-05")).toBeOnTheScreen();
  expect(screen.getByRole("radio", { name: "Call" })).toBeChecked();
});

it("reads the sentence from the keyboard's send key, and ignores an empty box", async () => {
  jest.mocked(proposeInteraction).mockResolvedValue({ type: "proposal", proposal: proposal({}) });
  await render(<InteractionBox everyone={EVERYONE} />);
  const box = screen.getByLabelText("Log an Interaction");

  await fireEvent(box, "submitEditing");

  expect(proposeInteraction).not.toHaveBeenCalled();

  await userEvent.paste(box, "Called Cindy");
  await fireEvent(box, "submitEditing");

  expect(proposeInteraction).toHaveBeenCalledWith("Called Cindy");
});

it("disables reading while the sentence is being read", async () => {
  jest.mocked(proposeInteraction).mockReturnValue(
    new Promise<never>(() => {
      // never answers, so the box stays busy
    }),
  );
  await render(<InteractionBox everyone={EVERYONE} />);
  await userEvent.paste(screen.getByLabelText("Log an Interaction"), "Called Cindy");
  await userEvent.press(screen.getByLabelText("Read sentence"));

  expect(screen.getByLabelText("Read sentence")).toBeDisabled();
});

import { shiftDay, torontoDay, type Connection, type Interaction } from "@/core";
import { render, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, within } from "expo-router/testing-library";
import { Alert } from "react-native";

import { ConnectionInteractions } from "@/components/connection-interactions";
import { INTERACTION_OFFLINE_NOTICE } from "@/components/interaction-box";
import { ConnectionsTodaySection } from "@/components/connections-today-section";
import { ApiError } from "@/lib/api/errors";
import type { ConnectionDetail, NewConnection } from "@/lib/data/connections";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setOnline } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { scrollableAround } from "../../jest/scrollable";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../jest/android-picker";

jest.mock("@/lib/data/data-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockDataProvider(),
);

jest.mock("@/lib/auth/auth-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockAuthProvider(),
);

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockUniwind(),
);

const person = (overrides: Partial<Connection> & Pick<Connection, "id" | "name">): Connection => ({
  closeness: "",
  circles: [],
  cadenceDays: null,
  lastContactedOn: null,
  followUps: "",
  howWeMet: "",
  metThrough: null,
  introduced: [],
  links: [],
  meetups: [],
  dates: [],
  growCloser: false,
  planCheckedAt: null,
  contactId: null,
  ...overrides,
});

const daysAgo = (days: number) => shiftDay(torontoDay(new Date()), -days);

const mockPeople = [
  person({
    id: 1,
    name: "Ana",
    closeness: "friend",
    circles: ["Coworkers", "Shockwave dragon boat"],
    cadenceDays: 30,
    lastContactedOn: daysAgo(2),
  }),
  person({
    id: 2,
    name: "Ben",
    closeness: "friend",
    circles: ["Coworkers"],
    cadenceDays: 7,
    lastContactedOn: daysAgo(10),
  }),
  person({ id: 3, name: "Mom", circles: ["Family"], cadenceDays: 7, lastContactedOn: daysAgo(30) }),
  person({ id: 4, name: "Zed", growCloser: true }),
];

const mockDetail: ConnectionDetail = {
  ...person({
    id: 3,
    name: "Mom",
    closeness: "close",
    circles: ["Family"],
    cadenceDays: 7,
    howWeMet: "Since birth",
    followUps: "- Her garden",
    meetups: [{ label: "Sunday dinner", days: [0], time: "18:00" }],
    dates: [{ label: "Birthday", date: "1960-03-12", yearly: true }],
  }),
  title: "Mom",
  body: "Loves **tulips**.",
  interactions: [
    {
      id: 8,
      day: "2026-11-06",
      kind: "in-person",
      note: "Planted tulips",
      minutes: 90,
      circle: null,
      connections: [
        { id: 1, name: "Ana" },
        { id: 3, name: "Mom" },
      ],
    },
    {
      id: 7,
      day: "2026-10-30",
      kind: "call",
      note: "",
      minutes: null,
      circle: null,
      connections: [{ id: 3, name: "Mom" }],
    },
  ],
};

interface Mutation {
  mutate: jest.Mock;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

const idle = (): Mutation => ({ mutate: jest.fn(), isPending: false, isError: false, error: null });

const noDetail: Partial<ConnectionDetail> = {};

const mockData = {
  /** What the people list answers; undefined until it loads. */
  // SAFETY: the mock starts loaded; a test sets it to undefined to model a list still on its way.
  listed: { connections: mockPeople } as { connections: Connection[] } | undefined,
  // SAFETY: the literal names the first of the three states a test may switch to.
  detailState: "found" as "found" | "failed" | "loading",
  found: [{ id: 3, name: "Mom", match: "Her garden" }],
  logInteraction: jest.fn(),
  create: idle(),
  update: idle(),
  notes: idle(),
  detail: noDetail,
  editInteraction: idle(),
  deleteInteraction: idle(),
};

jest.mock("@/lib/data/connections", () => ({
  useConnections: () => ({ data: mockData.listed }),
  useConnection: () =>
    mockData.detailState === "found"
      ? { connection: { ...mockDetail, ...mockData.detail }, isError: false }
      : { connection: undefined, isError: mockData.detailState === "failed" },
  useConnectionSearch: (q: string) => ({ data: q === "" ? undefined : mockData.found }),
  useLogInteraction: () => mockData.logInteraction,
  useEditInteraction: () => mockData.editInteraction,
  useDeleteInteraction: () => mockData.deleteInteraction,
  useCreateConnection: () => mockData.create,
  useUpdateConnection: () => mockData.update,
  useSaveConnectionNotes: () => mockData.notes,
}));

// The default modules are the web ones; a test swaps in Android's picker and photo.
interface Contacts {
  pick: (() => Promise<NewConnection | null>) | null;
  photo: string | null;
}

const mockContacts: Contacts = { pick: null, photo: null };

jest.mock("@/lib/contacts/pick-contact", () => ({
  get pickContact() {
    return mockContacts.pick;
  },
}));

jest.mock("@/lib/contacts/contact-photo", () => ({ useContactPhoto: () => mockContacts.photo }));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

beforeEach(() => {
  Object.assign(mockData, {
    create: idle(),
    update: idle(),
    notes: idle(),
    logInteraction: jest.fn(),
    editInteraction: idle(),
    deleteInteraction: idle(),
    detail: {},
    listed: { connections: mockPeople },
    detailState: "found",
  });
  Object.assign(mockContacts, { pick: null, photo: null });
});

afterEach(resetRouteMocks);

const listedNames = () =>
  screen.getAllByRole("link").map((link) =>
    within(link)
      .queryAllByText(/^(Ana|Ben|Mom|Zed)$/)[0]
      ?.children.at(0),
  );

describe("Connections tab", () => {
  it("groups people by closeness, overdue first, with when I last reached out", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    expect(listedNames()).toEqual(["Ben", "Ana", "Mom", "Zed"]);
    expect(screen.getByText("Friend")).toBeOnTheScreen();
    expect(screen.getByText("Everyone else")).toBeOnTheScreen();
    expect(screen.getByText("Overdue · Reached out: 10 days ago")).toBeOnTheScreen();
    expect(screen.getByText("Reached out: not yet")).toBeOnTheScreen();
  });

  it("filters by Circle, showing someone in two Circles under both", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    await userEvent.press(screen.getByRole("radio", { name: "Shockwave dragon boat" }));
    expect(listedNames()).toEqual(["Ana"]);

    await userEvent.press(screen.getByRole("radio", { name: "Coworkers" }));
    expect(listedNames()).toEqual(["Ben", "Ana"]);

    await userEvent.press(screen.getByRole("radio", { name: "Everyone" }));
    expect(listedNames()).toEqual(["Ben", "Ana", "Mom", "Zed"]);
  });

  it("searches on the server and shows why each person matched", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    await userEvent.paste(screen.getByLabelText("Search people"), "garden");
    await userEvent.press(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByText("Her garden")).toBeOnTheScreen();
    expect(screen.queryByText("Ben")).not.toBeOnTheScreen();

    await userEvent.paste(screen.getByLabelText("Search people"), "");
    expect(screen.getByText("Ben")).toBeOnTheScreen();
  });

  it("takes the first tap on Search while the keyboard is open", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    expect(scrollableAround(screen.getByRole("button", { name: "Search" }))).toHaveProp(
      "keyboardShouldPersistTaps",
      "handled",
    );
  });

  it("says when nobody matches", async () => {
    mockData.found = [];
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    await userEvent.paste(screen.getByLabelText("Search people"), "xyz");
    await userEvent.press(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByText("Nobody matches “xyz”.")).toBeOnTheScreen();
  });

  it("adds a new person by name", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    await userEvent.press(screen.getByRole("button", { name: "New person" }));
    await userEvent.paste(screen.getByLabelText("Name"), " Lee ");
    await userEvent.press(screen.getByRole("button", { name: "Add" }));

    expect(mockData.create.mutate).toHaveBeenCalledWith(
      { name: "Lee", dates: [], contactId: null },
      expect.anything(),
    );
  });

  it("shows no Pick from contacts button on web", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    await userEvent.press(screen.getByRole("button", { name: "New person" }));

    expect(screen.queryByRole("button", { name: "Pick from contacts" })).not.toBeOnTheScreen();
  });

  it("fills the name from a picked contact and adds their birthday and contact id", async () => {
    const birthday = { label: "Birthday", date: "--03-09", yearly: true };
    mockContacts.pick = () =>
      Promise.resolve({ name: "Priya Shah", dates: [birthday], contactId: "42" });
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    await userEvent.press(screen.getByRole("button", { name: "New person" }));
    await userEvent.press(screen.getByRole("button", { name: "Pick from contacts" }));

    expect(screen.getByLabelText("Name")).toHaveDisplayValue("Priya Shah");
    expect(screen.getByText("Adds birthday: Mar 9")).toBeOnTheScreen();

    await userEvent.paste(screen.getByLabelText("Name"), "Priya");
    await userEvent.press(screen.getByRole("button", { name: "Add" }));

    expect(mockData.create.mutate).toHaveBeenCalledWith(
      { name: "Priya", dates: [birthday], contactId: "42" },
      expect.anything(),
    );
  });

  it("keeps the typed name when contacts permission is denied", async () => {
    mockContacts.pick = () => Promise.resolve(null);
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    await userEvent.press(screen.getByRole("button", { name: "New person" }));
    await userEvent.paste(screen.getByLabelText("Name"), "Lee");
    await userEvent.press(screen.getByRole("button", { name: "Pick from contacts" }));

    expect(screen.getByLabelText("Name")).toHaveDisplayValue("Lee");
    expect(screen.queryByText(/^Adds birthday/)).not.toBeOnTheScreen();
  });

  it("explains a name already taken", async () => {
    mockData.create.error = new ApiError(409, null);
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    await userEvent.press(screen.getByRole("button", { name: "New person" }));

    expect(screen.getByText("Couldn't save. Check the name isn't already here.")).toBeOnTheScreen();
  });

  it("disables New person and search offline", async () => {
    setOnline(false);
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    expect(screen.getByRole("button", { name: "New person" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(screen.getByText("Editing needs a connection.")).toBeOnTheScreen();
    expect(screen.getByText(INTERACTION_OFFLINE_NOTICE)).toBeOnTheScreen();
  });

  it("shows the AI box on the list", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections" });

    expect(screen.getByLabelText("Log an Interaction")).toBeOnTheScreen();
  });
});

describe("a Connection", () => {
  it("shows its fields and Markdown notes", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.getByRole("heading", { name: "Mom" })).toBeOnTheScreen();

    for (const text of [
      "Close",
      "Family",
      "Weekly",
      "Since birth",
      "Sunday dinner · Sun at 6:00 PM",
      "- Her garden",
      "Loves **tulips**.",
    ])
      expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.getByText(/^Birthday: March 12/)).toBeOnTheScreen();
  });

  it("shows the linked phone contact's photo", async () => {
    mockContacts.photo = "content://contacts/42/photo";
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.getByLabelText("Photo of Mom")).toBeOnTheScreen();
  });

  it("shows no photo when the phone has none", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.queryByLabelText("Photo of Mom")).not.toBeOnTheScreen();
  });

  it("logs Reached out as an Interaction, offline too", async () => {
    setOnline(false);
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Reached out" }));
    await userEvent.paste(screen.getByLabelText(/What did you talk about/), "her garden");
    await userEvent.press(screen.getByRole("button", { name: "Log" }));

    expect(mockData.logInteraction).toHaveBeenCalledWith([3], {
      kind: "message",
      note: "her garden",
      minutes: null,
    });
  });

  it("lists its Interactions newest first, with who else was there", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    const list = within(screen.getByLabelText("Interactions"));
    const [newest, older] = list.getAllByText(/ · (In person|Call)/);

    expect(newest).toHaveTextContent(/^Nov 6(, 2026)? · In person · 1\.5 h$/);
    expect(older).toHaveTextContent(/^Oct 30(, 2026)? · Call$/);
    expect(list.getByText("Planted tulips")).toBeOnTheScreen();
    expect(list.getByText("With Ana")).toBeOnTheScreen();
  });

  it("edits an Interaction in place", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getAllByRole("button", { name: "Edit" })[1]!);
    await userEvent.press(screen.getByRole("radio", { name: "Message" }));
    await userEvent.paste(screen.getByLabelText(/What did you talk about/), "her garden");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(mockData.editInteraction.mutate).toHaveBeenCalledWith(
      { id: 7, edit: { day: "2026-10-30", kind: "message", note: "her garden", minutes: null } },
      expect.anything(),
    );
  });

  it("keeps an Interaction unchanged when its edit is cancelled", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getAllByRole("button", { name: "Edit" })[0]!);
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(mockData.editInteraction.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Planted tulips")).toBeOnTheScreen();
  });

  it("deletes an Interaction", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getAllByRole("button", { name: "Delete" })[0]!);

    expect(mockData.deleteInteraction.mutate).toHaveBeenCalledWith(8);
  });

  it("disables edits offline", async () => {
    setOnline(false);
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.getByRole("button", { name: "Edit details" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit notes" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Delete" })[0]).toBeDisabled();
    expect(screen.getByText("Editing needs a connection.")).toBeOnTheScreen();
  });

  it("edits the fields in place and saves them whole", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.paste(screen.getByLabelText("How we met"), "Hospital");
    await userEvent.press(screen.getByRole("radio", { name: "Friend" }));
    await userEvent.press(screen.getByRole("button", { name: "Add a date" }));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    const patch: unknown = expect.objectContaining({
      howWeMet: "Hospital",
      closeness: "friend",
      cadenceDays: 7,
      dates: [mockDetail.dates[0], expect.objectContaining({ label: "", yearly: true })],
    });

    expect(mockData.update.mutate).toHaveBeenCalledWith({ id: 3, patch }, expect.anything());
  });

  it("fills an empty reach-out cadence from the closeness picked", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.press(screen.getByRole("radio", { name: "No reminder" }));
    await userEvent.press(screen.getByRole("radio", { name: "Friend" }));

    expect(screen.getByRole("radio", { name: "Monthly" })).toBeChecked();
  });

  it("picks Circles, and adds a new one by name", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Family" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Coworkers" }));
    await userEvent.paste(screen.getByLabelText("New Circle"), " Mahjong ");
    await userEvent.press(screen.getByRole("button", { name: "Add Circle" }));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    const patch: unknown = expect.objectContaining({ circles: ["Coworkers", "Mahjong"] });

    expect(mockData.update.mutate).toHaveBeenCalledWith({ id: 3, patch }, expect.anything());
    expect(screen.getByLabelText("New Circle")).toHaveDisplayValue("");
  });

  it("joins a known Circle when its name is typed in another case", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await fireEvent(screen.getByLabelText("New Circle"), "submitEditing");
    await userEvent.paste(screen.getByLabelText("New Circle"), "coworkers");
    await fireEvent(screen.getByLabelText("New Circle"), "submitEditing");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    const patch: unknown = expect.objectContaining({ circles: ["Family", "Coworkers"] });

    expect(mockData.update.mutate).toHaveBeenCalledWith({ id: 3, patch }, expect.anything());
  });

  it("picks a date's day and a meetup's time with Android's dialogs, and clears the time", async () => {
    const picker = pickOnAndroid(new Date(1961, 4, 2), new Date(2026, 0, 1, 19, 15));

    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.press(screen.getByLabelText("Date: 1960-03-12"));
    await userEvent.press(screen.getByLabelText("Starts at: 6:00 PM"));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    const patch: unknown = expect.objectContaining({
      dates: [expect.objectContaining({ date: "1961-05-02" })],
      meetups: [expect.objectContaining({ time: "19:15" })],
    });

    expect(mockData.update.mutate).toHaveBeenLastCalledWith({ id: 3, patch }, expect.anything());

    await userEvent.press(screen.getByRole("button", { name: "Clear start time" }));

    expect(screen.getByLabelText("Starts at: not picked")).toBeOnTheScreen();
    picker.mockRestore();
  });

  it("shows who introduced us, linked people and who they introduced", async () => {
    mockData.detail = {
      metThrough: { id: 2, name: "Ben" },
      links: [{ id: 1, name: "Ana", label: "sister" }],
      introduced: [{ id: 4, name: "Zed" }],
    };
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.getByRole("link", { name: "Ben" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Ana · sister" })).toBeOnTheScreen();
    expect(
      within(screen.getByLabelText("Introduced me to")).getByRole("link", { name: "Zed" }),
    ).toBeOnTheScreen();
  });

  it("shows hours together toward the next mark for someone to grow closer to", async () => {
    const together: Interaction = {
      id: 9,
      day: "2026-11-01",
      kind: "in-person",
      note: "",
      minutes: 120,
      circle: null,
      connections: [{ id: 3, name: "Mom" }],
    };

    mockData.detail = {
      growCloser: true,
      interactions: [together, { ...together, id: 10 }, { ...together, id: 11 }],
    };
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.getByText("6 h of 50 h")).toBeOnTheScreen();
  });

  it("shows no hours together without Grow closer", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.queryByText("Hours together")).not.toBeOnTheScreen();
  });

  it("shows an age only when the year is known", async () => {
    mockData.detail = {
      dates: [
        { label: "Birthday", date: "--06-01", yearly: true },
        { label: "Anniversary", date: "1990-03-12", yearly: true },
      ],
    };
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.getByText(/^Anniversary: March 12 · turns \d+/)).toBeOnTheScreen();
    expect(screen.getByText(/^Birthday: June 1/)).not.toHaveTextContent(/turns/);
  });

  it("picks who introduced us and links someone with a label", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.paste(screen.getByLabelText("Find who introduced you"), "be");
    await userEvent.press(screen.getByRole("button", { name: "Ben" }));
    expect(screen.getByText("Met through Ben")).toBeOnTheScreen();

    await userEvent.paste(screen.getByLabelText("Find someone to link"), "an");
    expect(screen.queryByRole("button", { name: "Mom" })).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Ana" }));
    await userEvent.paste(screen.getByLabelText("How Ana is linked"), "sister");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    const patch: unknown = expect.objectContaining({
      metThroughId: 2,
      links: [{ id: 1, label: "sister" }],
    });

    expect(mockData.update.mutate).toHaveBeenCalledWith({ id: 3, patch }, expect.anything());
  });

  it("clears who introduced us and removes a link", async () => {
    mockData.detail = {
      metThrough: { id: 2, name: "Ben" },
      links: [{ id: 1, name: "Ana", label: "sister" }],
    };
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.press(screen.getByRole("button", { name: "Clear who introduced you" }));
    await userEvent.press(screen.getByRole("button", { name: "Unlink Ana" }));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    const patch: unknown = expect.objectContaining({ metThroughId: null, links: [] });

    expect(mockData.update.mutate).toHaveBeenCalledWith({ id: 3, patch }, expect.anything());
  });

  it("drops a yearly date's year and puts this year back", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.press(screen.getByLabelText("Year known"));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    const yearless: unknown = expect.objectContaining({ date: "--03-12" });
    const dropped: unknown = expect.objectContaining({ dates: [yearless] });

    expect(mockData.update.mutate).toHaveBeenLastCalledWith(
      { id: 3, patch: dropped },
      expect.anything(),
    );

    await userEvent.press(screen.getByLabelText("Year known"));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    const withThisYear: unknown = expect.objectContaining({
      date: `${torontoDay(new Date()).slice(0, 4)}-03-12`,
    });

    const restored: unknown = expect.objectContaining({ dates: [withThisYear] });

    expect(mockData.update.mutate).toHaveBeenLastCalledWith(
      { id: 3, patch: restored },
      expect.anything(),
    );
  });

  it("keeps a year when a yearless date stops repeating", async () => {
    mockData.detail = { dates: [{ label: "Party", date: "--03-12", yearly: true }] };
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    expect(screen.getByLabelText("Date: 2000-03-12")).toBeOnTheScreen();
    await userEvent.press(screen.getByLabelText("Every year"));
    expect(screen.queryByLabelText("Year known")).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    const dates = [
      { label: "Party", date: `${torontoDay(new Date()).slice(0, 4)}-03-12`, yearly: false },
    ];

    const patch: unknown = expect.objectContaining({ dates });

    expect(mockData.update.mutate).toHaveBeenLastCalledWith({ id: 3, patch }, expect.anything());
  });

  it("edits the notes in a plain text box", async () => {
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit notes" }));
    await userEvent.paste(screen.getByLabelText("Notes"), "Loves roses.");
    await userEvent.press(screen.getByRole("button", { name: "Save notes" }));

    expect(mockData.notes.mutate).toHaveBeenCalledWith("Loves roses.", expect.anything());
  });
});

describe("a Connection's edits", () => {
  it("leaves the notes editor on Cancel and once the notes are saved", async () => {
    mockData.notes.mutate.mockImplementation((_text, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit notes" }));
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit notes" })).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Edit notes" }));
    await userEvent.press(screen.getByRole("button", { name: "Save notes" }));
    expect(screen.getByRole("button", { name: "Edit notes" })).toBeOnTheScreen();
  });

  it("says when the notes didn't save", async () => {
    mockData.notes.isError = true;
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit notes" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save the notes. Try again.");
  });

  it("keeps typed notes through Edit details, and asks before leaving drops them", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "Cancel")?.onPress?.();
    });

    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });
    await userEvent.press(screen.getByRole("button", { name: "Edit notes" }));
    await userEvent.paste(screen.getByLabelText("Notes"), "Loves roses.");
    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByLabelText("Notes")).toHaveDisplayValue("Loves roses.");

    await act(() => router.replace("/connections"));

    expect(alert).toHaveBeenCalledWith(
      "Discard edits?",
      expect.stringContaining("are not saved."),
      expect.any(Array),
      expect.any(Object),
    );
    alert.mockRestore();
  });

  it("asks before leaving drops changed details, and not for untouched ones", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "Cancel")?.onPress?.();
    });

    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });
    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.paste(screen.getByLabelText("Name"), "Someone else");
    await act(() => router.replace("/connections"));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen).toHavePathname("/connections/3");

    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await act(() => router.replace("/connections"));

    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it("leaves the details editor on Cancel and once the details are saved", async () => {
    mockData.update.mutate.mockImplementation((_change, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit details" })).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Edit details" })).toBeOnTheScreen();
  });

  it("says when the details didn't save", async () => {
    mockData.update.isError = true;
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.getByText("Couldn't save. Check the name isn't taken.")).toBeOnTheScreen();
  });

  it("opens the details editor before the people list has loaded", async () => {
    mockData.listed = undefined;
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    await userEvent.press(screen.getByRole("button", { name: "Edit details" }));

    expect(screen.getByLabelText("How we met")).toBeOnTheScreen();
  });

  it("says so while the Connection loads", async () => {
    mockData.detailState = "loading";
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.getByText("Loading…")).toBeOnTheScreen();
  });

  it("says when the Connection can't be loaded", async () => {
    mockData.detailState = "failed";
    await renderRouter(APP_DIR, { initialUrl: "/connections/3" });

    expect(screen.getByText("Couldn't load this Connection.")).toBeOnTheScreen();
  });
});

describe("ConnectionInteractions", () => {
  it("says when nobody has been in touch yet", async () => {
    await render(<ConnectionInteractions connectionId={3} interactions={[]} isOnline />);

    expect(screen.getByText("None yet.")).toBeOnTheScreen();
  });
});

describe("ConnectionsTodaySection", () => {
  it("saves a Grow closer answer as planChecked", async () => {
    await render(<ConnectionsTodaySection />);

    await userEvent.press(screen.getByRole("button", { name: "Made a plan" }));

    expect(mockData.update.mutate).toHaveBeenCalledWith({ id: 4, patch: { planChecked: true } });
  });

  it("queues Reached out for an overdue person", async () => {
    await render(<ConnectionsTodaySection />);

    await userEvent.press(screen.getAllByRole("button", { name: "Reached out" })[0]!);
    await userEvent.press(screen.getByRole("button", { name: "Log" }));

    expect(mockData.logInteraction).toHaveBeenCalledWith([3], {
      kind: "message",
      note: "",
      minutes: null,
    });
  });
});

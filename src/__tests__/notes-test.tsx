import { blankHabit, type Habit } from "@/core";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  act,
  renderRouter,
  screen,
  testRouter,
  waitFor,
  within,
} from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError, NetworkError } from "@/lib/api/errors";
import type { GoalDraft, Note, NoteBody, NoteListBody, HealthPlanBody } from "@/lib/data/notes";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import {
  preloadRoutes,
  resetRouteMocks,
  routeQueryClient,
  setOnline,
  setRouteQueryClient,
} from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, type Respond } from "../../jest/fake-api";

jest.mock("@/lib/data/data-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockDataProvider(),
);

jest.mock("@/lib/auth/auth-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockAuthProvider(),
);

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockUniwind(),
);

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const mockWindow = { width: 390 };

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWindow.width, height: 900, scale: 1, fontScale: 1 }),
}));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

const habit = (fields: Partial<Habit> & Pick<Habit, "id" | "name">): Habit => ({
  ...blankHabit("good"),
  ...fields,
});

const LIBRARY = [
  habit({
    id: "sleep-hygiene",
    name: "Sleep hygiene",
    description: "# Sleep hygiene\nDim the lights.\n\n## Research\nWalker 2017.",
    target: { type: "none", count: 0, days: [] },
  }),
];

const TRACKED = [
  habit({ id: "walk", name: "Walk", goals: [1] }),
  habit({ id: "gym", name: "Gym", goals: [] }),
];

// Only a Goal row has a parent; the other types' rows carry null.
const row = (id: number, title: string, detail: string, parentId: number | null = null) => ({
  id,
  title,
  detail,
  updatedAt: "2026-11-01T00:00:00Z",
  parentId,
});

// Move every day > Walk the dog > Morning walk; Sleep is a second top-level Goal; Nap serves Rest, a retired one.
const GOALS = [
  row(1, "Move every day", "active", null),
  row(4, "Walk the dog", "active", 1),
  row(5, "Morning walk", "active", 4),
  row(6, "Sleep", "active", null),
  row(7, "Rest", "retired", null),
  row(8, "Nap", "active", 7),
];

const LISTS = new Map([
  ["goals", GOALS],
  ["reflections", [row(2, "2026-W44", "week")]],
  ["health-records", [row(3, "Finding a Coach", "2026-11-05T10:00:00Z")]],
]);

const PLAN = "## Next action\nCall the clinic.";

// Answers like journal's notes, Health plan and habits endpoints; a write takes the next of `failures` first.
function serveNotes({
  extraGoals = [],
  rewrite = {},
}: {
  extraGoals?: ReturnType<typeof row>[];
  /** Changes a stored note before it is served, by `type/id`. */
  rewrite?: Record<string, (note: Note) => Note>;
} = {}) {
  const failures: Error[] = [];

  const notes = new Map<string, Note>([
    [
      "goals/1",
      {
        ...row(1, "Move every day", "active", null),
        why: "Energy for the kids.",
        body: "Walk daily.",
      },
    ],
    ["goals/4", { ...row(4, "Walk the dog", "active", 1), why: "", body: "" }],
    ["goals/8", { ...row(8, "Nap", "active", 7), why: "", body: "" }],
    ["reflections/2", { ...row(2, "2026-W44", "week"), body: "Slept well." }],
  ]);

  for (const [key, change] of Object.entries(rewrite)) {
    const note = notes.get(key);

    if (note) notes.set(key, change(note));
  }

  let plan = PLAN;

  const failNext = () => {
    const failure = failures.shift();

    if (failure) throw failure;
  };

  const planBody = (): HealthPlanBody => ({ item: { body: plan, updatedAt: null } });

  const noteAt = (key: string) => {
    const note = notes.get(key);

    if (!note) throw new ApiError(404, { error: "not found" });

    return note;
  };

  const answer = (key: string, item: Note): NoteBody => {
    notes.set(key, item);

    return { item };
  };

  const notesRoutes = new Map<string, Respond>();

  for (const [type, listed] of LISTS) {
    const items = type === "goals" ? [...listed, ...extraGoals] : listed;

    notesRoutes.set(`/api/notes/${type}`, () => ({ items }) satisfies NoteListBody);

    for (const { id } of items) {
      const key = `${type}/${id}`;
      const path = `/api/notes/${key}`;

      notesRoutes.set(path, () => answer(key, noteAt(key)));

      notesRoutes.set(`PUT ${path}`, ({ body }) => {
        failNext();

        // SAFETY: useSaveNoteBody is the only note PUT, and it sends `{ body }`.
        return answer(key, { ...noteAt(key), body: (body as { body: string }).body });
      });

      notesRoutes.set(`PATCH ${path}`, ({ body }) => {
        failNext();

        // SAFETY: useSaveGoal is the only note PATCH, and it sends a GoalDraft.
        const { title, why, state, parentId } = body as GoalDraft;

        return answer(key, { ...noteAt(key), title, why, detail: state, parentId });
      });
    }
  }

  const { writes } = fakeApi({
    "/api/health-plan": planBody,
    "PUT /api/health-plan": ({ body }) => {
      failNext();
      // SAFETY: useSaveHealthPlan is the only PUT to this path, and it sends `{ body }`.
      plan = (body as { body: string }).body;

      return planBody();
    },
    "/api/habits": () => ({ habits: TRACKED }),
    "/api/habits?view=library": () => ({ habits: LIBRARY }),
    ...Object.fromEntries(notesRoutes),
  });

  return { writes, failures };
}

beforeEach(() => {
  mockWindow.width = 390;
  setRouteQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
});

afterEach(resetRouteMocks);

describe("Health plan", () => {
  it("shows the plan in large type with its links", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/health-plan" });

    expect(await screen.findByText(PLAN)).toBeOnTheScreen();
    expect(screen.getByText("Session brief")).toBeOnTheScreen();
  });

  it("opens offline from the cached plan, with editing disabled", async () => {
    jest.mocked(apiFetch).mockRejectedValue(new NetworkError("offline"));
    setOnline(false);
    routeQueryClient().setQueryData(["health-plan"], {
      item: { body: PLAN, updatedAt: null },
    } satisfies HealthPlanBody);

    await renderRouter(APP_DIR, { initialUrl: "/health-plan" });

    expect(screen.getByText(PLAN)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.getByText("Editing needs a connection.")).toBeOnTheScreen();
  });

  it("says the plan is not on this device when offline with nothing cached", async () => {
    serveNotes();
    onlineManager.setOnline(false);
    await renderRouter(APP_DIR, { initialUrl: "/health-plan" });

    expect(await screen.findByText(/Not on this device yet/)).toBeOnTheScreen();
  });

  it("keeps Notes below the plan when a link opens it in a running app", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/" });

    await act(() => {
      router.navigate("/health-plan");
    });
    expect(screen).toHavePathname("/health-plan");

    await testRouter.back();
    expect(screen).toHavePathname("/notes");
  });

  it("edits and saves the plan", async () => {
    const { writes } = serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/health-plan" });

    await userEvent.press(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.paste(screen.getByLabelText("Markdown"), "Call the GP.");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved.")).toBeOnTheScreen();
    expect(screen.getByText("Call the GP.")).toBeOnTheScreen();
    expect(writes).toEqual([
      { path: "/api/health-plan", method: "PUT", body: { body: "Call the GP." } },
    ]);
  });
});

const goalRow = async (title: string) =>
  screen.findByRole("link", { name: new RegExp(`^${title}`) });

describe("Notes list", () => {
  it("lists every section under the pinned Health plan", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes" });

    expect(await screen.findByText("Finding a Coach")).toBeOnTheScreen();

    for (const text of ["Health plan", "Sleep hygiene", "Move every day", "2026-W44"]) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }

    expect(screen.getByText("Updated 2026-11-05")).toBeOnTheScreen();
  });

  it.each([
    ["/notes", "Library"],
    ["/notes?type=health-records", "Health records"],
    ["/notes?type=unknown", "Library"],
  ])("puts the section %s picks first", async (initialUrl, heading) => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl });
    await screen.findByText("Finding a Coach");

    const headings = screen.getAllByText(/^(Library|Goals|Reflections|Health records)$/);

    expect(headings[0]).toHaveTextContent(heading);
    expect(headings).toHaveLength(4);
  });

  it("searches across all four sections", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes" });
    await screen.findByText("Finding a Coach");

    await userEvent.paste(screen.getByLabelText("Search notes"), "research");
    expect(screen.getByText("Sleep hygiene")).toBeOnTheScreen();
    expect(screen.queryByText("Move every day")).not.toBeOnTheScreen();

    await userEvent.paste(screen.getByLabelText("Search notes"), "coach");
    expect(screen.getByText("Finding a Coach")).toBeOnTheScreen();
    expect(screen.queryByText("Sleep hygiene")).not.toBeOnTheScreen();

    await userEvent.paste(screen.getByLabelText("Search notes"), "zebra");
    expect(screen.getByText("No notes match.")).toBeOnTheScreen();
  });

  it("indents each Goal under the Goal it serves", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes" });

    expect(await goalRow("Move every day")).not.toHaveProp(
      "className",
      expect.stringContaining("pl-"),
    );
    expect(await goalRow("Walk the dog")).toHaveProp("className", expect.stringContaining("pl-6"));
    expect(await goalRow("Morning walk")).toHaveProp("className", expect.stringContaining("pl-12"));
    expect(await goalRow("Rest")).toHaveTextContent(/retired/);
  });

  it("lists matching Goals flat while searching", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes" });
    await screen.findByText("Finding a Coach");

    await userEvent.paste(screen.getByLabelText("Search notes"), "walk");

    expect(screen.getByRole("link", { name: /^Morning walk/ })).not.toHaveProp(
      "className",
      expect.stringContaining("pl-"),
    );
    expect(screen.getByRole("link", { name: /^Walk the dog/ })).not.toHaveProp(
      "className",
      expect.stringContaining("pl-"),
    );
    expect(screen.queryByText("Move every day")).not.toBeOnTheScreen();
  });

  it("says notes are missing when offline with nothing cached", async () => {
    jest.mocked(apiFetch).mockRejectedValue(new NetworkError("offline"));
    setOnline(false);
    await renderRouter(APP_DIR, { initialUrl: "/notes" });

    expect(await screen.findByText("Some notes are not on this device yet.")).toBeOnTheScreen();
  });

  it("opens the Weekly retro from beside the pinned rows", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes" });

    await screen.findByText("2026-W44");
    const [plan, parts, retro] = screen.getAllByRole("link");
    expect(plan).toHaveTextContent(/^Health plan/);
    expect(parts).toHaveTextContent(/^Parts/);
    expect(retro).toHaveTextContent(/^Write the Weekly retro/);

    await userEvent.press(screen.getByText("Write the Weekly retro"));

    expect(screen).toHavePathname("/weekly-review");
  });

  it("opens Close a quarter or year from the top of Reflections", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes" });

    await userEvent.press(await screen.findByText("Close a quarter or year"));

    expect(screen).toHavePathname("/close-period");
  });

  it("opens a note from the list", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes" });

    await userEvent.press(await screen.findByText("2026-W44"));

    expect(screen).toHavePathname("/notes/reflections/2");
  });

  it("shows the list beside the note on wide screens", async () => {
    mockWindow.width = 1024;
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/reflections/2" });

    expect(screen.getByTestId("list-pane")).toBeOnTheScreen();
    expect(await screen.findByText("Slept well.")).toBeOnTheScreen();
    expect(screen.getAllByText("2026-W44").length).toBeGreaterThan(0);
  });
});

describe("Reflection and Health record", () => {
  it("edits the body in a TextInput and saves it", async () => {
    const { writes } = serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/reflections/2" });

    await userEvent.press(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.paste(screen.getByLabelText("Markdown"), "Slept badly.");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Slept badly.")).toBeOnTheScreen();
    expect(writes).toEqual([
      { path: "/api/notes/reflections/2", method: "PUT", body: { body: "Slept badly." } },
    ]);
  });

  it("keeps the draft and says why when a save fails", async () => {
    const { failures } = serveNotes();
    failures.push(new ApiError(413, { error: "too large" }));
    await renderRouter(APP_DIR, { initialUrl: "/notes/reflections/2" });

    await userEvent.press(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.paste(screen.getByLabelText("Markdown"), "Very long.");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Too long to save (limit about 90 KB).")).toBeOnTheScreen();
    expect(screen.getByLabelText("Markdown")).toHaveDisplayValue("Very long.");
  });

  it("cancels an edit", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/reflections/2" });

    await userEvent.press(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Slept well.")).toBeOnTheScreen();
  });

  it("asks before leaving drops an edited note", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "Cancel")?.onPress?.();
    });

    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/reflections/2" });
    await userEvent.press(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.paste(screen.getByLabelText("Markdown"), "Slept badly.");

    await act(() => router.replace("/notes"));

    expect(alert).toHaveBeenCalledWith(
      "Discard edits?",
      "Your edits to this note are not saved.",
      expect.any(Array),
      expect.any(Object),
    );
    expect(screen.getByLabelText("Markdown")).toHaveDisplayValue("Slept badly.");
    alert.mockRestore();
  });

  it("says an empty note has nothing written, with a button to write it", async () => {
    serveNotes({ rewrite: { "reflections/2": (note) => ({ ...note, body: " " }) } });
    await renderRouter(APP_DIR, { initialUrl: "/notes/reflections/2" });

    expect(await screen.findByText("Nothing written yet.")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Write it" }));

    expect(screen.getByLabelText("Markdown")).toBeOnTheScreen();
  });

  it("says when a note is missing, and Retry reads it again", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/health-records/3" });

    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't load/);

    const reads = jest.mocked(apiFetch).mock.calls.length;

    await userEvent.press(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(jest.mocked(apiFetch).mock.calls.length).toBeGreaterThan(reads));
  });

  it("rejects an unknown note type", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/recipes/1" });

    expect(screen.getByText("Unknown note type.")).toBeOnTheScreen();
  });
});

describe("Goal", () => {
  it("shows direction, state, why, linked Habits and notes", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/goals/1" });

    expect(await screen.findByText("Energy for the kids.")).toBeOnTheScreen();
    expect(screen.getByText("active")).toBeOnTheScreen();
    expect(await screen.findByText("• Walk")).toBeOnTheScreen();
    expect(screen.queryByText("• Gym")).not.toBeOnTheScreen();
    expect(screen.getByText("Walk daily.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Edit notes" })).toBeOnTheScreen();
  });

  it("edits the direction, why and state", async () => {
    const { writes } = serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/goals/1" });

    await userEvent.press(await screen.findByRole("button", { name: "Edit goal" }));
    await userEvent.paste(screen.getByLabelText("Direction"), "  Move most days ");
    await userEvent.press(screen.getByRole("radio", { name: "achieved" }));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("achieved")).toBeOnTheScreen();
    expect(writes).toEqual([
      {
        path: "/api/notes/goals/1",
        method: "PATCH",
        body: {
          title: "Move most days",
          why: "Energy for the kids.",
          state: "achieved",
          parentId: null,
        },
      },
    ]);
  });

  it("links the Goals it is broken into, and the Goal it serves", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/goals/1" });

    expect(await screen.findByRole("heading", { name: "Broken into" })).toBeOnTheScreen();
    expect(screen.queryByRole("heading", { name: "Serves" })).not.toBeOnTheScreen();
    expect(screen.queryByRole("link", { name: /^Morning walk/ })).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole("link", { name: /^Walk the dog/ }));
    expect(screen).toHavePathname("/notes/goals/4");

    expect(await screen.findByRole("heading", { name: "Serves" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: /^Move every day/ })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: /^Morning walk/ })).toBeOnTheScreen();
  });

  it("picks the Goal it serves from other active Goals, never its own subtree", async () => {
    const { writes } = serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/goals/4" });

    await userEvent.press(await screen.findByRole("button", { name: "Edit goal" }));

    const serves = screen.getByLabelText("Serves");

    expect(within(serves).getAllByRole("radio")).toHaveLength(4);

    for (const name of ["None (top-level)", "Move every day", "Nap", "Sleep"])
      expect(within(serves).getByRole("radio", { name })).toBeOnTheScreen();

    for (const name of ["Walk the dog", "Morning walk", "Rest"])
      expect(within(serves).queryByRole("radio", { name })).not.toBeOnTheScreen();

    expect(within(serves).getByRole("radio", { name: "Move every day" })).toBeChecked();

    await userEvent.press(within(serves).getByRole("radio", { name: "Sleep" }));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(writes).toEqual([
        {
          path: "/api/notes/goals/4",
          method: "PATCH",
          body: { title: "Walk the dog", why: "", state: "active", parentId: 6 },
        },
      ]),
    );
  });

  it("keeps a retired parent as a choice so the current pick shows", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/goals/8" });

    await userEvent.press(await screen.findByRole("button", { name: "Edit goal" }));

    expect(
      within(screen.getByLabelText("Serves")).getByRole("radio", { name: "Rest" }),
    ).toBeChecked();
  });

  it("moves a Goal to the top level", async () => {
    const { writes } = serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/goals/4" });

    await userEvent.press(await screen.findByRole("button", { name: "Edit goal" }));
    await userEvent.press(screen.getByRole("radio", { name: "None (top-level)" }));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(writes.at(-1)?.body).toEqual(expect.objectContaining({ parentId: null })),
    );
  });

  it("shows a title clash", async () => {
    const { failures } = serveNotes();
    failures.push(new ApiError(409, { error: "a note with that title exists" }));
    await renderRouter(APP_DIR, { initialUrl: "/notes/goals/1" });

    await userEvent.press(await screen.findByRole("button", { name: "Edit goal" }));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Couldn't save. Check the title isn't already a goal."),
    ).toBeOnTheScreen();
  });

  it("cannot save without a direction", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/notes/goals/1" });

    await userEvent.press(await screen.findByRole("button", { name: "Edit goal" }));
    await userEvent.paste(screen.getByLabelText("Direction"), " ");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit goal" })).toBeOnTheScreen();
  });
});

describe("Goal outside the usual shape", () => {
  it("sorts the Goals it is broken into, and edits a Goal with no why from its stated state", async () => {
    serveNotes({
      extraGoals: [row(10, "Rest more", "active", 8), row(9, "Doze", "active", 8)],
      rewrite: {
        "goals/8": ({ why: _why, ...note }) => ({ ...note, detail: "paused" }),
      },
    });
    await renderRouter(APP_DIR, { initialUrl: "/notes/goals/8" });

    const broken = await screen.findAllByText(/^(Doze|Rest more)/);

    expect(broken[0]).toHaveTextContent(/^Doze/);
    expect(broken[1]).toHaveTextContent(/^Rest more/);
    expect(screen.getByText("paused")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Edit goal" }));

    expect(screen.getByRole("radio", { name: "active" })).toBeChecked();
    expect(screen.getByLabelText("Why")).toHaveDisplayValue("");
  });

  it("shows the Goal while the Goals list can't be read", async () => {
    serveNotes();
    const answer = jest.mocked(apiFetch).getMockImplementation();

    jest
      .mocked(apiFetch)
      .mockImplementation((path, init, schema) =>
        path === "/api/notes/goals"
          ? Promise.reject(new ApiError(500, null))
          : (answer?.(path, init, schema) ?? Promise.resolve(undefined)),
      );
    await renderRouter(APP_DIR, { initialUrl: "/notes/goals/1" });

    expect(await screen.findByText("Energy for the kids.")).toBeOnTheScreen();
    expect(screen.queryByText("Serves")).not.toBeOnTheScreen();
  });
});

describe("Library", () => {
  it("lists reference Habits", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/library" });

    expect(await screen.findByText("Sleep hygiene")).toBeOnTheScreen();
  });

  it("shows the prose without repeating the name, and Edit opens the Habit editor", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/library/sleep-hygiene" });

    expect(
      await screen.findByText(/^Dim the lights\. ## Research Walker 2017\.$/),
    ).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Edit" }));
    // The Habits tab hands `?edit=` on to the editor route.
    await waitFor(() => expect(screen).toHavePathname("/habit/sleep-hygiene"));
  });

  it("says when a Habit is not in the Library", async () => {
    serveNotes();
    await renderRouter(APP_DIR, { initialUrl: "/library/walk" });

    expect(await screen.findByText("Not in the Library.")).toBeOnTheScreen();
  });
});

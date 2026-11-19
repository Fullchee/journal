import { torontoDay, shiftDay, type Connection } from "@/core";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";

import { ConnectionList } from "@/components/connection-list";
import type { NewConnection } from "@/lib/data/connections";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { connection } from "../../../jest/fixtures";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Link: ({ children }: { children: unknown }) => children,
}));

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: () => true }));

jest.mock("@/components/interaction-box", () => ({ InteractionBox: () => null }));

interface State {
  list: {
    data: { connections: Connection[] } | undefined;
    isError: boolean;
    refetch?: () => Promise<void>;
  };
  create: { mutate: jest.Mock; isPending: boolean; error: Error | null };
  search: { data: undefined; isError: boolean };
}

const mockState: State = {
  list: { data: { connections: [] }, isError: false },
  create: { mutate: jest.fn(), isPending: false, error: null },
  search: { data: undefined, isError: false },
};

jest.mock("@/lib/data/connections", () => ({
  useConnections: () => mockState.list,
  useConnectionSearch: () => mockState.search,
  useCreateConnection: () => mockState.create,
}));

const TODAY = torontoDay(new Date());

const reached = (days: number) => shiftDay(TODAY, -days);

const showing = (connections: Connection[]) => {
  mockState.list = { data: { connections }, isError: false };
};

const search = async () => {
  await userEvent.paste(screen.getByLabelText("Search people"), "ana");
  await fireEvent(screen.getByLabelText("Search people"), "submitEditing");
};

beforeEach(() => {
  showing([]);
  mockState.create = { mutate: jest.fn(), isPending: false, error: null };
  mockState.search = { data: undefined, isError: false };
});

describe("ConnectionList", () => {
  it("lists the most overdue first, then the ones not due", async () => {
    showing([
      connection({ id: 1, name: "Fresh", cadenceDays: 7, lastContactedOn: reached(1) }),
      connection({ id: 2, name: "Late", cadenceDays: 7, lastContactedOn: reached(20) }),
      connection({ id: 3, name: "Later", cadenceDays: 7, lastContactedOn: reached(60) }),
      connection({ id: 4, name: "Fresher", cadenceDays: 7, lastContactedOn: reached(2) }),
    ]);

    await render(<ConnectionList />);

    const names = screen
      .getAllByText(/^(Fresh|Late|Later|Fresher)$/)
      .map((n) => String(n.props["children"]));

    expect(names).toEqual(["Later", "Late", "Fresh", "Fresher"]);
  });

  it("says why nobody is here yet, above the button that adds someone", async () => {
    await render(<ConnectionList />);

    expect(
      screen.getByText("Nobody here yet. Add the people you want to keep in touch with."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "New person" })).toBeOnTheScreen();
  });

  it("says when Connections fail to load, and retries", async () => {
    const refetch = jest.fn(() => Promise.resolve());

    mockState.list = { data: undefined, isError: true, refetch };

    await render(<ConnectionList />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load Connections.");
    expect(screen.queryByText(/Nobody here yet/)).toBeNull();

    await userEvent.press(screen.getByRole("button", { name: "Retry" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("adds a person and opens them", async () => {
    const { mutate } = mockState.create;

    mutate.mockImplementation(
      (_person: NewConnection, { onSuccess }: { onSuccess: (created: { id: number }) => void }) => {
        onSuccess({ id: 7 });
      },
    );
    await render(<ConnectionList />);
    await userEvent.press(screen.getByRole("button", { name: "New person" }));
    await userEvent.paste(screen.getByLabelText("Name"), " Ana ");
    await userEvent.press(screen.getByRole("button", { name: "Add" }));

    expect(mutate).toHaveBeenCalledWith(
      { name: "Ana", dates: [], contactId: null },
      expect.anything(),
    );
    expect(router.push).toHaveBeenCalledWith("/connections/7");
    expect(screen.getByRole("button", { name: "New person" })).toBeOnTheScreen();
  });

  it("cancels a new person", async () => {
    await render(<ConnectionList />);
    await userEvent.press(screen.getByRole("button", { name: "New person" }));
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "New person" })).toBeOnTheScreen();
  });

  it("asks to try again when a save fails for another reason than a duplicate name", async () => {
    mockState.create.error = new Error("offline");

    await render(<ConnectionList />);
    await userEvent.press(screen.getByRole("button", { name: "New person" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
  });
});

describe("search", () => {
  it("says it is searching until the answer arrives", async () => {
    mockState.search.isError = false;

    await render(<ConnectionList />);
    await search();

    expect(screen.getByText("Searching…")).toBeOnTheScreen();
  });

  it("says when the search fails", async () => {
    mockState.search.isError = true;

    await render(<ConnectionList />);
    await search();

    expect(screen.getByText("Couldn't search. Try again.")).toBeOnTheScreen();
  });
});

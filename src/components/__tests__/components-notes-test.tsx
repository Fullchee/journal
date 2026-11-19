import { render, screen, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import type * as ReactNative from "react-native";
import { Linking, Platform } from "react-native";

import { dismissModal } from "@/components/modal-header";
import { ModalFrame } from "@/components/modal-frame.web";
import { EditButton, NoteBody, NoteMarkdown } from "@/components/note-body";
import { NotesList } from "@/components/notes-list";
import { PartForm } from "@/components/part-form";
import { useIsOnline } from "@/lib/data/data-provider";

jest.mock("expo-router", () => ({
  router: { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Link: ({ children }: { children: unknown }) => children,
  usePathname: () => "/notes",
  useGlobalSearchParams: () => ({}),
  usePreventRemove: jest.fn(),
}));

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: jest.fn(() => true) }));

jest.mock("@/lib/data/habits", () => ({ useHabitLibrary: () => ({ data: { habits: [] } }) }));

jest.mock("@/lib/data/pillars", () => ({ usePillarBars: () => ({ data: { bars: [] } }) }));

jest.mock("@/lib/data/notes", () => ({
  ...jest.requireActual<object>("@/lib/data/notes"),
  useNoteList: () => ({ data: { items: [] } }),
}));

// The native Markdown view drops link presses under Jest, so a stand-in presses both kinds of link.
jest.mock("@/ui", () => {
  const { Pressable, Text } = jest.requireActual<typeof ReactNative>("react-native");

  return {
    ...jest.requireActual<object>("@/ui"),
    Markdown: ({ onLinkPress }: { onLinkPress: (url: string) => void }) => (
      <Pressable onPress={() => onLinkPress("https://example.com")}>
        <Text>external link</Text>
      </Pressable>
    ),
  };
});

beforeEach(() => {
  jest.mocked(useIsOnline).mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("dismissModal", () => {
  it("goes home when nothing is under the modal", () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);

    dismissModal();

    expect(router.replace).toHaveBeenCalledWith("/");
  });
});

describe("ModalFrame on the web", () => {
  const addListener = jest.fn<undefined, [string, EventListener]>();
  const removeListener = jest.fn();

  const press = (key: string) => {
    const listener = addListener.mock.lastCall?.[1];

    listener?.(Object.assign(new Event("keydown"), { key }));
  };

  beforeEach(() => {
    addListener.mockClear();
    Object.defineProperties(globalThis, {
      addEventListener: { value: addListener, configurable: true },
      removeEventListener: { value: removeListener, configurable: true },
    });
    jest.mocked(router.canGoBack).mockReturnValue(true);
  });

  it("closes on Escape and ignores other keys", async () => {
    await render(
      <ModalFrame title="Log" variant="dialog">
        {null}
      </ModalFrame>,
    );

    press("a");
    expect(router.back).not.toHaveBeenCalled();

    press("Escape");
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("stops listening for keys once it closes", async () => {
    const { unmount } = await render(
      <ModalFrame title="Log" variant="side-sheet">
        {null}
      </ModalFrame>,
    );

    await unmount();

    expect(removeListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});

describe("notes", () => {
  it("opens an outside link in the browser", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

    await render(<NoteMarkdown markdown="[x](https://example.com)" />);
    await userEvent.press(screen.getByText("external link"));

    expect(open).toHaveBeenCalledWith("https://example.com");
  });

  it("says a blank note has nothing written yet", async () => {
    await render(<NoteMarkdown markdown=" " />);

    expect(screen.getByText("Nothing written yet.")).toBeOnTheScreen();
  });

  it("explains why Edit is disabled offline", async () => {
    jest.mocked(useIsOnline).mockReturnValue(false);

    await render(<EditButton onPress={jest.fn()} />);

    expect(screen.getByText(/connection/i)).toBeOnTheScreen();
  });

  it("explains why Save is disabled offline, and edits on a taller box on the web", async () => {
    jest.replaceProperty(Platform, "OS", "web");

    // SAFETY: NoteBody reads only status, error, mutate, reset and isPending from its mutation.
    const save = {
      status: "idle",
      error: null,
      mutate: jest.fn(),
      reset: jest.fn(),
      isPending: false,
    } as never;

    const { rerender } = await render(<NoteBody body="text" save={save} />);

    await userEvent.press(screen.getByRole("button", { name: "Edit" }));
    jest.mocked(useIsOnline).mockReturnValue(false);
    await rerender(<NoteBody body="text" save={save} />);

    expect(screen.getByLabelText("Markdown")).toHaveProp("rows", 12);
    expect(screen.getAllByText(/connection/i).length).toBeGreaterThan(0);
  });
});

describe("NotesList", () => {
  it("says so when a section has no notes", async () => {
    await render(<NotesList />);

    expect(screen.getAllByText("Nothing here yet.").length).toBeGreaterThan(0);
  });
});

describe("PartForm", () => {
  it("edits the description", async () => {
    await render(
      <PartForm
        initial={{
          name: "Critic",
          role: "manager",
          wants: "",
          fears: "",
          feltIn: "",
          description: "",
        }}
        disabled={false}
        error={null}
        onSave={jest.fn()}
      />,
    );
    await userEvent.paste(screen.getByLabelText("Description"), "loud");

    expect(screen.getByDisplayValue("loud")).toBeOnTheScreen();
  });
});

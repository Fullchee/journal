import { Stack } from "expo-router";

import { NotesList } from "@/components/notes-list";
import { SidebarButton } from "@/components/sidebar";
import { TwoPane } from "@/components/two-pane";

const ANCHOR = "notes/index";

/** The group keeps journal's URLs (/notes, /library, /health-plan) and the Parts inside one tab. */
export const unstable_settings = { anchor: ANCHOR };

// The part of the stack's navigation used here; RESET accepts routes without a key.
interface StackState {
  index: number;
  routes: { name: string }[];
}

interface NotesNavigation {
  getState: () => StackState;
  reset: (state: StackState) => void;
}

// A link into the running app (the Health plan shortcut, the Storm card) skips the anchor, leaving no Back to Notes.
const keepNotesBelow = ({ navigation }: { navigation: NotesNavigation }) => ({
  focus: () => {
    const state = navigation.getState();

    if (state.routes[0]?.name === ANCHOR) return;
    // The RESET minter adds the anchor's key.
    navigation.reset({
      ...state,
      index: state.index + 1,
      routes: [{ name: ANCHOR }, ...state.routes],
    });
  },
});

export default function NotesLayout() {
  return (
    <TwoPane list={<NotesList />}>
      <Stack screenListeners={keepNotesBelow}>
        <Stack.Screen name="notes/index" options={{ title: "Notes", headerLeft: SidebarButton }} />
        <Stack.Screen name="notes/[type]/[id]" options={{ title: "Note" }} />
        <Stack.Screen name="library/index" options={{ title: "Library" }} />
        <Stack.Screen name="library/[id]" options={{ title: "Habit" }} />
        <Stack.Screen name="health-plan" options={{ title: "Health plan" }} />
        <Stack.Screen name="parts/index" options={{ title: "Parts" }} />
        <Stack.Screen name="parts/[id]" options={{ title: "Part" }} />
        <Stack.Screen name="work" options={{ title: "Work week" }} />
      </Stack>
    </TwoPane>
  );
}

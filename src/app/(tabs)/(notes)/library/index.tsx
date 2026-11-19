import { libraryHabits } from "@/core";
import { Text } from "@/ui";
import { View } from "react-native";

import { NavRow } from "@/components/nav-row";
import { QueryView } from "@/components/note-body";
import { Screen } from "@/components/screen";
import { useHabitLibrary } from "@/lib/data/habits";

export default function LibraryScreen() {
  return (
    <Screen>
      <Text variant="muted">Reference Habits: frameworks and how-tos, by name.</Text>
      <QueryView query={useHabitLibrary()}>
        {({ habits }) => (
          <View>
            {libraryHabits(habits).map(({ id, name }) => (
              <NavRow key={id} href={{ pathname: "/library/[id]", params: { id } }} label={name} />
            ))}
          </View>
        )}
      </QueryView>
    </Screen>
  );
}

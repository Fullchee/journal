import { descriptionBody, libraryHabit } from "@/core";
import { Text } from "@/ui";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { EditButton, NoteMarkdown, QueryView } from "@/components/note-body";
import { Screen } from "@/components/screen";
import { useHabitLibrary } from "@/lib/data/habits";

/** A reference Habit's prose, `## Research` included; the Habit editor on Habits changes it. */
export default function LibraryHabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen>
      <QueryView query={useHabitLibrary()}>
        {({ habits }) => {
          const habit = libraryHabit(habits, id);

          if (!habit) return <Text>Not in the Library.</Text>;

          return (
            <View className="gap-4">
              <Stack.Screen options={{ title: habit.name }} />
              <EditButton
                onPress={() => router.navigate(`/habits?edit=${encodeURIComponent(habit.id)}`)}
              />
              <NoteMarkdown markdown={descriptionBody(habit)} />
            </View>
          );
        }}
      </QueryView>
    </Screen>
  );
}

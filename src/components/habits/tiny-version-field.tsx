import { hasTinyVersion, type Draft } from "@/core";
import { Text } from "@/ui";
import { View } from "react-native";

import { TextField } from "@/components/habits/form-fields";

/** The smallest form of a good recurring Habit; Today offers it on Rain and Storm days. */
export function TinyVersionField({
  draft,
  update,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
}) {
  if (!hasTinyVersion(draft)) return null;

  return (
    <View className="gap-1">
      <TextField
        label="Tiny version"
        maxLength={200}
        placeholder="Put on running shoes"
        value={draft.tinyVersion}
        onChangeText={(tinyVersion) => update({ tinyVersion })}
      />
      <Text variant="muted">Shown on Today after a Rain or Storm Check-in. It counts as Done.</Text>
    </View>
  );
}

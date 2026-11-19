import { Text, cn } from "@/ui";
import { Platform, Pressable, TextInput, View, type TextInputProps } from "react-native";

export interface Choice<T> {
  id: T;
  label: string;
}

interface ChoiceChipsProps<T> {
  label: string;
  options: readonly Choice<T>[];
  isSelected: (id: T) => boolean;
  onPick: (id: T) => void;
}

export function ChoiceChips<T extends string | number>({
  label,
  options,
  isSelected,
  onPick,
}: ChoiceChipsProps<T>) {
  const chips = options.map((option) => {
    const selected = isSelected(option.id);

    return (
      <Pressable
        key={option.id}
        role="button"
        aria-selected={selected}
        className={cn(
          "min-h-12 justify-center rounded-[3px] border px-3.5",
          selected ? "border-primary bg-primary" : "border-input bg-background active:bg-accent",
        )}
        onPress={() => onPick(option.id)}
      >
        <Text className={cn("text-sm", selected && "text-primary-foreground")}>{option.label}</Text>
      </Pressable>
    );
  });

  return (
    <View className="gap-1" role="group" aria-label={label}>
      <Text variant="muted">{label}</Text>
      <View className="flex-row flex-wrap gap-2">{chips}</View>
    </View>
  );
}

export function TextField({
  label,
  className,
  rows,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View className="gap-1">
      <Text variant="muted">{label}</Text>
      <TextInput
        aria-label={label}
        className={cn(
          "min-h-12 rounded-md border border-input bg-background px-3 py-2 font-sans text-base text-foreground",
          className,
        )}
        placeholderTextColorClassName="accent-muted-foreground"
        // A web textarea starts `rows` tall; Android would fix the height to it instead.
        rows={Platform.OS === "web" ? rows : undefined}
        {...props}
      />
    </View>
  );
}

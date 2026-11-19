import { Platform, TextInput } from "react-native";

import { cn } from "@/ui/lib/utils";

/** Free text; dates and times use `DateField` and `TimeField`, which open Android's dialogs. */
function Input({ className, rows, ...props }: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      className={cn(
        "border-input bg-background text-foreground min-h-12 rounded-md border px-3 py-2 font-sans text-base",
        Platform.select({
          web: "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring outline-none focus-visible:ring-2",
        }),
        props.editable === false && "opacity-50",
        className,
      )}
      placeholderTextColorClassName="accent-muted-foreground"
      // A web textarea starts `rows` tall; Android would fix the height to it instead.
      rows={Platform.OS === "web" ? rows : undefined}
      {...props}
    />
  );
}

export { Input };

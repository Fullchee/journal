import * as SwitchPrimitives from "@rn-primitives/switch";
import { Platform, View } from "react-native";

import { Text } from "./text";
import { cn } from "@/ui/lib/utils";

type SwitchProps = React.ComponentProps<typeof SwitchPrimitives.Root> & {
  /** The visible label; the whole row toggles, so the target is far larger than the track. */
  children: React.ReactNode;
};

function Switch({ className, children, ...props }: SwitchProps) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "min-h-12 flex-row items-center gap-3 rounded-[3px]",
        Platform.select({
          web: "focus-visible:ring-ring focus-visible:ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed",
        }),
        props.disabled === true && "opacity-50",
        className,
      )}
      {...props}
    >
      <View
        className={cn(
          "h-6 w-10 shrink-0 flex-row items-center rounded-full border border-transparent px-0.5",
          props.checked ? "bg-primary" : "bg-input dark:bg-input/80",
        )}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            "bg-background size-5 rounded-full transition-transform",
            Platform.select({
              web: "pointer-events-none block ring-0",
            }),
            props.checked
              ? "dark:bg-primary-foreground translate-x-3.5"
              : "dark:bg-foreground translate-x-0",
          )}
        />
      </View>
      <Text className="shrink">{children}</Text>
    </SwitchPrimitives.Root>
  );
}

export { Switch };

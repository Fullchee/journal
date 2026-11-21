import { Slot } from "@rn-primitives/slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Platform, Text as RNText, type Role } from "react-native";

import { cn } from "@/ui/lib/utils";

const textVariants = cva(
  cn(
    "text-foreground font-sans text-base tabular-nums",
    Platform.select({
      web: "select-text",
    }),
  ),
  {
    variants: {
      variant: {
        default: "",
        display: "font-display text-display leading-tight",
        headline: cn(
          "font-caption text-2xl leading-tight",
          Platform.select({ web: "text-balance" }),
        ),
        title: cn("font-caption text-xl leading-tight", Platform.select({ web: "text-balance" })),
        label: "font-label text-label tracking-wide",
        muted: "text-muted-foreground text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps["variant"]>;

// Callers set aria-level: a role's level depends on where it sits, not on its size.
const ROLE: Partial<Record<TextVariant, Role>> = {
  display: "heading",
  headline: "heading",
  title: "heading",
};

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = "default",
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> &
  TextVariantProps & {
    asChild?: boolean;
  }) {
  const textClass = React.use(TextClassContext);
  const Component = asChild ? Slot : RNText;

  return (
    <Component
      className={cn(textVariants({ variant }), textClass, className)}
      role={variant === null ? undefined : ROLE[variant]}
      {...props}
    />
  );
}

export { Text, TextClassContext };

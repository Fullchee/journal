import { cva, type VariantProps } from "class-variance-authority";
import { Platform, Pressable } from "react-native";

import { TextClassContext } from "./text";
import { cn } from "@/ui/lib/utils";

const buttonVariants = cva(
  cn(
    "group min-h-12 shrink-0 flex-row items-center justify-center gap-2 rounded-md shadow-none",
    Platform.select({
      web: "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-all disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    }),
  ),
  {
    variants: {
      variant: {
        default: cn(
          "bg-primary active:bg-primary/90 shadow-sm shadow-black/5",
          Platform.select({ web: "hover:bg-primary/90" }),
        ),
        destructive: cn(
          "bg-destructive active:bg-destructive/90 dark:bg-destructive/60 shadow-sm shadow-black/5",
          Platform.select({
            web: "hover:bg-destructive/90 focus-visible:ring-destructive",
          }),
        ),
        outline: cn(
          "border-input bg-background active:bg-accent dark:bg-input/30 dark:active:bg-input/50 border shadow-sm shadow-black/5",
          Platform.select({
            web: "hover:bg-accent dark:hover:bg-input/50",
          }),
        ),
        secondary: cn(
          "bg-secondary active:bg-secondary/80 shadow-sm shadow-black/5",
          Platform.select({ web: "hover:bg-secondary/80" }),
        ),
        ghost: cn(
          "active:bg-accent dark:active:bg-accent/50",
          Platform.select({ web: "hover:bg-accent dark:hover:bg-accent/50" }),
        ),
        link: "",
      },
      size: {
        default: cn("h-12 px-4 py-2", Platform.select({ web: "has-[>svg]:px-3" })),
        sm: cn("h-12 gap-1.5 px-3", Platform.select({ web: "has-[>svg]:px-2.5" })),
        lg: cn("h-14 px-6", Platform.select({ web: "has-[>svg]:px-4" })),
        icon: "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const buttonTextVariants = cva(
  cn(
    "text-foreground font-label text-[0.95rem] tracking-wide",
    Platform.select({ web: "pointer-events-none transition-colors" }),
  ),
  {
    variants: {
      variant: {
        default: "text-primary-foreground",
        destructive: "text-white",
        outline: cn(
          "group-active:text-accent-foreground",
          Platform.select({ web: "group-hover:text-accent-foreground" }),
        ),
        secondary: "text-secondary-foreground",
        ghost: "group-active:text-accent-foreground",
        link: cn(
          "text-primary group-active:underline",
          Platform.select({ web: "underline-offset-4 hover:underline group-hover:underline" }),
        ),
      },
      size: {
        default: "",
        sm: "",
        lg: "",
        icon: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    // eslint-disable-next-line eslint-react/no-unstable-context-value -- a class string compares by value, so consumers never re-render for it
    <TextClassContext value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(
          props.disabled === true && "opacity-50",
          buttonVariants({ variant, size }),
          className,
        )}
        role="button"
        {...props}
      />
    </TextClassContext>
  );
}

export { Button, buttonTextVariants, buttonVariants };

export type { ButtonProps };

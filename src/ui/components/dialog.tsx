import * as DialogPrimitive from "@rn-primitives/dialog";
import { X } from "lucide-react-native";
import { Platform, Text, View, type GestureResponderEvent, type ViewProps } from "react-native";
import { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";

import { Icon } from "./icon";
import { NativeOnlyAnimatedView } from "./native-only-animated-view";
import { cn } from "@/ui/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  children,
  onPress,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Overlay>, "asChild"> & {
  children?: React.ReactNode;
}) {
  const { onOpenChange } = DialogPrimitive.useRootContext();

  function onOverlayPress(event: GestureResponderEvent) {
    onPress?.(event);

    if (event.target === event.currentTarget && !event.isDefaultPrevented()) {
      onOpenChange(false);
    }
  }

  return (
    <DialogPrimitive.Overlay
      className={cn(
        "absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/50 p-2",
        Platform.select({
          web: "fixed cursor-default [&>*]:cursor-auto",
        }),
        className,
      )}
      {...props}
      onPress={Platform.select({ web: onOverlayPress, native: onPress })}
      asChild={Platform.OS !== "web"}
    >
      <NativeOnlyAnimatedView
        entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
        exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
        as="Pressable"
      >
        <NativeOnlyAnimatedView
          entering={FadeIn.delay(50).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
        >
          <>{children}</>
        </NativeOnlyAnimatedView>
      </NativeOnlyAnimatedView>
    </DialogPrimitive.Overlay>
  );
}

function DialogContent({
  className,
  portalHost,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  portalHost?: string;
}) {
  return (
    <DialogPortal {...(portalHost === undefined ? {} : { hostName: portalHost })}>
      <DialogOverlay>
        <DialogPrimitive.Content
          className={cn(
            "bg-background border-border z-50 mx-auto flex w-full flex-col gap-4 rounded-lg border p-6 shadow-lg shadow-black/5 sm:max-w-lg",
            Platform.select({
              web: "web:max-w-[calc(100%-2rem)]",
            }),
            className,
          )}
          {...props}
        >
          <>{children}</>
          <DialogPrimitive.Close
            className={cn(
              "absolute right-1 top-1 size-12 items-center justify-center rounded opacity-70 active:opacity-100",
              Platform.select({
                web: "ring-offset-background focus-visible:ring-ring transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              }),
            )}
          >
            <Icon
              as={X}
              className="text-accent-foreground size-4 shrink-0 web:pointer-events-none"
            />
            <Text className="sr-only">Close</Text>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ViewProps) {
  return (
    <View className={cn("flex flex-col gap-2 text-center sm:text-left", className)} {...props} />
  );
}

function DialogFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-foreground font-caption text-xl leading-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};

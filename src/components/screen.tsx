import { Text } from "@/ui";
import { BottomTabBarHeightContext } from "expo-router/js-tabs";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { use, type ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { FirstDetailWithoutUp, useIsBesideList } from "@/components/two-pane";

// The page's own 1rem gutter, kept under the last control above the gesture bar.
const GUTTER = 16;

export function Screen({ children }: { children: ReactNode }) {
  // A list or form rendered on its own, as component tests do, has no inset to keep clear of.
  const bottomInset = use(SafeAreaInsetsContext)?.bottom ?? 0;
  // A bottom tab bar already sits over the gesture bar; a stack screen or the wide top bar leaves it to the page.
  const overTabBar = (use(BottomTabBarHeightContext) ?? 0) > 0;
  const headerHeight = use(HeaderHeightContext) ?? 0;

  return (
    // Edge-to-edge Android no longer resizes for the keyboard, so padding keeps the focused field and Save above it.
    // The view measures itself from below the header, so the offset adds the header back.
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      className="bg-background flex-1"
      testID="screen-keyboard-avoider"
    >
      {useIsBesideList() && <FirstDetailWithoutUp />}
      <ScrollView
        testID="screen-scroll"
        className="flex-1"
        contentContainerClassName="w-full max-w-2xl gap-6 self-center p-4"
        contentContainerStyle={{ paddingBottom: GUTTER + (overTabBar ? 0 : bottomInset) }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text aria-level={2} variant="headline">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Fills the detail pane on wide screens until a list item is picked. */
export function EmptyPane({ children }: { children: string }) {
  return (
    <View className="bg-background flex-1 items-center justify-center p-4">
      <Text variant="muted">{children}</Text>
    </View>
  );
}

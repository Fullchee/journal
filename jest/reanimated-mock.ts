// Reanimated 4's bundled mock loads the real entry point, which throws without the Worklets native module.
// Jest maps `react-native-reanimated/mock` here (expo-router/testing-library requires it), covering what @/ui uses.
import { type ComponentType, createElement, useEffect } from "react";
import { ScrollView, Text, View } from "react-native";

interface Animation {
  duration: () => Animation;
  reduceMotion: () => Animation;
}

const animation: Animation = { duration: () => animation, reduceMotion: () => animation };

// Tests type-check against Reanimated's own types; Jest swaps in this module only at run time.
interface AnimatedProps {
  animatedProps?: object;
}

/** Animated props land as plain props, so a test reads their first frame. */
export const createAnimatedComponent = (component: ComponentType<object>) =>
  function AnimatedComponent({ animatedProps, ...props }: AnimatedProps) {
    return createElement(component, { ...props, ...animatedProps });
  };

export { ScrollView, Text, View } from "react-native";

export default { createAnimatedComponent, View, Text, ScrollView };

export const FadeIn = animation;
export const FadeOut = animation;
export const ReduceMotion = { System: "system", Always: "always", Never: "never" };
export const Easing = { out: <T>(easing: T) => easing, cubic: (t: number) => t };

/** Animations jump to their end value; a test reads the first frame, which the effect's assignment doesn't re-render. */
export const useSharedValue = <T>(initial: T) => {
  let value = initial;

  return {
    get: () => value,
    set: (next: T) => {
      value = next;
    },
  };
};

export const useAnimatedProps = <T>(worklet: () => T) => worklet();
export const useAnimatedStyle = <T>(worklet: () => T) => worklet();
export const withTiming = <T>(value: T) => value;
export const withDelay = <T>(_delay: number, delayed: T) => delayed;
export const useReducedMotion = () => false;

/** Reacts after each render, so a test that changes a shared value and re-renders sees the reaction. */
export const useAnimatedReaction = <T>(
  prepare: () => T,
  react: (current: T, previous: T | null) => void,
) => {
  useEffect(() => {
    react(prepare(), null);
  });
};

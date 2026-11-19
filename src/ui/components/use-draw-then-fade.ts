import * as React from "react";
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

interface DrawTiming {
  drawMs: number;
  fadeMs: number;
  /** Reduced motion skips the drawing and the fade, so the finished drawing stays this long instead. */
  holdMs: number;
  /** Called once the drawing has finished and faded; keep it stable, or the drawing restarts. */
  onDone: () => void;
}

/** Drives one engraved drawing: `drawn` runs 0 to 1, then the whole drawing fades and `onDone` fires. */
export function useDrawThenFade({ drawMs, fadeMs, holdMs, onDone }: DrawTiming) {
  const reduced = useReducedMotion();
  const drawn = useSharedValue(reduced ? 1 : 0);
  const opacity = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  React.useEffect(() => {
    if (!reduced) {
      drawn.set(
        withTiming(1, {
          duration: drawMs,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        }),
      );
      opacity.set(
        withDelay(drawMs, withTiming(0, { duration: fadeMs, reduceMotion: ReduceMotion.System })),
      );
    }

    const timer = setTimeout(onDone, reduced ? holdMs : drawMs + fadeMs);

    return () => clearTimeout(timer);
  }, [reduced, drawn, opacity, onDone, drawMs, fadeMs, holdMs]);

  return { drawn, fadeStyle };
}

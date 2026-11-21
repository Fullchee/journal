import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, PanResponder, Pressable, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

// The panel starts this far below its resting place, so it slides in from under the screen's edge.
const SLIDE_FROM = 600;

const SLIDE_MS = 250;

/** A drag down past 80dp, or a flick faster than 0.5dp/ms, closes the sheet; anything less springs back. */
const dismissesSheet = (dy: number, vy: number) => dy > 80 || vy > 0.5;

/**
 * A bottom sheet on phones: it slides up over a scrim, drags down by its handle to close, and keeps its last
 * control above the gesture bar. From 640dp it centres as a dialog. Back and a tap on the scrim close it too.
 */
export function BottomSheet({
  label,
  onClose,
  children,
}: {
  /** What TalkBack names the sheet. */
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const [offset] = useState(() => new Animated.Value(reduceMotion ? 0 : SLIDE_FROM));

  useEffect(() => {
    Animated.timing(offset, {
      toValue: 0,
      duration: SLIDE_MS,
      // Material 3's emphasized decelerate: a sheet enters fast and settles.
      easing: Easing.bezier(0.05, 0.7, 0.1, 1),
      useNativeDriver: true,
    }).start();
  }, [offset]);

  const drag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_event, { dy }) => offset.setValue(Math.max(0, dy)),
        onPanResponderRelease: (_event, { dy, vy }) => {
          if (dismissesSheet(dy, vy)) onClose();
          else Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [offset, onClose],
  );

  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/40 sm:items-center sm:justify-center">
        <Pressable aria-label="Close" onPress={onClose} className="absolute inset-0" />
        {/* Uniwind styles no Animated component on Android, so the classes sit on the View inside. */}
        <Animated.View
          role="dialog"
          aria-label={label}
          // oxlint-disable-next-line shadcn/no-inline-styles -- the sheet slides with an Animated value
          style={{ width: "100%", maxWidth: 448, transform: [{ translateY: offset }] }}
        >
          <View
            testID="sheet-panel"
            className="border-input bg-card rounded-t-lg border pb-safe sm:rounded-lg"
          >
            <View
              testID="sheet-handle"
              aria-hidden
              className="items-center pt-3 pb-1 sm:hidden"
              {...drag.panHandlers}
            >
              <View className="bg-input h-1 w-8 rounded-full" />
            </View>
            <View className="gap-3 p-4 pt-2 sm:pt-4">{children}</View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

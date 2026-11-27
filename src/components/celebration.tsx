import { pickCelebration, type Celebration, type CelebrationKind } from "@/core";
// One sample of "tonal-on" from github.com/joshwcomeau/button-sounds (MIT).
import completionSound from "@/assets/sounds/completion.mp3";
import { CelebrationDrawing } from "@/ui";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { NotificationFeedbackType, notificationAsync } from "expo-haptics";
import { useIsFocused } from "expo-router";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform, View } from "react-native";

interface CelebrateRequest {
  kind: CelebrationKind;
  /** The spot to play on, such as a Habit's id; without one it plays over the screen. */
  target?: string;
}

interface Playing {
  id: number;
  /** The spot playing it; undefined plays it over the screen. */
  target: string | undefined;
  celebration: Celebration;
}

interface CelebrationState {
  celebrate: (request: CelebrateRequest) => void;
  /** Ends whatever is playing at once, as Undo does. */
  stop: () => void;
  playing: Playing | null;
  /** Mounts a spot; the returned function unmounts it. */
  addSpot: (target: string, holdsBig: boolean) => () => void;
}

const CelebrationContext = createContext<CelebrationState | null>(null);

function useCelebrationState() {
  const state = use(CelebrationContext);

  if (state === null) throw new Error("A celebration needs a CelebrationProvider above it.");

  return state;
}

/** `celebrate({ kind })` plays the mini tick or, at random, a big drawing; a milestone always plays the big one. */
export function useCelebrate() {
  const { celebrate, stop } = useCelebrationState();

  return { celebrate, stop };
}

/** Holds the one celebration playing, and draws it over the screen when no mounted spot takes it. */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState<Playing | null>(null);
  const spotsRef = useRef(new Map<string, boolean>());
  const playedRef = useRef(0);
  const sound = useAudioPlayer(completionSound);

  // Sound effects mix with other audio by default; on Android a silent or vibrate ringer mutes it.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: false });
  }, []);

  const celebrate = useCallback(
    ({ kind, target }: CelebrateRequest) => {
      const celebration = pickCelebration(kind);
      const big = celebration.size === "big";
      const spot = target === undefined ? undefined : spotsRef.current.get(target);
      const onSpot = spot === true || (spot === false && !big);

      if (big && Platform.OS === "android")
        void notificationAsync(NotificationFeedbackType.Success);

      void sound.seekTo(0);
      sound.play();

      playedRef.current += 1;
      setPlaying({ id: playedRef.current, target: onSpot ? target : undefined, celebration });
    },
    [sound],
  );

  const stop = useCallback(() => setPlaying(null), []);

  const addSpot = useCallback((target: string, holdsBig: boolean) => {
    spotsRef.current.set(target, holdsBig);

    return () => {
      spotsRef.current.delete(target);
    };
  }, []);

  const state = useMemo(
    () => ({ celebrate, stop, playing, addSpot }),
    [celebrate, stop, playing, addSpot],
  );

  return (
    <CelebrationContext value={state}>
      {children}
      {playing?.target === undefined && <Overlay testID="celebration overlay" />}
    </CelebrationContext>
  );
}

// Never blocks a tap: the next action stays reachable while it plays (PRODUCT.md, Usable in Storm).
function Overlay({ testID }: { testID: string }) {
  const { playing, stop } = useCelebrationState();

  if (playing === null) return null;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center"
    >
      <CelebrationDrawing key={playing.id} celebration={playing.celebration} onDone={stop} />
    </View>
  );
}

/**
 * Plays a celebration aimed at `target` over its children. `holdsBig` when the big drawings fit there too.
 * Only while its screen is focused: a tab left mounted underneath would play it out of sight.
 */
export function CelebrationSpot({
  target,
  holdsBig = false,
  children,
}: {
  target: string;
  holdsBig?: boolean;
  children: ReactNode;
}) {
  const { playing, addSpot } = useCelebrationState();
  const focused = useIsFocused();

  useEffect(
    () => (focused ? addSpot(target, holdsBig) : undefined),
    [addSpot, target, holdsBig, focused],
  );

  return (
    <View>
      {children}
      {playing?.target === target && <Overlay testID={`celebration on ${target}`} />}
    </View>
  );
}

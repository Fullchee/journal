import Animated from "react-native-reanimated";
import Svg from "react-native-svg";

import { DrawnLine } from "./drawn-line";
import { useDrawThenFade } from "./use-draw-then-fade";

const TICK = "M4 13L9 18L20 6";

// Both strokes of the tick.
const LENGTH = 24;

const TIMING = { drawMs: 300, fadeMs: 250, holdMs: 600 };

interface TickProps {
  /** Called once the tick has drawn and faded; keep it stable, or the tick restarts. */
  onDone: () => void;
}

// The mini celebration: an engraved tick draws itself in leaf green in about 300 ms, then fades.
function Tick({ onDone }: TickProps) {
  const { drawn, fadeStyle } = useDrawThenFade({ ...TIMING, onDone });

  return (
    <Animated.View style={fadeStyle} testID="tick" aria-hidden>
      <Svg viewBox="0 0 24 24" width={28} height={28} fill="none">
        <DrawnLine testID="tick line" d={TICK} length={LENGTH} drawn={drawn} strokeWidth={1.6} />
      </Svg>
    </Animated.View>
  );
}

export { Tick };

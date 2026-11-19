import Animated from "react-native-reanimated";
import Svg from "react-native-svg";

import { DrawnLine } from "./drawn-line";
import { useDrawThenFade } from "./use-draw-then-fade";

// One engraved line: the stem rises, then loops out into a left leaf and a right leaf.
const SPROUT =
  "M24 60C24 48 25 38 24 26C18 27 9 23 7 13C16 12 23 18 24 26C26 17 32 10 42 9C41 19 33 26 24 26";

// Measured from the curves above.
const LENGTH = 136;

const TIMING = { drawMs: 1000, fadeMs: 400, holdMs: 1200 };

interface SproutProps {
  /** Called once the sprout has finished and faded, so the caller can remove it; keep it stable, or the sprout restarts. */
  onDone: () => void;
}

// A big celebration: a sprout draws itself in leaf green, then fades.
function Sprout({ onDone }: SproutProps) {
  const { drawn, fadeStyle } = useDrawThenFade({ ...TIMING, onDone });

  return (
    <Animated.View style={fadeStyle} testID="sprout" aria-hidden>
      <Svg viewBox="0 0 48 64" width={96} height={128} fill="none">
        <DrawnLine
          testID="sprout line"
          d={SPROUT}
          length={LENGTH}
          drawn={drawn}
          strokeWidth={1.4}
        />
      </Svg>
    </Animated.View>
  );
}

export { Sprout };

export type { SproutProps };

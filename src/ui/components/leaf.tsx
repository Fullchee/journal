import Animated, { useAnimatedStyle } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { DrawnLine } from "./drawn-line";
import { useDrawThenFade } from "./use-draw-then-fade";

// An engraved leaf: the outline, then a few veins off the midrib.
const BLADE =
  "M24 56C11 46 9 25 24 7C39 25 37 46 24 56Z M24 42L16 34 M24 42L32 34 M24 30L18 24 M24 30L30 24";

// The midrib from the stalk to the tip draws as the leaf opens.
const MIDRIB = "M24 62L24 11";

const MIDRIB_LENGTH = 51;

// Folded shut, the leaf leans this far and sits this much smaller.
const FOLDED_DEGREES = -40;

const FOLDED_SCALE = 0.6;

const TIMING = { drawMs: 700, fadeMs: 400, holdMs: 1200 };

interface LeafProps {
  /** Called once the leaf has opened and faded, so the caller can remove it; keep it stable, or the leaf restarts. */
  onDone: () => void;
}

// A big celebration: one leaf unfolds from its stalk in leaf green, then fades.
function Leaf({ onDone }: LeafProps) {
  const { drawn, fadeStyle } = useDrawThenFade({ ...TIMING, onDone });
  const [leaf] = useCSSVariable(["--color-primary"]);

  const unfold = useAnimatedStyle(() => {
    const open = drawn.get();

    return {
      transform: [
        { rotate: `${FOLDED_DEGREES * (1 - open)}deg` },
        { scale: FOLDED_SCALE + (1 - FOLDED_SCALE) * open },
      ],
    };
  });

  return (
    <Animated.View style={fadeStyle} testID="leaf" aria-hidden>
      {/* oxlint-disable-next-line shadcn/no-inline-styles -- the blade unfolds from its base */}
      <Animated.View testID="leaf blade" style={[{ transformOrigin: "bottom" }, unfold]}>
        <Svg viewBox="0 0 48 64" width={96} height={128} fill="none">
          <Path
            d={BLADE}
            stroke={String(leaf)}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <DrawnLine
            testID="leaf midrib"
            d={MIDRIB}
            length={MIDRIB_LENGTH}
            drawn={drawn}
            strokeWidth={1.4}
          />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

export { Leaf };

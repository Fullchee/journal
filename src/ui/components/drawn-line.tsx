import Animated, { useAnimatedProps, type SharedValue } from "react-native-reanimated";
import { Path } from "react-native-svg";
import { useCSSVariable } from "uniwind";

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface DrawnLineProps {
  testID: string;
  d: string;
  /** The path's length, rounded up so the drawn line never shows a gap. */
  length: number;
  /** 0 hides the line, 1 shows all of it. */
  drawn: SharedValue<number>;
  strokeWidth: number;
}

/** One engraved stroke in leaf green that draws itself as `drawn` runs from 0 to 1. */
export function DrawnLine({ testID, d, length, drawn, strokeWidth }: DrawnLineProps) {
  // react-native-svg needs a real colour string, not `var(...)`, so the token is read in JS.
  const [leaf] = useCSSVariable(["--color-primary"]);
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.get()) }));

  return (
    <AnimatedPath
      testID={testID}
      d={d}
      stroke={String(leaf)}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={length}
      animatedProps={lineProps}
    />
  );
}

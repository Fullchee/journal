import { useWindowDimensions } from "react-native";

/** Variant D: from 768px the tabs move to a top bar and list screens show their detail beside them. */
const WIDE_MIN_WIDTH = 768;

export const useIsWide = () => useWindowDimensions().width >= WIDE_MIN_WIDTH;

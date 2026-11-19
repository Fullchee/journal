import type { screen } from "@testing-library/react-native";

type HostElement = ReturnType<typeof screen.getByRole>;

/** The nearest host ScrollView holding `element`; FlatList renders one too. */
export function scrollableAround(element: HostElement): HostElement {
  let node = element.parent;

  while (node && node.type !== "RCTScrollView") node = node.parent;

  if (!node) throw new Error("No ScrollView holds this element");

  return node;
}

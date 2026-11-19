import { useFocusEffect, useNavigation, usePathname, useRoute, type Href } from "expo-router";
import { useNavigationState } from "expo-router/react-navigation";
import { createContext, use, useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import { View } from "react-native";

import { useIsWide } from "@/hooks/use-is-wide";

type ShowDefault = (path: string | null) => void;

// Only the detail pane beside a list gets one, so phones and screens outside a TwoPane keep their Up arrow.
const DetailPaneContext = createContext<ShowDefault | null>(null);

// The path whose row the list marks as open; null outside a list pane.
const ListPaneContext = createContext<string | null>(null);

/** The detail stack keeps its place in the tree, so resizing across the breakpoint keeps its history. */
export function TwoPane({ list, children }: { list: ReactNode; children: ReactNode }) {
  const isWide = useIsWide();
  const pathname = usePathname();
  const [defaultPath, setDefaultPath] = useState<string | null>(null);

  return (
    <View className="bg-background flex-1 flex-row">
      {isWide && (
        <View testID="list-pane" className="border-border w-80 border-r">
          <ListPaneContext value={defaultPath ?? pathname}>{list}</ListPaneContext>
        </View>
      )}
      <View className="flex-1">
        <DetailPaneContext value={isWide ? setDefaultPath : null}>{children}</DetailPaneContext>
      </View>
    </View>
  );
}

/** The open row's path, or null when this row isn't in a list pane beside its detail. */
export const useListSelection = () => use(ListPaneContext);

/** Shows `children`, the screen at `href`, in the detail pane until a row is picked; the list marks that row open. */
export function DefaultDetail({ href, children }: { href: string; children: ReactNode }) {
  const showDefault = use(DetailPaneContext);

  useFocusEffect(
    useCallback(() => {
      showDefault?.(href);

      return () => showDefault?.(null);
    }, [showDefault, href]),
  );

  return children;
}

/** Beside the list, the first detail has nothing to go Up to: the list already shows where the owner came from. */
export const useIsBesideList = () => use(DetailPaneContext) !== null;

export function FirstDetailWithoutUp() {
  const navigation = useNavigation();
  const { key } = useRoute();
  const depth = useNavigationState((state) => state.routes.findIndex((route) => route.key === key));
  const showsUp = depth > 1;

  useLayoutEffect(() => {
    // Android's native header reads headerBackVisible; the web header draws headerLeft.
    navigation.setOptions(
      showsUp
        ? { headerBackVisible: true, headerLeft: undefined }
        : { headerBackVisible: false, headerLeft: () => null },
    );
  }, [navigation, showsUp]);

  return null;
}

/** Resolves a typed href to the path the router reports, so a row can tell whether it is the open one. */
export function hrefPath(href: Href): string {
  // eslint-disable-next-line anti-slop/no-runtime-typeof -- expo-router's Href is a path or a route object, and typeof is its only discriminant
  if (typeof href === "string") return href;

  const pathname: string = href.pathname;

  return Object.entries(href.params ?? {}).reduce(
    (path, [name, value]) => path.split(`[${name}]`).join(String(value)),
    pathname,
  );
}

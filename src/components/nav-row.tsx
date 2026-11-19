import { cn, Icon, Text } from "@/ui";
import { Link, type Href } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Platform, Pressable, View } from "react-native";

import { hrefPath, useListSelection } from "@/components/two-pane";

interface NavRowProps {
  href: Href;
  label: string;
  detail?: string | undefined;
  className?: string | undefined;
}

// A Part's page keeps the Parts row open, so the owner still sees where they are in the list.
const isOpen = (path: string, openPath: string) =>
  openPath === path || openPath.startsWith(`${path}/`);

export function NavRow({ href, label, detail = "", className }: NavRowProps) {
  const openPath = useListSelection();
  // In a list pane, picking a row swaps the detail beside it instead of stacking up an Up trail.
  const inList = openPath !== null;
  const selected = inList && isOpen(hrefPath(href), openPath);

  return (
    <Link href={href} replace={inList} asChild>
      <Pressable
        role="link"
        aria-selected={selected}
        className={cn(
          "min-h-12 flex-row items-center gap-3 border-b border-border py-3 active:bg-accent",
          Platform.select({ web: "hover:bg-accent" }),
          selected && "bg-accent",
          className,
        )}
      >
        <View className="flex-1 gap-1">
          <Text className={cn(selected && "text-primary")}>{label}</Text>
          {detail === "" ? null : <Text variant="muted">{detail}</Text>}
        </View>
        <Icon as={ChevronRight} className={selected ? "text-primary" : "text-muted-foreground"} />
      </Pressable>
    </Link>
  );
}

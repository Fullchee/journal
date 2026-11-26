import { cn, Icon, Text } from "@/ui";
import { usePathname, useRouter, type Href } from "expo-router";
import {
  BookOpen,
  CalendarCheck,
  CalendarRange,
  CloudSun,
  History,
  ListTodo,
  Menu,
  Moon,
  Sprout,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { createContext, use, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

import { useIsWide } from "@/hooks/use-is-wide";

interface Page {
  href: Href & string;
  label: string;
  icon: LucideIcon;
}

// The tab bar holds the first two; every page is here, so the sidebar alone reaches all of them.
const PAGES: Page[] = [
  { href: "/", label: "Check-in", icon: CloudSun },
  { href: "/today", label: "Today", icon: CalendarCheck },
  { href: "/habits", label: "Habits", icon: Sprout },
  { href: "/check-ins", label: "Check-ins", icon: History },
  { href: "/connections", label: "Connections", icon: Users },
  { href: "/notes", label: "Notes", icon: BookOpen },
  { href: "/plan", label: "Plan the day", icon: ListTodo },
  { href: "/evening-review", label: "Evening review", icon: Moon },
  { href: "/weekly-review", label: "Weekly retro", icon: CalendarRange },
];

const isOpen = (href: string, path: string) =>
  path === href || (href !== "/" && path.startsWith(`${href}/`));

function PageLinks({ onNavigate }: { onNavigate: () => void }) {
  const path = usePathname();
  const router = useRouter();

  return (
    <ScrollView
      testID="sidebar"
      className="bg-background flex-1"
      contentContainerClassName="pt-safe pb-safe gap-1 p-2"
    >
      {PAGES.map(({ href, label, icon }) => {
        const selected = isOpen(href, path);

        return (
          <Pressable
            key={href}
            role="link"
            aria-selected={selected}
            onPress={() => {
              onNavigate();
              router.navigate(href);
            }}
            className={cn(
              "min-h-12 flex-row items-center gap-3 rounded-md px-3 active:bg-accent web:hover:bg-accent",
              selected && "bg-accent",
            )}
          >
            <Icon as={icon} className={selected ? "text-primary" : "text-muted-foreground"} />
            <Text className={cn(selected && "text-primary")}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Opens the phone's sidebar; null from 768px, where the sidebar stays beside the page.
const SetSidebarOpenContext = createContext<((open: boolean) => void) | null>(null);

/** The header's menu button; it shows only where the sidebar hides. */
export function SidebarButton() {
  const setOpen = use(SetSidebarOpenContext);

  if (setOpen === null) return null;

  return (
    <Pressable
      role="button"
      aria-label="Open sidebar"
      onPress={() => setOpen(true)}
      className="active:bg-accent web:hover:bg-accent size-12 items-center justify-center rounded-md"
    >
      <Icon as={Menu} />
    </Pressable>
  );
}

const noop = () => {
  // The fixed sidebar has nothing to close.
};

/** Every page, listed beside the page from 768px and behind the header's menu button on phones. */
export function SidebarLayout({ children }: { children: ReactNode }) {
  const isWide = useIsWide();
  const [open, setOpen] = useState(false);

  if (isWide)
    return (
      <View className="flex-1 flex-row">
        <View className="border-border w-56 border-r">
          <PageLinks onNavigate={noop} />
        </View>
        <View className="flex-1">{children}</View>
      </View>
    );

  const close = () => setOpen(false);

  return (
    <SetSidebarOpenContext value={setOpen}>
      {children}
      <Modal
        transparent
        visible={open}
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={close}
      >
        <View className="flex-1 flex-row bg-black/40">
          <View role="navigation" aria-label="Sidebar" className="w-72">
            <PageLinks onNavigate={close} />
          </View>
          <Pressable role="button" aria-label="Close sidebar" onPress={close} className="flex-1" />
        </View>
      </Modal>
    </SetSidebarOpenContext>
  );
}

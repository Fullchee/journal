import { Stack } from "expo-router";

import { ConnectionList } from "@/components/connection-list";
import { SidebarButton } from "@/components/sidebar";
import { TwoPane } from "@/components/two-pane";

export default function ConnectionsLayout() {
  return (
    <TwoPane list={<ConnectionList />}>
      <Stack>
        <Stack.Screen name="index" options={{ title: "Connections", headerLeft: SidebarButton }} />
        <Stack.Screen name="[id]" options={{ title: "Connection" }} />
      </Stack>
    </TwoPane>
  );
}

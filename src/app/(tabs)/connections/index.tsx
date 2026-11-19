import { ConnectionList } from "@/components/connection-list";
import { EmptyPane } from "@/components/screen";
import { useIsWide } from "@/hooks/use-is-wide";

export default function ConnectionsScreen() {
  return useIsWide() ? <EmptyPane>Pick a Connection.</EmptyPane> : <ConnectionList />;
}

import { ConnectionsToday } from "@/ui";
import { router } from "expo-router";
import { useState } from "react";

import { useIsOnline } from "@/lib/data/data-provider";
import { useConnections, useLogInteraction, useUpdateConnection } from "@/lib/data/connections";

/** `ConnectionsToday` wired to the cached list; Today (#31) places it. */
export function ConnectionsTodaySection() {
  const { data } = useConnections();
  const isOnline = useIsOnline();
  const logInteraction = useLogInteraction();
  const update = useUpdateConnection();
  // Read once per mount: a render must not read the clock.
  const [now] = useState(() => new Date());

  if (!data) return null;

  return (
    <ConnectionsToday
      connections={data.connections}
      now={now}
      isOnline={isOnline}
      onOpen={(id) => router.push(`/connections/${id}`)}
      onReachedOut={(id, interaction) => logInteraction([id], interaction)}
      onPlanAnswered={(id) => update.mutate({ id, patch: { planChecked: true } })}
    />
  );
}

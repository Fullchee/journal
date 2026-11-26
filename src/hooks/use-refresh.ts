import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/** Pull to refresh: refetches the active queries, which are the open screen's plus any tab already opened. */
export function useRefresh() {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await client.refetchQueries({ type: "active" });
    setRefreshing(false);
  };

  return { refreshing, refresh };
}

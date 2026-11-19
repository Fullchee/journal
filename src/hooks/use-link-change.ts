import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Runs a Health Connect link change, reports it in one line under its button, then reloads the links.
 * `failure` is the line shown when Health Connect can't be read.
 */
export function useLinkChange(queryKey: QueryKey, failure: string) {
  type LinkChange =
    | { status: "idle" }
    | { status: "changing" }
    | { status: "done"; message: string };

  const client = useQueryClient();
  const [state, setState] = useState<LinkChange>({ status: "idle" });
  const reload = () => client.invalidateQueries({ queryKey });

  async function change(action: () => Promise<string>) {
    setState({ status: "changing" });

    try {
      setState({ status: "done", message: await action() });
    } catch {
      setState({ status: "done", message: failure });
    } finally {
      await reload();
    }
  }

  return {
    message: state.status === "done" ? state.message : "",
    busy: state.status === "changing",
    change,
    reload,
  };
}

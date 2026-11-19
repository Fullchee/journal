import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { useLinkChange } from "@/hooks/use-link-change";

const KEY = ["link"] as const;

async function renderLinkChange() {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, "invalidateQueries");

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const { result } = await renderHook(() => useLinkChange(KEY, "Couldn't read."), { wrapper });

  return { result, invalidate };
}

it("is busy with no message while a change runs, then shows its line and reloads", async () => {
  const { result, invalidate } = await renderLinkChange();
  const action = Promise.withResolvers<string>();
  let done: Promise<void> | undefined;

  await act(() => {
    done = result.current.change(() => action.promise);
  });

  expect(result.current).toMatchObject({ busy: true, message: "" });

  await act(async () => {
    action.resolve("Linked.");
    await done;
  });

  expect(result.current).toMatchObject({ busy: false, message: "Linked." });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
});

it("shows the failure line when the change throws", async () => {
  const { result } = await renderLinkChange();

  await act(() => result.current.change(() => Promise.reject(new Error("no"))));

  expect(result.current).toMatchObject({ busy: false, message: "Couldn't read." });
});

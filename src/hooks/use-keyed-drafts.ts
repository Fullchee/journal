import { useState } from "react";

function without<T>(drafts: ReadonlyMap<string, T>, key: string) {
  const next = new Map(drafts);

  next.delete(key);

  return next;
}

/**
 * Unsaved drafts by key (a period, a week), held above the form so a remount on Prev, Next or a rung change restores
 * them. A draft back at its starting text is dropped, so `dirty` means something typed would be lost.
 */
export function useKeyedDrafts<T>() {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, T>>(() => new Map());

  return {
    get: (key: string) => drafts.get(key),
    /** `change` gets the latest draft, so an AI fill that lands mid-typing keeps what was typed meanwhile. */
    update: (key: string, change: (draft: T | undefined) => T, unchanged: (draft: T) => boolean) =>
      setDrafts((current) => {
        const draft = change(current.get(key));

        return unchanged(draft) ? without(current, key) : new Map(current).set(key, draft);
      }),
    drop: (key: string) => setDrafts((current) => without(current, key)),
    dirty: drafts.size > 0,
  };
}

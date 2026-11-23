import {
  loggableHabits,
  logForm,
  openEntries,
  withEntry,
  type LogDraft,
  type LogEntry,
  type LogItem,
} from "@/core";
import { useRouter } from "expo-router";
import { useState } from "react";

import { useHabitTracker, type HabitsBody } from "@/lib/data/habits";
import { draftLog, useLogReceipt, useSaveEntries } from "@/lib/data/log";

// A sentence that also said what was done ("ran 20 min") logs it once the Habit exists; `text` also feeds the details call.
function newHabitRoute({ habit, entry }: Extract<LogDraft, { type: "create" }>, text: string) {
  const logAfter = Object.keys(entry).length > 0 ? { entry: JSON.stringify(entry) } : {};

  return {
    pathname: "/habit/[id]",
    params: { id: "new", draft: JSON.stringify(habit), text, ...logAfter },
  } as const;
}

type FormDraft = Exclude<LogDraft, { type: "unclear" }>;

// Each draft opens the form that edits it.
function formRoute(draft: FormDraft, text: string) {
  switch (draft.type) {
    case "create": {
      return newHabitRoute(draft, text);
    }

    case "entries": {
      return {
        pathname: "/log-entry",
        params: { text, draft: JSON.stringify(draft.entries) },
      } as const;
    }

    case "one-off": {
      return {
        pathname: "/one-off",
        params: { text, draft: JSON.stringify(draft.one_off) },
      } as const;
    }
  }
}

/**
 * What the log form would save for these entries, or null when the owner should see the form first: a row has a
 * problem or overlaps a logged entry, or the Habits haven't loaded.
 */
function cleanItems(draft: FormDraft, data: HabitsBody | undefined): LogItem[] | null {
  if (!data || draft.type !== "entries") return null;
  const now = new Date();

  const { rows, items } = logForm(openEntries(JSON.stringify(draft.entries), now), {
    habits: loggableHabits(data.habits),
    durations: data.durations ?? {},
    now,
  });

  return rows.some(({ overlap }) => overlap !== null) ? null : items;
}

/**
 * Turns a sentence into a log: entries for existing Habits that pass the form's checks save at once and leave a
 * Receipt; anything else opens its prefilled form (the Habit editor, the log form or the One-off form).
 * `replace` swaps the current modal for the form, so closing it goes back to where the owner started.
 */
export function useLogDraft({ replace = false } = {}) {
  type DraftState =
    | { status: "idle" }
    | { status: "drafting" }
    | { status: "unclear"; text: string };

  const router = useRouter();
  const [state, setState] = useState<DraftState>({ status: "idle" });
  const { data } = useHabitTracker();
  const save = useSaveEntries();
  const { receipt, showReceipt } = useLogReceipt();

  const saveAtOnce = async (text: string, log: LogItem[]) => {
    try {
      showReceipt(await save.mutateAsync({ text, log }));

      return true;
    } catch {
      return false;
    }
  };

  // `entry` holds times the owner picked, such as a Check-in's start and end for what they were doing.
  const open = async (text: string, entry: LogEntry = {}) => {
    setState({ status: "drafting" });
    showReceipt(null);
    const draft = withEntry(await draftLog(text), entry);

    if (draft.type === "unclear") {
      setState({ status: "unclear", text: draft.text });

      return false;
    }

    const items = cleanItems(draft, data);
    // A failed save opens the form, which keeps the entries and says why Save is off or failed.
    const saved = items !== null && (await saveAtOnce(text, items));

    setState({ status: "idle" });

    if (!saved) {
      const go = replace ? router.replace : router.push;

      go(formRoute(draft, text));
    }

    return true;
  };

  return {
    open,
    busy: state.status === "drafting",
    unclear: state.status === "unclear" ? state.text : "",
    receipt,
    dismissReceipt: () => showReceipt(null),
  };
}

import type { Habit, TreeAnswer } from "@/core";
import { showUndoToast } from "@/ui";

import { useAnswerTree, useSaveHabit } from "@/lib/data/habits";

const MANAGE_TOAST = "habit-manage";

/**
 * One-tap changes from the Habit card: Backlog, and the tree answers. A Backlog save toasts with an Undo that saves
 * the Habit as it was; a Habit is a full Draft, so its other fields and Circle link stay as they are. A failed save
 * shows through `isError`.
 */
export function useQuickManage() {
  const { mutateAsync, isPending, isError } = useSaveHabit();
  const tree = useAnswerTree();

  // The card that saved may be gone by now, so a failed Undo reports in a toast that offers it again.
  function undo(before: Habit) {
    mutateAsync(before).catch(() =>
      showUndoToast({
        id: MANAGE_TOAST,
        message: `Couldn't undo · ${before.name}`,
        onUndo: () => undo(before),
      }),
    );
  }

  // A Backlog move unmounts the card before the save settles, so the toast follows the save's promise rather than
  // the mounted card's callbacks.
  async function save(before: Habit, after: Habit, message: string) {
    const saved = await mutateAsync(after)
      .then(() => true)
      .catch(() => false);

    if (saved)
      showUndoToast({
        id: MANAGE_TOAST,
        message: `${message} · ${before.name}`,
        onUndo: () => undo(before),
      });
  }

  return {
    answerTree: (habit: Habit, answer: TreeAnswer) => {
      tree.mutate({ habit: habit.id, answer });
    },
    toggleBacklog: (habit: Habit) => {
      void save(
        habit,
        { ...habit, active: !habit.active },
        habit.active ? "Moved to Backlog" : "Made active",
      );
    },
    isPending: isPending || tree.isPending,
    isError: isError || tree.isError,
  };
}

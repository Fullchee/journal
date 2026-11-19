import { torontoDay } from "@/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useEffectEvent } from "react";

import { useCheckHabit } from "@/lib/data/habits";
import { claimTick } from "@/lib/widgets/widget-ticks";

/**
 * `/habit/<id>/done?at=<ms>`: the Android Habits widget's tick, stamped with when the widget drew it. Marks the
 * Habit done today, then lands on Today; a replayed link lands on Today without checking.
 */
export default function HabitDoneLink() {
  const { id, at } = useLocalSearchParams<{ id: string; at: string }>();
  const router = useRouter();
  const check = useCheckHabit();

  const markDone = useEffectEvent(async () => {
    if (await claimTick(id, Number(at)))
      check({ date: torontoDay(new Date()), habit: id, count: 1 });

    router.replace("/");
  });

  useEffect(() => void markDone(), [id, at]);

  return null;
}

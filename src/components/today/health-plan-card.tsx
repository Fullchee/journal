import { isInStorm, nextAction } from "@/core";
import { Text } from "@/ui";
import { View } from "react-native";

import { NavRow } from "@/components/nav-row";
import { NoteMarkdown } from "@/components/note-body";
import { useCheckIns } from "@/lib/data/check-ins";
import { useHealthPlan } from "@/lib/data/notes";

/** In Storm, one action at a time: the plan's next action, then the way to the whole plan. */
export function HealthPlanCard() {
  const checkIns = useCheckIns().data?.checkIns ?? [];
  // Read on every visit, so the plan is cached before a Storm Check-in made offline.
  // oxlint-disable-next-line unicorn-js/no-declarations-before-early-exit -- a hook call, so it runs before the early exit on every render
  const plan = useHealthPlan().data;

  if (!isInStorm(checkIns)) return null;
  const action = plan === undefined ? null : nextAction(plan.item.body);

  return (
    <View
      role="region"
      aria-label="Health plan"
      className="border-primary bg-card gap-2 rounded-md border-2 p-4"
    >
      <Text aria-level={2} variant="headline">
        Next action
      </Text>
      {action === null ? null : <NoteMarkdown markdown={action} size="large" />}
      <NavRow href="/health-plan" label="Open the Health plan" />
    </View>
  );
}

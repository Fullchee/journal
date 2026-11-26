import type { AlarmTrigger } from "@/core";
import {
  AlarmType,
  RepeatFrequency,
  TriggerType,
  type Trigger,
  type TimestampTrigger,
} from "react-native-notify-kit";

const REPEAT = { day: RepeatFrequency.DAILY, week: RepeatFrequency.WEEKLY } as const;

const REPEAT_OF = new Map<RepeatFrequency | undefined, AlarmTrigger["repeat"]>([
  [RepeatFrequency.DAILY, "day"],
  [RepeatFrequency.WEEKLY, "week"],
]);

/** A notify-kit trigger for `trigger`; the alarm-clock type wakes a sleeping phone, and a repeat re-arms with the same type. */
export const ringTrigger = (
  { timestamp, repeat }: AlarmTrigger,
  type = AlarmType.SET_ALARM_CLOCK,
): TimestampTrigger => ({
  type: TriggerType.TIMESTAMP,
  timestamp,
  ...(repeat !== null && { repeatFrequency: REPEAT[repeat] }),
  alarmManager: { type },
});

/** Reads back a trigger `ringTrigger` made; every ring the app schedules is a timestamp trigger. */
export function alarmTrigger(trigger: Trigger): AlarmTrigger | null {
  if (trigger.type !== TriggerType.TIMESTAMP) return null;
  const { timestamp, repeatFrequency } = trigger;

  return { timestamp, repeat: REPEAT_OF.get(repeatFrequency) ?? null };
}

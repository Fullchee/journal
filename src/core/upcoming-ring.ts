import type { AlarmTrigger, PlannedNotification } from "./alarm-schedule";
import { CHANNEL, type AlarmAction } from "./alarms";
import { clockLabel } from "./calendar";

/** AOSP Clock shows its upcoming-alarm notification two hours ahead (`AlarmInstance.LOW_NOTIFICATION_HOUR_OFFSET`). */
export const UPCOMING_LEAD_MS = 2 * 60 * 60_000;

/** A quiet notice before an `alarm` kind ring, so the owner can dismiss it or log the Day before it blares. */
export interface UpcomingRing {
  /** The id of the ring it comes before. */
  ringId: number;
  habitId: string;
  title: string;
  body: string;
  /** The ring's Done and Skip. */
  actions: AlarmAction[];
  /** When the notice next shows on its own; null when the ring never repeats and its notice is already due. */
  trigger: AlarmTrigger | null;
  /** Set when the ring is inside the lead already: the notice shows now, for this long. */
  showNowForMs: number | null;
}

// setDate keeps the wall-clock time across a daylight saving change, unlike adding milliseconds.
function step(timestamp: number, repeat: "day" | "week") {
  const at = new Date(timestamp);

  at.setDate(at.getDate() + (repeat === "day" ? 1 : 7));

  return at.getTime();
}

const hhmm = (at: Date) =>
  `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

function noticeTrigger({ timestamp, repeat }: AlarmTrigger, inLead: boolean): AlarmTrigger | null {
  const noticeAt = timestamp - UPCOMING_LEAD_MS;

  if (!inLead) return { timestamp: noticeAt, repeat };

  return repeat === null ? null : { timestamp: step(noticeAt, repeat), repeat };
}

/** One notice per `alarm` kind Habit ring; a persistent reminder is quiet already. */
export const upcomingRings = (planned: PlannedNotification[], now: Date): UpcomingRing[] =>
  planned.flatMap(({ notification, trigger }) => {
    const { id, habitId, title, actions = [], channelId } = notification;

    if (habitId === undefined || channelId !== CHANNEL.alarm) return [];
    const untilRing = trigger.timestamp - now.getTime();
    const inLead = untilRing <= UPCOMING_LEAD_MS;

    return {
      ringId: id,
      habitId,
      title,
      body: `Rings at ${clockLabel(hhmm(new Date(trigger.timestamp)))}`,
      actions,
      trigger: noticeTrigger(trigger, inLead),
      showNowForMs: inLead ? untilRing : null,
    };
  });

/** The ring's trigger with its next ring after `now` skipped; null when it rings only once. */
export function afterNextRing({ timestamp, repeat }: AlarmTrigger, now: Date): AlarmTrigger | null {
  if (repeat === null) return null;
  let next = timestamp;

  while (next <= now.getTime()) next = step(next, repeat);

  return { timestamp: step(next, repeat), repeat };
}

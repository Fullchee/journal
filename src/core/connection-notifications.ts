import { CHANNEL, hashText, type ScheduledNotification } from "./alarms";
import { clockLabel, minutesOf, torontoDay } from "./calendar";
import { firstFollowUp, nextOccurrence, type Connection } from "./connections-view";

/** How long before a meetup starts its reminder shows. */
export const MEETUP_LEAD_MINUTES = 30;

/** Important-date reminders show at this hour, the day before and the morning of. */
const DATE_REMINDER_HOUR = 9;

// Habit alarm ids end below 2,000,000,000 (see `notificationId`); Connection ids fill the rest of a Java int.
const ID_BASE = 2_000_000_000;
const ID_SLOTS = 14_000_000;

// The last digit holds the slot: a weekday (1-7) for a meetup, 0 or 1 for a date's two reminders.
const connectionNotificationId = (key: string, slot: number) =>
  ID_BASE + (hashText(key) % ID_SLOTS) * 10 + slot;

const DAY_MINUTES = 24 * 60;

// Hermes has no Intl.ListFormat, so names join by hand as English lists them: "Sam and Ana", "Sam, Ana, and Lee".
function listNames(names: string[]) {
  return names.length < 3
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

interface Attendee {
  name: string;
  followUp: string;
}

interface MeetupSlot {
  label: string;
  time: string;
  weekday: number;
  people: Attendee[];
}

// People at the same meetup share one reminder; labels match regardless of case.
function meetupSlots(connections: Connection[]): MeetupSlot[] {
  const slots = new Map<string, MeetupSlot>();

  for (const { name, followUps, meetups } of connections)
    for (const { label, days, time } of meetups) {
      if (time === undefined || time === "") continue;

      for (const weekday of days) {
        const key = `${label.toLowerCase()}|${time}|${weekday}`;
        const slot = slots.get(key) ?? { label, time, weekday, people: [] };

        slot.people.push({ name, followUp: firstFollowUp(followUps) });
        slots.set(key, slot);
      }
    }

  return [...slots].map(([, slot]) => slot);
}

function askAbout(people: Attendee[]) {
  const asks = people.filter((p) => p.followUp !== "");

  if (people.length === 1) return asks[0] ? `Ask about: ${asks[0].followUp}` : "";

  return asks.map((p) => `${p.name}: ${p.followUp}`).join(" · ");
}

// `weekday` follows the plugin's `Weekday` enum, where 1 is Sunday; a meetup's days use 0 for Sunday.
function meetupNotification({ label, time, weekday, people }: MeetupSlot): ScheduledNotification {
  // A reminder before an early-morning meetup falls on the evening before.
  const at = minutesOf(time) - MEETUP_LEAD_MINUTES;
  const shift = at < 0 ? -1 : 0;
  const reminder = (at + DAY_MINUTES) % DAY_MINUTES;
  const plugin = ((weekday + shift + 7) % 7) + 1;
  const asks = askAbout(people);

  return {
    id: connectionNotificationId(`meetup|${label.toLowerCase()}|${time}`, plugin),
    title: `Seeing ${listNames(people.map((p) => p.name))} at ${label}`,
    body: asks === "" ? `Starts at ${clockLabel(time)}` : asks,
    channelId: CHANNEL.persistent,
    autoCancel: true,
    schedule: {
      on: { weekday: plugin, hour: Math.floor(reminder / 60), minute: reminder % 60, second: 0 },
      allowWhileIdle: true,
    },
  };
}

// Each date's next occurrence gets two one-off reminders; every launch reschedules, so next year's follow.
function dateNotifications(connections: Connection[], now: Date): ScheduledNotification[] {
  return connections.flatMap(({ id, name, dates }) =>
    dates.flatMap((d) => {
      const on = nextOccurrence(d, torontoDay(now));

      if (on === null) return [];
      const year = Number(on.slice(0, 4));
      const month = Number(on.slice(5, 7));
      const day = Number(on.slice(8));

      return [
        { slot: 0, when: "Tomorrow", at: new Date(year, month - 1, day - 1, DATE_REMINDER_HOUR) },
        { slot: 1, when: "Today", at: new Date(year, month - 1, day, DATE_REMINDER_HOUR) },
      ].flatMap(({ slot, when, at }) =>
        at > now
          ? {
              id: connectionNotificationId(`date|${id}|${d.label}|${d.date}`, slot),
              title: `${name}: ${d.label}`,
              body: when,
              channelId: CHANNEL.persistent,
              autoCancel: true,
              schedule: { at, allowWhileIdle: true },
            }
          : [],
      );
    }),
  );
}

export const connectionNotifications = (
  connections: Connection[],
  now: Date,
): ScheduledNotification[] => [
  ...meetupSlots(connections).map((slot) => meetupNotification(slot)),
  ...dateNotifications(connections, now),
];

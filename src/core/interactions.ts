import * as z from "zod/mini";

import { formatDay } from "./calendar";

/** Mode of contact matters little for keeping a tie, but real friendships need some time in person (Dunbar 2016). */
export const INTERACTION_KINDS = ["in-person", "call", "message"] as const;

export const InteractionKind = z.enum(INTERACTION_KINDS);

export type InteractionKind = z.infer<typeof InteractionKind>;

export const INTERACTION_KIND_LABELS: Record<InteractionKind, string> = {
  "in-person": "In person",
  call: "Call",
  message: "Message",
};

const InteractionPerson = z.object({ id: z.number(), name: z.string() });

/** One time I was in touch; `day` is a Toronto Day, and only an in-person one holds `minutes` together. */
export const Interaction = z.object({
  id: z.number(),
  day: z.string(),
  kind: InteractionKind,
  note: z.string(),
  minutes: z.nullable(z.number()),
  connections: z.array(InteractionPerson),
  /** The Circle a counted day of its Habit logged this for; null for one I logged. */
  circle: z.nullable(z.string()),
});

export type Interaction = z.infer<typeof Interaction>;

/** A name the sentence used, with the Connections it could mean: one is a match, none or several ask me to pick. */
const NamedPerson = z.object({ said: z.string(), matches: z.array(InteractionPerson) });

export type NamedPerson = z.infer<typeof NamedPerson>;

/** The Connections list's AI box turns a sentence into this; I review it and nothing saves until I tap Save. */
export const InteractionProposal = z.object({
  people: z.array(NamedPerson),
  day: z.string(),
  kind: InteractionKind,
  note: z.string(),
  followUp: z.string(),
});

export type InteractionProposal = z.infer<typeof InteractionProposal>;

const HOUR = 60;

const durationLabel = (minutes: number) =>
  minutes < HOUR ? `${minutes} min` : `${Math.round((minutes / HOUR) * 10) / 10} h`;

/** Such as "Nov 6 · In person · 1.5 h"; a day in another year than `today` shows its year. */
export function interactionLabel(
  { day, kind, minutes }: Pick<Interaction, "day" | "kind" | "minutes">,
  today: string,
) {
  const sameYear = day.slice(0, 4) === today.slice(0, 4);

  const date = formatDay(day, {
    month: "short",
    day: "numeric",
    ...(!sameYear && { year: "numeric" }),
  });

  return [date, INTERACTION_KIND_LABELS[kind], minutes === null ? "" : durationLabel(minutes)]
    .filter(Boolean)
    .join(" · ");
}

/** Who else was there, as "With …": a Circle's Interaction names the Circle, never every member. */
export function interactionWith(
  { circle, connections }: Pick<Interaction, "circle" | "connections">,
  connectionId: number,
) {
  if (circle !== null) return `With ${circle}`;
  const others = connections.filter((c) => c.id !== connectionId).map((c) => c.name);

  return others.length === 0 ? null : `With ${others.join(", ")}`;
}

/** About 50, 90 and 200 hours together make a casual friend, a friend and a good friend (Hall 2019). */
const HOURS_TOGETHER_MARKS = [50, 90, 200];

/** Hours together, rounded down to a tenth; only in-person Interactions hold minutes. */
export function hoursTogether(interactions: Pick<Interaction, "minutes">[]) {
  const minutes = interactions.reduce((sum, interaction) => sum + (interaction.minutes ?? 0), 0);

  return Math.floor((minutes / HOUR) * 10) / 10;
}

/** Such as "6 h of 50 h", up to the next mark; past the last mark, just "250 h". */
export function hoursTogetherLabel(hours: number) {
  const mark = HOURS_TOGETHER_MARKS.find((m) => hours < m);

  return mark === undefined ? `${hours} h` : `${hours} h of ${mark} h`;
}

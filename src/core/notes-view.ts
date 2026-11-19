import * as z from "zod/mini";

/** Which note types exist is the API's choice; the headings are display choices. */
export const NOTE_TYPES = {
  goals: {
    heading: "Goals",
    description: "Durable directions, each with its felt why and the Habits that serve it.",
  },
  reflections: {
    heading: "Reflections",
    description: "Weekly retros and the reviews they roll up into.",
  },
  "health-records": {
    heading: "Health records",
    description: "Medical history and visit prep behind the Health plan.",
  },
} satisfies Record<string, { heading: string; description: string }>;

export type NoteType = keyof typeof NOTE_TYPES;

export const isNoteType = (value: string | null): value is NoteType =>
  value !== null && Object.hasOwn(NOTE_TYPES, value);

const MAX_TITLE = 200;

const notBlank = (title: string) => title.trim() !== "";

/** A note or Goal title as saved: trimmed, never blank, at most 200 characters. */
export const NoteTitle = z.pipe(
  z.string().check(z.maxLength(MAX_TITLE), z.refine(notBlank)),
  z.transform((title) => title.trim()),
);

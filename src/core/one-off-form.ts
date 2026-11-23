import { DraftOneOff, type NewOneOff } from "./log-api";

/** The log box's One-off form; `date` is "" until a day is picked. */
export interface OneOffForm {
  name: string;
  date: string;
  usualWhen: string;
}

const BLANK: OneOffForm = { name: "", date: "", usualWhen: "" };

/** The drafted One-off arrives as JSON in `?draft`; one that doesn't parse opens a blank form. */
export function openOneOff(draft = ""): OneOffForm {
  let parsed: DraftOneOff | undefined;

  try {
    parsed = DraftOneOff.safeParse(JSON.parse(draft)).data;
  } catch {
    // Not JSON: open a blank form like an empty draft.
  }

  return parsed
    ? { name: parsed.name, date: parsed.date ?? "", usualWhen: parsed.usual_when }
    : BLANK;
}

/** What stops the One-off from saving, or null when it can; a One-off is a plan, so its day can't be past. */
export function oneOffProblem({ name, date }: OneOffForm, today: string): string | null {
  if (name.trim() === "") return "Name the One-off.";

  if (date === "") return `Which day is ${name.trim()}?`;

  return date < today ? "Pick today or a later day." : null;
}

export const newOneOffOf = ({ name, date, usualWhen }: OneOffForm): NewOneOff => ({
  name: name.trim(),
  date,
  usual_when: usualWhen,
});

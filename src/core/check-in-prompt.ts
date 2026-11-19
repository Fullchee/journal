import { isoAt, shiftDay, torontoDay } from "./calendar";
import { ZONES, type CheckIn, type Zone } from "./check-in-view";
import { restPeriodOn, type RestPeriod } from "./rest-mode";

// Connection reminder ids end below 2,000,000,000 + 14,000,000 × 10, so the prompt's ids clash with no other alarm.
const ID_BASE = 2_000_000_000 + 14_000_000 * 10;

/** Today's prompt and tomorrow's each keep one id, so every re-plan replaces both. */
export const CHECK_IN_PROMPT_IDS: readonly number[] = [ID_BASE, ID_BASE + 1];

// A trial of 1,255 people found a prompt raised self-monitoring most at 12:30 pm (Bidargaddi et al. 2018).
const PROMPT_MINUTES = 12 * 60 + 30;

const BUTTON_COUNT = 3;

/** One midday notification asking for a Check-in, with a button per zone. */
export interface CheckInPrompt {
  id: number;
  /** The Day it asks about; its press handler keys on it. */
  day: string;
  at: string;
  title: string;
  body: string;
  zones: Zone[];
}

/** The last zone and its neighbours on the Storm-to-Sun line; with no Check-in yet, the middle of it. */
export function promptZones(lastZone: Zone | null): Zone[] {
  const index = ZONES.indexOf(lastZone ?? "Cloud");
  const start = Math.min(Math.max(index - 1, 0), ZONES.length - BUTTON_COUNT);

  return ZONES.slice(start, start + BUTTON_COUNT);
}

/** The zone of the newest Check-in, or null before the first one. */
export const latestZone = (checkIns: Pick<CheckIn, "checkedInAt" | "zone">[]): Zone | null =>
  checkIns.toSorted((a, b) => Date.parse(b.checkedInAt) - Date.parse(a.checkedInAt))[0]?.zone ??
  null;

interface PlanInput {
  checkedInAt: string[];
  restPeriods: RestPeriod[];
  lastZone: Zone | null;
  now: Date;
}

/**
 * Today's prompt shows only on a Day with no Check-in yet, before 12:30. Tomorrow's is always planned, so it still
 * shows if the app stays closed. Rest mode Days get none.
 */
export function checkInPromptPlan({
  checkedInAt,
  restPeriods,
  lastZone,
  now,
}: PlanInput): CheckInPrompt[] {
  const today = torontoDay(now);
  const tomorrow = shiftDay(today, 1);
  const isRestDay = (day: string) => restPeriodOn(restPeriods, day) !== null;

  const prompt = (day: string, slot: number): CheckInPrompt => ({
    id: ID_BASE + slot,
    day,
    at: isoAt(day, PROMPT_MINUTES),
    title: "Check-in",
    body: "How's the weather?",
    zones: promptZones(lastZone),
  });

  const todays = prompt(today, 0);

  const todayOpen =
    !isRestDay(today) &&
    Date.parse(todays.at) > now.getTime() &&
    checkedInAt.every((at) => torontoDay(at) !== today);

  return [...(todayOpen ? [todays] : []), ...(isRestDay(tomorrow) ? [] : [prompt(tomorrow, 1)])];
}

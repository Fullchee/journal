/** Every Day is a Toronto calendar day, midnight to midnight, wherever the phone is (ADR 0013). */
export const TIME_ZONE = "America/Toronto";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

type Instant = string | number | Date;

const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// Toronto's wall time at an instant, read back as if it were UTC.
function wallMs(at: Instant) {
  const p = Object.fromEntries(
    clock.formatToParts(new Date(at)).map((part) => [part.type, part.value]),
  );

  return Date.UTC(
    Number(p["year"]),
    Number(p["month"]) - 1,
    Number(p["day"]),
    Number(p["hour"]),
    Number(p["minute"]),
  );
}

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

const dayOfMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Day an instant falls on, as YYYY-MM-DD. */
export const torontoDay = (at: Instant) => dayOfMs(wallMs(at));

/** Minutes after midnight on Toronto's clock at an instant. */
export const minuteOfDay = (at: Instant) => (wallMs(at) % DAY_MS) / MINUTE_MS;

/** "HH:MM" on a 24-hour clock. */
export const formatMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "HH:MM" read back as minutes after midnight. */
export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** "5:05 PM" from "17:05": every time of day the app shows has AM or PM, while stored times stay HH:MM. */
export function clockLabel(time: string) {
  const minutes = minutesOf(time);
  const hour = Math.floor(minutes / 60);
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;

  return `${twelveHour}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** Toronto's clock at an instant, as "HH:MM". */
export const torontoTime = (at: Instant) => formatMinutes(minuteOfDay(at));

/** The instant at which Toronto's clock reads `minutes` on `day`; the second pass settles a DST change. */
export function isoAt(day: string, minutes = 0) {
  const guess = dayMs(day) + minutes * MINUTE_MS;
  const first = guess - (wallMs(guess) - guess);

  return new Date(guess - (wallMs(first) - first)).toISOString();
}

export const shiftDay = (day: string, days: number) => dayOfMs(dayMs(day) + days * DAY_MS);

/** Whole Days from `from` to `to`; negative when `to` comes first. */
export const daysBetween = (from: string, to: string) =>
  Math.round((dayMs(to) - dayMs(from)) / DAY_MS);

/** 0 is Sunday, as in a Habit's target days. */
export const dayOfWeek = (day: string) => new Date(dayMs(day)).getUTCDay();

/** Weeks start on Monday, so Sunday is the last Day of its week. */
export const mondayOf = (day: string) => shiftDay(day, -((dayOfWeek(day) + 6) % 7));

/** Every Day from `first` to `last`, both included. */
export function daysFrom(first: string, last: string) {
  const days: string[] = [];

  for (let day = first; day <= last; day = shiftDay(day, 1)) days.push(day);

  return days;
}

/** The Monday-to-Sunday week that holds `day`. */
export const weekOf = (day: string) => daysFrom(mondayOf(day), shiftDay(mondayOf(day), 6));

/** Every Day of the calendar month that holds `day`; Date.UTC's day 0 is the last day of the month before. */
export function monthDaysOf(day: string) {
  const lastMs = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0);

  return daysFrom(`${day.slice(0, 7)}-01`, dayOfMs(lastMs));
}

/** Labels a Day with Intl, such as "Tue, Nov 3"; the label never shifts with the phone's zone. */
export const formatDay = (day: string, options: Intl.DateTimeFormatOptions, locale = "en-US") =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(dayMs(day));

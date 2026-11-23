import { minuteOfDay } from "@/core";

import { NavRow } from "@/components/nav-row";

/** The Evening review opens from 5 PM, when most of the day's events have passed. */
const EVENING_MINUTE = 17 * 60;

/** Today's way into the Evening review, shown only in the evening. */
// eslint-disable-next-line eslint-react/purity -- whether it is evening yet reads the clock on each render
export function EveningReviewRow({ now = new Date() }: { now?: Date }) {
  if (minuteOfDay(now) < EVENING_MINUTE) return null;

  return (
    <NavRow href="/evening-review" label="Evening review" detail="Review today's calendar events" />
  );
}

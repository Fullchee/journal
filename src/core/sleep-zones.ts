// How long the owner slept against the zones of the Check-ins after it: counts only, never a score.
import { torontoDay } from "./calendar";
import type { CheckIn } from "./check-in-view";

type ZonedCheckIn = Pick<CheckIn, "checkedInAt" | "zone">;

interface SleptNight {
  date: string;
  durationMin: number;
}

const HOUR = 60;

/** Shortest first, the order the card lists them. */
const BUCKETS = ["Under 6h", "6–7h", "7h or more"] as const;

type Bucket = (typeof BUCKETS)[number];

function bucketOf(minutes: number): Bucket {
  if (minutes < 6 * HOUR) return "Under 6h";

  return minutes < 7 * HOUR ? "6–7h" : "7h or more";
}

// One Check-in says nothing about a night length, and one bucket has nothing to compare with.
const MIN_CHECK_INS = 2;
const MIN_BUCKETS = 2;

/** The sleep table dates a night by the morning it ends, so a Check-in's own Toronto Day names its night. */
export function sleepZoneRows(checkIns: ZonedCheckIn[], nights: SleptNight[]) {
  const minutesByDay = new Map(nights.map((n) => [n.date, n.durationMin]));
  const counts = new Map<Bucket, { all: number; stormOrRain: number }>();

  for (const { checkedInAt, zone } of checkIns) {
    const minutes = minutesByDay.get(torontoDay(checkedInAt));

    if (minutes === undefined) continue;
    const bucket = bucketOf(minutes);
    const count = counts.get(bucket) ?? { all: 0, stormOrRain: 0 };

    count.all += 1;

    if (zone === "Storm" || zone === "Rain") count.stormOrRain += 1;
    counts.set(bucket, count);
  }

  const rows = BUCKETS.flatMap((label) => {
    const count = counts.get(label);

    if (count === undefined || count.all < MIN_CHECK_INS) return [];

    return {
      label,
      value: `Storm or Rain on ${count.stormOrRain} of ${count.all} Check-ins`,
      trend: "",
    };
  });

  return rows.length < MIN_BUCKETS ? [] : rows;
}

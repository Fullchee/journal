import assert from "node:assert/strict";
import { isoAt, shiftDay, torontoDay } from "@/core/calendar";
import { sleepZoneRows } from "@/core/sleep-zones";

type Zone = "Storm" | "Rain" | "Cloud" | "Sun";

const today = torontoDay(new Date());

const day = (daysAgo: number) => shiftDay(today, -daysAgo);

const checkIn = (daysAgo: number, zone: Zone, minutes = 600) => ({
  checkedInAt: isoAt(day(daysAgo), minutes),
  zone,
});

const night = (daysAgo: number, hours: number) => ({
  date: day(daysAgo),
  durationMin: hours * 60,
});

test("Check-ins split by the length of the night before, counting Storm or Rain", () => {
  const nights = [night(1, 5), night(2, 5), night(3, 8), night(4, 8), night(5, 8)];

  const checkIns = [
    checkIn(1, "Storm"),
    checkIn(1, "Cloud"),
    checkIn(2, "Rain"),
    checkIn(3, "Sun"),
    checkIn(4, "Rain"),
    checkIn(5, "Cloud"),
  ];

  assert.deepEqual(sleepZoneRows(checkIns, nights), [
    { label: "Under 6h", value: "Storm or Rain on 2 of 3 Check-ins", trend: "" },
    { label: "7h or more", value: "Storm or Rain on 1 of 3 Check-ins", trend: "" },
  ]);
});

test("6 to 7 hours is its own bucket, and 7 hours exactly counts as 7h or more", () => {
  const nights = [night(1, 6), night(2, 6.5), night(3, 7), night(4, 7)];

  const checkIns = [checkIn(1, "Sun"), checkIn(2, "Storm"), checkIn(3, "Sun"), checkIn(4, "Sun")];

  assert.deepEqual(sleepZoneRows(checkIns, nights), [
    { label: "6–7h", value: "Storm or Rain on 1 of 2 Check-ins", trend: "" },
    { label: "7h or more", value: "Storm or Rain on 0 of 2 Check-ins", trend: "" },
  ]);
});

test("a bucket with one Check-in is left out, and one bucket alone shows nothing", () => {
  const nights = [night(1, 5), night(2, 8), night(3, 8)];

  assert.deepEqual(
    sleepZoneRows([checkIn(1, "Storm"), checkIn(2, "Sun"), checkIn(3, "Sun")], nights),
    [],
  );
  assert.deepEqual(sleepZoneRows([], nights), []);
});

test("a Check-in on a Day with no sleep row counts in no bucket", () => {
  const nights = [night(1, 5), night(2, 5), night(3, 8), night(4, 8)];

  const checkIns = [
    checkIn(1, "Storm"),
    checkIn(2, "Sun"),
    checkIn(3, "Sun"),
    checkIn(4, "Sun"),
    checkIn(9, "Storm"),
  ];

  assert.deepEqual(sleepZoneRows(checkIns, nights), [
    { label: "Under 6h", value: "Storm or Rain on 1 of 2 Check-ins", trend: "" },
    { label: "7h or more", value: "Storm or Rain on 0 of 2 Check-ins", trend: "" },
  ]);
});

test("a Check-in at 00:30 Toronto uses that Day's night, not the evening before", () => {
  // Day 1's night was short and Day 2's long; 00:30 on Day 1 belongs to Day 1.
  const nights = [night(1, 5), night(2, 8), night(3, 5), night(4, 8)];

  const checkIns = [
    checkIn(1, "Storm", 30),
    checkIn(3, "Storm", 30),
    checkIn(2, "Sun", 30),
    checkIn(4, "Sun", 30),
  ];

  assert.deepEqual(sleepZoneRows(checkIns, nights), [
    { label: "Under 6h", value: "Storm or Rain on 2 of 2 Check-ins", trend: "" },
    { label: "7h or more", value: "Storm or Rain on 0 of 2 Check-ins", trend: "" },
  ]);
});

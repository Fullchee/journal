import assert from "node:assert/strict";
import {
  ageOn,
  dayOfYearless,
  hasYear,
  nextOccurrence,
  upcomingDates,
  withYear,
} from "@/core/connections-view";
import { makeConnection } from "./helpers/connection";

const birthday = (date: string) => ({ label: "Birthday", date, yearly: true });

test("a yearless birthday still ahead falls this year", () => {
  assert.equal(nextOccurrence(birthday("--11-20"), "2026-11-06"), "2026-11-20");
});

test("a yearless birthday already passed falls next year", () => {
  assert.equal(nextOccurrence(birthday("--03-12"), "2026-11-06"), "2027-03-12");
});

test("a yearless Feb 29 falls on Mar 1 in other years", () => {
  assert.equal(nextOccurrence(birthday("--02-29"), "2026-11-06"), "2027-03-01");
});

test("a yearless birthday on Nov 20 shows in Today's upcoming dates from Nov 6", () => {
  const sam = makeConnection({ id: 4, name: "Sam", dates: [birthday("--11-20")] });

  assert.deepEqual(upcomingDates([sam], "2026-11-06"), [
    { id: 4, name: "Sam", label: "Birthday", inDays: 14 },
  ]);
});

test("ageOn counts the years to the next occurrence when the year is known", () => {
  assert.equal(ageOn(birthday("1995-11-20"), "2026-11-20"), 31);
});

test("ageOn has no age for a yearless birthday", () => {
  assert.equal(ageOn(birthday("--11-20"), "2026-11-20"), null);
});

test("ageOn has no age for a one-off date", () => {
  assert.equal(ageOn({ label: "Wedding", date: "2027-06-05", yearly: false }, "2027-06-05"), null);
});

test("hasYear tells a full day from a yearless one", () => {
  assert.deepEqual([hasYear("1995-11-20"), hasYear("--11-20")], [true, false]);
});

test("withYear drops the year and puts it back", () => {
  assert.deepEqual(
    [withYear("1995-11-20", null), withYear("--11-20", "2026")],
    ["--11-20", "2026-11-20"],
  );
});

test("dayOfYearless gives a picker a full day in a leap year", () => {
  assert.deepEqual(
    [dayOfYearless("--02-29"), dayOfYearless("1995-11-20")],
    ["2000-02-29", "1995-11-20"],
  );
});

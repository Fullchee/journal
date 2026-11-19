import assert from "node:assert/strict";
import {
  clockLabel,
  dayOfWeek,
  daysBetween,
  daysFrom,
  formatDay,
  formatMinutes,
  isoAt,
  minuteOfDay,
  minutesOf,
  mondayOf,
  monthDaysOf,
  shiftDay,
  torontoDay,
  torontoTime,
  weekOf,
} from "@/core/calendar";

test("clockLabel shows a time of day with AM or PM", () => {
  assert.equal(clockLabel("08:00"), "8:00 AM");
  assert.equal(clockLabel("00:05"), "12:05 AM");
  assert.equal(clockLabel("12:30"), "12:30 PM");
  assert.equal(clockLabel("17:05"), "5:05 PM");
  assert.equal(clockLabel("23:59"), "11:59 PM");
});

test("a late-night Check-in stays on the Toronto Day it was lived", () => {
  assert.equal(torontoDay("2026-11-06T04:59:00Z"), "2026-11-05");
  assert.equal(torontoTime("2026-11-06T04:59:00Z"), "23:59");
});

test("the Day turns over at Toronto midnight, with no late-night cutoff", () => {
  assert.equal(torontoDay("2026-11-06T05:00:00Z"), "2026-11-06");
  assert.equal(torontoTime("2026-11-06T05:00:00Z"), "00:00");
});

test("a Check-in at 23:00 in Vancouver lands on the next Toronto Day", () => {
  // 23:00 PST on Nov 5 is 07:00 UTC on Nov 6, 02:00 in Toronto.
  const vancouver = new Date("2026-11-05T23:00:00-08:00");

  assert.equal(torontoDay(vancouver), "2026-11-06");
  assert.equal(torontoTime(vancouver), "02:00");
});

test("a morning in Tokyo is still the previous evening's Day in Toronto", () => {
  assert.equal(torontoDay(new Date("2026-11-06T08:00:00+09:00")), "2026-11-05");
});

test("torontoDay reads strings, numbers and Dates alike", () => {
  const at = "2026-07-01T12:00:00Z";

  assert.equal(torontoDay(Date.parse(at)), torontoDay(new Date(at)));
  assert.equal(torontoDay(at), "2026-07-01");
});

test("spring forward: the Day skips 02:00 to 03:00, and midnight still starts it", () => {
  // Toronto moves its clocks forward at 02:00 EST on 2026-03-08.
  assert.equal(isoAt("2026-03-08"), "2026-03-08T05:00:00.000Z");
  assert.equal(torontoTime("2026-03-08T06:59:00Z"), "01:59");
  assert.equal(torontoTime("2026-03-08T07:00:00Z"), "03:00");
  assert.equal(isoAt("2026-03-08", 9 * 60), "2026-03-08T13:00:00.000Z");
  assert.equal(torontoDay("2026-03-09T03:59:00Z"), "2026-03-08");
  assert.equal(torontoDay("2026-03-09T04:00:00Z"), "2026-03-09");
});

test("fall back: the Day repeats 01:00 and still ends at midnight", () => {
  // Toronto moves its clocks back at 02:00 EDT on 2026-11-01.
  assert.equal(isoAt("2026-11-01"), "2026-11-01T04:00:00.000Z");
  assert.equal(torontoTime("2026-11-01T05:30:00Z"), "01:30");
  assert.equal(torontoTime("2026-11-01T06:30:00Z"), "01:30");
  assert.equal(isoAt("2026-11-01", 9 * 60), "2026-11-01T14:00:00.000Z");
  assert.equal(torontoDay("2026-11-02T04:59:00Z"), "2026-11-01");
  assert.equal(torontoDay("2026-11-02T05:00:00Z"), "2026-11-02");
});

test("isoAt gives the Toronto wall time as an instant in winter and summer", () => {
  assert.equal(isoAt("2026-11-06", 540), "2026-11-06T14:00:00.000Z");
  assert.equal(isoAt("2026-07-06", 540), "2026-07-06T13:00:00.000Z");
});

test("minuteOfDay counts minutes after Toronto midnight", () => {
  assert.equal(minuteOfDay("2026-11-06T14:05:00Z"), 545);
});

test("formatMinutes and minutesOf convert 24-hour clock times both ways", () => {
  assert.equal(formatMinutes(545), "09:05");
  assert.equal(minutesOf("09:05"), 545);
});

test("shiftDay moves whole Days across a month, a year and a DST change", () => {
  assert.equal(shiftDay("2026-11-01", -1), "2026-10-31");
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDay("2026-03-07", 2), "2026-03-09");
});

test("daysBetween counts whole Days, negative when the second comes first", () => {
  assert.equal(daysBetween("2026-10-30", "2026-11-06"), 7);
  assert.equal(daysBetween("2026-11-06", "2026-11-05"), -1);
});

test("weeks start on Monday, and Sunday is day 0", () => {
  assert.equal(dayOfWeek("2026-11-08"), 0);
  assert.equal(mondayOf("2026-11-08"), "2026-11-02");
  assert.equal(mondayOf("2026-11-09"), "2026-11-09");
});

test("weekOf runs Monday to Sunday", () => {
  assert.deepEqual(weekOf("2026-11-08"), daysFrom("2026-11-02", "2026-11-08"));
  assert.equal(weekOf("2026-11-09")[0], "2026-11-09");
});

test("monthDaysOf lists every Day of the month, leap February included", () => {
  const november = monthDaysOf("2026-11-14");

  assert.equal(november.length, 30);
  assert.equal(november[0], "2026-11-01");
  assert.equal(november.at(-1), "2026-11-30");
  assert.equal(monthDaysOf("2028-02-03").length, 29);
  assert.equal(monthDaysOf("2026-12-31").at(-1), "2026-12-31");
});

test("daysFrom lists every Day, both ends included", () => {
  assert.deepEqual(daysFrom("2026-10-30", "2026-11-01"), [
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ]);
  assert.deepEqual(daysFrom("2026-11-02", "2026-11-01"), []);
});

test("formatDay labels the Day itself, in a chosen locale", () => {
  assert.equal(
    formatDay("2026-11-03", { weekday: "short", month: "short", day: "numeric" }),
    "Tue, Nov 3",
  );
  assert.equal(formatDay("2026-11-03", { day: "numeric", month: "short" }, "en-GB"), "3 Nov");
});

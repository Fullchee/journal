import assert from "node:assert/strict";
import { isoAt } from "@/core/calendar";
import {
  CHECK_IN_PROMPT_IDS,
  checkInPromptPlan,
  latestZone,
  promptZones,
} from "@/core/check-in-prompt";

const TODAY = "2026-11-14";
const TOMORROW = "2026-11-15";

const todayAt = (hour: number, minute = 0) => new Date(isoAt(TODAY, hour * 60 + minute));

const plan = (over: Partial<Parameters<typeof checkInPromptPlan>[0]> = {}) =>
  checkInPromptPlan({
    checkedInAt: [],
    restPeriods: [],
    lastZone: null,
    now: todayAt(9),
    ...over,
  });

test("a morning with no Check-in prompts at 12:30 today and tomorrow", () => {
  assert.deepEqual(plan(), [
    {
      id: CHECK_IN_PROMPT_IDS[0],
      day: TODAY,
      at: isoAt(TODAY, 750),
      title: "Check-in",
      body: "How's the weather?",
      zones: ["Rain", "Cloud", "Sun"],
    },
    {
      id: CHECK_IN_PROMPT_IDS[1],
      day: TOMORROW,
      at: isoAt(TOMORROW, 750),
      title: "Check-in",
      body: "How's the weather?",
      zones: ["Rain", "Cloud", "Sun"],
    },
  ]);
});

test("a Check-in today leaves only tomorrow's prompt", () => {
  const prompts = plan({ checkedInAt: [isoAt(TODAY, 8 * 60)] });

  assert.deepEqual(
    prompts.map((p) => p.day),
    [TOMORROW],
  );
});

test("a Check-in on another Day still prompts today", () => {
  const prompts = plan({ checkedInAt: [isoAt("2026-11-13", 23 * 60)] });

  assert.deepEqual(
    prompts.map((p) => p.day),
    [TODAY, TOMORROW],
  );
});

test("once 12:30 passes, only tomorrow's prompt is left", () => {
  assert.deepEqual(
    plan({ now: todayAt(12, 30) }).map((p) => p.day),
    [TOMORROW],
  );
});

test("a Rest mode Day gets no prompt", () => {
  assert.deepEqual(
    plan({ restPeriods: [{ start: TODAY, end: TODAY }] }).map((p) => p.day),
    [TOMORROW],
  );
  assert.deepEqual(
    plan({ restPeriods: [{ start: TOMORROW, end: "2026-11-20" }] }).map((p) => p.day),
    [TODAY],
  );
  assert.deepEqual(plan({ restPeriods: [{ start: "2026-11-10", end: TOMORROW }] }), []);
});

test("the buttons name the last zone and its neighbours", () => {
  assert.deepEqual(promptZones(null), ["Rain", "Cloud", "Sun"]);
  assert.deepEqual(promptZones("Storm"), ["Storm", "Rain", "Cloud"]);
  assert.deepEqual(promptZones("Rain"), ["Storm", "Rain", "Cloud"]);
  assert.deepEqual(promptZones("Cloud"), ["Rain", "Cloud", "Sun"]);
  assert.deepEqual(promptZones("Sun"), ["Rain", "Cloud", "Sun"]);
  assert.deepEqual(plan({ lastZone: "Storm" })[0]?.zones, ["Storm", "Rain", "Cloud"]);
});

test("the prompt ids sit above the Connection reminder range", () => {
  assert.deepEqual(CHECK_IN_PROMPT_IDS, [2_140_000_000, 2_140_000_001]);
});

test("the latest zone comes from the newest Check-in, whatever the order", () => {
  assert.equal(latestZone([]), null);
  assert.equal(
    latestZone([
      { checkedInAt: "2026-11-13T09:00:00-05:00", zone: "Rain" },
      { checkedInAt: "2026-11-14T09:00:00-05:00", zone: "Sun" },
      { checkedInAt: "2026-11-12T09:00:00-05:00", zone: "Storm" },
    ]),
    "Sun",
  );
});

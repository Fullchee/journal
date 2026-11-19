import assert from "node:assert/strict";
import {
  Interaction,
  InteractionProposal,
  hoursTogether,
  hoursTogetherLabel,
  interactionLabel,
  interactionWith,
} from "@/core/interactions";

const CALL = {
  id: 1,
  day: "2026-11-06",
  kind: "call",
  note: "her move",
  minutes: null,
  circle: null,
  connections: [{ id: 2, name: "Sam" }],
} as const;

test("an Interaction parses its people and leaves minutes empty when not in person", () => {
  assert.deepEqual(Interaction.parse(CALL), CALL);
});

test("an Interaction rejects an unknown kind", () => {
  assert.equal(Interaction.safeParse({ ...CALL, kind: "email" }).success, false);
});

const TODAY = "2026-11-11";

test("interactionLabel names the day and kind, and the time together in person", () => {
  assert.equal(interactionLabel(CALL, TODAY), "Nov 6 · Call");
  assert.equal(
    interactionLabel({ ...CALL, kind: "in-person", minutes: 90 }, TODAY),
    "Nov 6 · In person · 1.5 h",
  );
  assert.equal(
    interactionLabel({ ...CALL, kind: "in-person", minutes: 45 }, TODAY),
    "Nov 6 · In person · 45 min",
  );
});

test("interactionLabel adds the year to a day in another year", () => {
  assert.equal(interactionLabel({ ...CALL, day: "2025-12-20" }, TODAY), "Dec 20, 2025 · Call");
});

const inPerson = (minutes: number | null) => ({ ...CALL, kind: "in-person", minutes }) as const;

test("an InteractionProposal keeps each name with its candidate Connections", () => {
  const proposal = {
    people: [
      { said: "Cindy", matches: [{ id: 2, name: "Cindy" }] },
      { said: "Raj", matches: [] },
    ],
    day: "2026-11-11",
    kind: "in-person",
    note: "Dinner",
    followUp: "",
  } as const;

  assert.deepEqual(InteractionProposal.parse(proposal), proposal);
  assert.equal(InteractionProposal.safeParse({ ...proposal, kind: "email" }).success, false);
});

test("hoursTogether sums in-person minutes, and an Interaction without minutes adds nothing", () => {
  assert.equal(
    hoursTogether([inPerson(120), inPerson(120), inPerson(120), inPerson(null), CALL]),
    6,
  );
  assert.equal(hoursTogether([inPerson(45)]), 0.7);
  assert.equal(hoursTogether([]), 0);
});

test("hoursTogetherLabel shows the next mark: 50 h, then 90 h, then 200 h, then none", () => {
  assert.equal(hoursTogetherLabel(6), "6 h of 50 h");
  assert.equal(hoursTogetherLabel(49.9), "49.9 h of 50 h");
  assert.equal(hoursTogetherLabel(50), "50 h of 90 h");
  assert.equal(hoursTogetherLabel(120), "120 h of 200 h");
  assert.equal(hoursTogetherLabel(200), "200 h");
  assert.equal(hoursTogetherLabel(250.5), "250.5 h");
});

const SAM = { id: 2, name: "Sam" };

const PEOPLE = [SAM, { id: 3, name: "Ana" }];

test("interactionWith names everyone else, the Circle instead of its members, or no one", () => {
  assert.deepEqual(
    [
      interactionWith({ circle: null, connections: PEOPLE }, 2),
      interactionWith({ circle: "Mahjong", connections: PEOPLE }, 2),
      interactionWith({ circle: null, connections: [SAM] }, 2),
    ],
    ["With Ana", "With Mahjong", null],
  );
});

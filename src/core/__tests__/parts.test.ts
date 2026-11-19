import assert from "node:assert/strict";
import { blankPart, partGroups, partOptions, type Part } from "@/core/parts";

const part = (over: Partial<Part> & Pick<Part, "id" | "name">): Part => ({
  role: "unknown",
  wants: "",
  fears: "",
  feltIn: "",
  description: "",
  retired: false,
  createdAt: "2026-11-10T00:00:00.000Z",
  ...over,
});

test("blankPart starts a Part of unknown role, with an optional name", () => {
  assert.deepEqual(blankPart(), {
    name: "",
    role: "unknown",
    wants: "",
    fears: "",
    feltIn: "",
    description: "",
  });
  assert.equal(blankPart("Critic").name, "Critic");
});

test("partOptions offers the active Parts by reference, and none until they load", () => {
  const parts = [
    part({ id: 1, name: "Doer" }),
    part({ id: 2, name: "Critic", retired: true }),
    part({ id: 3, name: "Child" }),
  ];

  assert.deepEqual(partOptions(parts), [
    { id: 1, name: "Doer" },
    { id: 3, name: "Child" },
  ]);
  assert.deepEqual(partOptions(undefined), []);
});

test("partGroups groups active Parts by role in IFS order, retired last, dropping empty groups", () => {
  const groups = partGroups([
    part({ id: 1, name: "Doer", role: "manager" }),
    part({ id: 2, name: "Child", role: "exile" }),
    part({ id: 3, name: "Wolf" }),
    part({ id: 4, name: "Old", role: "manager", retired: true }),
    part({ id: 5, name: "Guard", role: "protector" }),
  ]);

  assert.deepEqual(
    groups.map(({ heading, parts }) => [heading, parts.map((p) => p.name)]),
    [
      ["Manager", ["Doer"]],
      ["Exile", ["Child"]],
      ["Protector", ["Guard"]],
      ["Not yet known", ["Wolf"]],
      ["Retired", ["Old"]],
    ],
  );
});

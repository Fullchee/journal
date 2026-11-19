import assert from "node:assert/strict";
import { newOneOffOf, oneOffProblem, openOneOff, type OneOffForm } from "@/core/one-off-form";

const today = "2026-11-08";

const form = (over: Partial<OneOffForm> = {}): OneOffForm => ({
  name: "Go portaging",
  date: "2026-11-14",
  why: "",
  usualWhen: "",
  ...over,
});

test("openOneOff fills the form from the drafted One-off", () => {
  const draft = JSON.stringify({
    name: "Go portaging",
    date: "2026-11-14",
    why: "Fresh air",
    usual_when: "07:00",
  });

  assert.deepEqual(openOneOff(draft), form({ why: "Fresh air", usualWhen: "07:00" }));
});

test("openOneOff leaves the day empty when the sentence named none", () => {
  const draft = JSON.stringify({ name: "Go portaging", why: "", usual_when: "" });

  assert.deepEqual(openOneOff(draft), form({ date: "" }));
});

test.each([
  ["missing", undefined],
  ["not_json", "{"],
  ["wrong_shape", JSON.stringify({ title: "x" })],
  ["free_text_when", JSON.stringify({ name: "Go portaging", why: "", usual_when: "7am" })],
])("openOneOff opens a blank form when the draft is %s", (_id, draft) => {
  assert.deepEqual(openOneOff(draft), { name: "", date: "", why: "", usualWhen: "" });
});

test("oneOffProblem passes a named One-off due today or later", () => {
  assert.equal(oneOffProblem(form(), today), null);
  assert.equal(oneOffProblem(form({ date: today }), today), null);
});

test("oneOffProblem asks for a name", () => {
  assert.equal(oneOffProblem(form({ name: "  " }), today), "Name the One-off.");
});

test("oneOffProblem asks which day when none is picked", () => {
  assert.equal(oneOffProblem(form({ date: "" }), today), "Which day is Go portaging?");
});

test("oneOffProblem refuses a day before today", () => {
  assert.equal(oneOffProblem(form({ date: "2026-11-07" }), today), "Pick today or a later day.");
});

test("newOneOffOf sends the form in the server's snake_case, trimmed", () => {
  assert.deepEqual(
    newOneOffOf(form({ name: " Go portaging ", why: " Fresh air ", usualWhen: "07:00" })),
    {
      name: "Go portaging",
      date: "2026-11-14",
      why: "Fresh air",
      usual_when: "07:00",
    },
  );
});

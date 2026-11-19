import assert from "node:assert/strict";
import * as z from "zod/mini";
import { NOTE_TYPES, NoteTitle, isNoteType } from "@/core/notes-view";

test("isNoteType accepts every type the API serves", () => {
  assert.equal(isNoteType("goals"), true);
  assert.equal(isNoteType("reflections"), true);
});

test("isNoteType rejects a missing or unknown type", () => {
  assert.equal(isNoteType(null), false);
  assert.equal(isNoteType("practices"), false);
  assert.equal(isNoteType("toString"), false);
});

test("every note type has a page description", () => {
  for (const { description } of Object.values(NOTE_TYPES)) assert.ok(description.length > 0);
});

test("NoteTitle trims a title", () => {
  assert.equal(z.parse(NoteTitle, "  Sleep well "), "Sleep well");
});

test("NoteTitle rejects a blank title and one over 200 characters", () => {
  assert.equal(z.safeParse(NoteTitle, " ".repeat(3)).success, false);
  assert.equal(z.safeParse(NoteTitle, "x".repeat(201)).success, false);
  assert.equal(z.safeParse(NoteTitle, "x".repeat(200)).success, true);
});

import { ApiError, NetworkError } from "@/lib/api/errors";
import { noteListQuery, noteQuery, healthPlanQuery } from "@/lib/data/notes";
import { saveErrorMessage, searchSections, type NoteSection } from "@/lib/notes";

const link = (label: string, text = label) => ({ href: "/notes" as const, label, text });

const SECTIONS: NoteSection[] = [
  { heading: "Library", links: [link("Sleep hygiene", "Sleep hygiene Dim the lights")] },
  { heading: "Goals", links: [link("Find a coach"), link("Move every day")] },
];

describe("searchSections", () => {
  it("returns every section for an empty query", () => {
    expect(searchSections(SECTIONS, "  ")).toBe(SECTIONS);
  });

  it("matches every word in any order and case, and drops empty sections", () => {
    expect(searchSections(SECTIONS, "COACH find")).toEqual([
      { heading: "Goals", links: [link("Find a coach")] },
    ]);
  });

  it("searches the text behind a link, not only its label", () => {
    expect(searchSections(SECTIONS, "lights")[0]?.links[0]?.label).toBe("Sleep hygiene");
  });
});

describe("saveErrorMessage", () => {
  it.each([
    [new ApiError(413, null), "Too long to save (limit about 90 KB)."],
    [new ApiError(409, null), "Couldn't save. Check the title isn't already a goal."],
    [new ApiError(500, null), "Couldn't save. Your text is still here; try again."],
    [new NetworkError("offline"), "Couldn't save. Your text is still here; try again."],
  ])("explains %s", (error, message) => {
    expect(saveErrorMessage(error)).toBe(message);
  });
});

// Persisted queries are what a cold start offline can show.
it("persists the Health plan, the note lists and each note", () => {
  for (const query of [healthPlanQuery, noteListQuery("goals"), noteQuery("reflections", "2")]) {
    expect(query.meta).toEqual({ persist: true });
  }
});

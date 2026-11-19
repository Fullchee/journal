import type { Href } from "expo-router";

import { ApiError } from "@/lib/api/errors";

/**
 * `text` is what search reads: more than the label, such as a Library Habit's prose. `depth` nests a Goal
 * under the Goal it serves.
 */
export interface NoteLink {
  href: Href;
  label: string;
  detail?: string;
  text: string;
  depth?: number;
}

export interface NoteSection {
  heading: string;
  links: NoteLink[];
}

/** Every word must appear, in any order and case, so "coach find" finds "Find a coach". */
export function searchSections(sections: NoteSection[], query: string): NoteSection[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);

  if (words.length === 0) return sections;

  const matches = ({ text }: NoteLink) => {
    const haystack = text.toLocaleLowerCase();

    return words.every((word) => haystack.includes(word));
  };

  return sections.flatMap((section) => {
    const links = section.links.filter((link) => matches(link));

    return links.length > 0 ? { ...section, links } : [];
  });
}

const PAYLOAD_TOO_LARGE = 413;
const CONFLICT = 409;

/** The API's only fixable write errors: a body over its size limit and a Goal title already taken. */
export function saveErrorMessage(error: Error | null) {
  if (error instanceof ApiError && error.status === PAYLOAD_TOO_LARGE)
    return "Too long to save (limit about 90 KB).";

  if (error instanceof ApiError && error.status === CONFLICT)
    return "Couldn't save. Check the title isn't already a goal.";

  return "Couldn't save. Your text is still here; try again.";
}

export const OFFLINE_EDIT = "Editing needs a connection.";

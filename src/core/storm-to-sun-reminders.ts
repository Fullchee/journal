import type { Zone } from "./check-in-view";

// Storm plans no day and Sun needs no prompts, so only these zones get reminders (issue #108).
const ZONES_WITH_REMINDERS = new Set<Zone>(["Rain", "Cloud"]);

/** The zone's "Reach for" list from the Storm to Sun Reference Habit's body, or "" when it has none. */
export function reminders(body: string, zone: Zone) {
  if (!ZONES_WITH_REMINDERS.has(zone)) return "";

  const lines = body.split("\n");

  const sectionStart = lines.findIndex((line) =>
    new RegExp(String.raw`^## .*\b${zone}\b`).test(line),
  );

  if (sectionStart === -1) return "";

  const nextSection = lines.findIndex(
    (line, index) => index > sectionStart && line.startsWith("## "),
  );

  const section = lines.slice(sectionStart + 1, nextSection === -1 ? lines.length : nextSection);
  const listStart = section.indexOf("### Reach for");

  if (listStart === -1) return "";

  const rest = section.slice(listStart + 1);
  const listEnd = rest.findIndex((line) => line.startsWith("#") || line === "---");

  return rest
    .slice(0, listEnd === -1 ? rest.length : listEnd)
    .join("\n")
    .trim();
}

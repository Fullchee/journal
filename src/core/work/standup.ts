// A Work day as the standup Markdown `/standup-obsidian-to-slack` posts (#13). It reads the note as written
// (`raw_md`): the rows drop each line's PR state, ✅ marks and section labels, so only the note round-trips.

import { headingLabel } from "@/core/work/weekly-note";

/** A `---` rule or a heading above `#####` ends a day's section; its next-day Plan and `#####` parts sit inside it. */
const SECTION_END = /^(?:---|#{1,4}\s)/u;

/** The day's `####` heading may say more after its label: `#### Mon, Oct 12 (Thanksgiving)`. */
const isHeadingOf = (line: string, label: string) =>
  line.startsWith(`#### ${label}`) && !/^\d/u.test(line.slice(label.length + 5));

/**
 * The body under a weekly note's `#### Ddd, Mon D` heading for `day`, trimmed, up to the next day, heading or rule.
 * Null when the note has no heading for that day or the body is empty.
 */
export function workDaySection(md: string, day: string) {
  const lines = md.split("\n");
  const label = headingLabel(day);
  const start = lines.findIndex((line) => isHeadingOf(line.trim(), label));

  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => SECTION_END.test(line.trim()));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();

  return body === "" ? null : body;
}

/** Slack's custom emoji for each PR state the note marks; 🟡 and ❌ have no shortcode, so they stay. */
const SHORTCODES = [
  ["🟣", ":merged:"],
  ["⚪", ":pr-draft:"],
  ["🟢", ":pr-open:"],
] as const;

/** A screenshot embed: `/standup-obsidian-to-slack` attaches the image instead of posting the line. */
const EMBED = /^\s*- (?:!\[\[[^\]]+\]\]|<img src="[^"]+"[^>]*>)\s*$/u;

/** Slack draws no checkboxes, so a Plan's open box becomes a plain bullet. */
const OPEN_BOX = /^(\s*)- \[ \] /u;

const standupLine = (line: string) =>
  SHORTCODES.reduce(
    (text, [emoji, code]) => text.replaceAll(emoji, () => code),
    line.replace(OPEN_BOX, "$1- "),
  );

/**
 * The standup for `day`: its bold label, a blank line, then the day's section with the next day's Plan, as
 * `/standup-obsidian-to-slack` edits it. Null when the note holds nothing for that day.
 */
export function standupMarkdown(md: string, day: string) {
  const body = workDaySection(md, day);

  if (body === null) return null;
  const lines = body.split("\n").filter((line) => !EMBED.test(line));

  return `**${headingLabel(day)}**\n\n${lines.map((line) => standupLine(line)).join("\n")}`;
}

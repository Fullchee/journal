import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { weekDays } from "@/core/weekly-review";
import { headingLabel } from "@/core/work/weekly-note";
import { standupMarkdown, workDaySection } from "@/core/work/standup";

const FIXTURES = path.join(__dirname, "fixtures/weekly-notes");

const fixture = (week: string) => readFileSync(path.join(FIXTURES, `${week}.md`), "utf8");

const normalized = (md: string) =>
  md
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

/** The vault's own cut: the lines after the day's heading, before the next `####` or higher heading or rule. */
function vaultSection(md: string, day: string) {
  const lines = md.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`#### ${headingLabel(day)}`));
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^(?:---|#{1,4} )/u.test(line));

  return normalized(rest.slice(0, end === -1 ? undefined : end).join("\n"));
}

const weeks = readdirSync(FIXTURES).map((file) => path.basename(file, ".md"));

describe("workDaySection", () => {
  it.each(weeks)("gives back every day of %s as the note holds it", (week) => {
    const md = fixture(week);
    const days = weekDays(week).filter((day) => md.includes(`#### ${headingLabel(day)}`));

    expect(days.length).toBeGreaterThan(0);

    for (const day of days) {
      const section = workDaySection(md, day);

      expect(normalized(section ?? "")).toBe(vaultSection(md, day));
    }
  });

  it("keeps a day's `#####` parts and ends at the next day", () => {
    const section = workDaySection(fixture("2026-W42"), "2026-10-13");

    expect(section).toMatch(/^##### Standup\n/u);
    expect(section).toMatch(/##### Other\n\n-$/u);
  });

  it("finds a heading that says more after the day", () => {
    const md = "#### Mon, Oct 12 (Thanksgiving)\n\n- off\n\n#### Tue, Oct 13\n";

    expect(workDaySection(md, "2026-10-12")).toBe("- off");
  });

  it("never takes Nov 20's heading for Nov 2", () => {
    expect(workDaySection("#### Fri, Nov 20\n\n- later\n", "2026-11-02")).toBeNull();
  });

  it("is null for an empty day", () => {
    expect(workDaySection("#### Mon, Nov 2\n\n---\n", "2026-11-02")).toBeNull();
  });
});

describe("standupMarkdown", () => {
  it("posts the day under its bold label, Plan boxes as bullets and PR states as Slack emoji", () => {
    expect(standupMarkdown(fixture("2026-W45"), "2026-11-02")).toBe(
      [
        "**Mon, Nov 2**",
        "",
        "- ✅ [APP-135](https://acme.atlassian.net/browse/APP-135): Plan the sync queue",
        "    - :merged: [web#182](https://github.com/Acme/acme-web/pull/182): Split the sync queue",
        "- [APP-136](https://acme.atlassian.net/browse/APP-136): Fix the build cache",
        "    - :pr-open: [web#185](https://github.com/Acme/acme-web/pull/185): Test the build cache",
        "- [APP-137](https://acme.atlassian.net/browse/APP-137): Tidy the build cache",
        "    - :pr-open: [web#186](https://github.com/Acme/acme-web/pull/186): Speed up the build cache",
        "- [APP-118](https://acme.atlassian.net/browse/APP-118): Document the build cache",
        "    - :pr-draft: [web#187](https://github.com/Acme/acme-web/pull/187): Rename the build cache",
        "",
        "**Meetings**",
        "",
        "- Review the build cache",
        "",
        "**Plan — Tue, Nov 3**",
        "",
        "- [APP-137](https://acme.atlassian.net/browse/APP-137): Tidy the build cache",
        "    - Add the build cache :pr-open: [web#186](https://github.com/Acme/acme-web/pull/186) Plan the build cache",
        "- [APP-129](https://acme.atlassian.net/browse/APP-129): Move the dark theme",
        "    - Move the API errors",
        "- [APP-136](https://acme.atlassian.net/browse/APP-136): Fix the build cache",
        "    - Add the build cache :pr-open: [web#185](https://github.com/Acme/acme-web/pull/185)",
        "- [APP-118](https://acme.atlassian.net/browse/APP-118): Document the build cache",
        "    - Split the build cache :pr-draft: [web#187](https://github.com/Acme/acme-web/pull/187) Cache the build cache",
      ].join("\n"),
    );
  });

  it("drops Obsidian image embeds too", () => {
    const md = "#### Mon, Nov 2\n\n- [ ] Ship it\n  - ![[shot.png|300]]\n";

    expect(standupMarkdown(md, "2026-11-02")).toBe("**Mon, Nov 2**\n\n- Ship it");
  });

  it("is null when the note holds nothing for the day", () => {
    expect(standupMarkdown(fixture("2026-W45"), "2026-11-07")).toBeNull();
  });
});

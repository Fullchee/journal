import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { emptyLinks, parseWeekLines } from "@/core/work/weekly-note";

// Invented notes shaped like work-log's weekly/ folder: `####` days from 2026-W39 on, `**Ddd, Mon D**` days before.
const FIXTURES = path.join(__dirname, "fixtures/weekly-notes");

const STRICT = readdirSync(FIXTURES)
  .map((file) => ({
    week: path.basename(file, ".md"),
    md: readFileSync(path.join(FIXTURES, file), "utf8"),
  }))
  .filter(({ week }) => week >= "2026-W39");

const parse = (week: string, md: string) => {
  const links = emptyLinks();

  return { ...parseWeekLines(week, md.split("\n"), links), links };
};

const review = (number: number) =>
  `- [web#${number}](https://github.com/Acme/acme-web/pull/${number}) (Ada): Tests`;

describe("a `####` weekly note", () => {
  test.each(STRICT)("$week parses its Ticket and PR bullets", ({ week, md }) => {
    const { parsed } = parse(week, md);

    assert.ok([...parsed.values()].some((line) => "entry" in line && line.entry.ticket !== null));
  });

  test("Ticket and PR bullets in a day's log parse into done tasks; other lines are left alone", () => {
    const md = [
      "- [APP-9](https://acme.atlassian.net/browse/APP-9): before any day",
      "#### Mon, Nov 2",
      "",
      "- ✅ [APP-101](https://acme.atlassian.net/browse/APP-101): Recipe list missing",
      "    - 🟣 [web#4165](https://github.com/Acme/acme-web/pull/4165): Backfill",
      "    - Scenario 3",
      "    - ⚪ [mobile-app#1](https://github.com/Acme/mobile-app/pull/1)",
      "- [APP-102](https://acme.atlassian.net/browse/APP-102)",
      "- 🟢 [web#4166](https://github.com/Acme/acme-web/pull/4166): Send every source",
      "    - ❌ [web#4167](https://github.com/Acme/acme-web/pull/4167): nested under a PR",
      "- ❌ [web#4168](https://github.com/Acme/acme-web/pull/4168): Abandoned",
      "- comment on [my epics](https://acme.atlassian.net/issues?filter=100)",
      "---",
      "- [APP-8](https://acme.atlassian.net/browse/APP-8): after the days",
    ].join("\n");

    const { parsed, days, links } = parse("2026-W45", md);

    assert.deepEqual(days.slice(0, 2), [null, "2026-11-02"]);
    assert.deepEqual(Object.fromEntries(parsed), {
      3: {
        entry: {
          day: "2026-11-02",
          kind: "task",
          text: "Recipe list missing",
          ticket: "APP-101",
          pr: null,
          done: true,
        },
      },
      4: {
        entry: {
          day: "2026-11-02",
          kind: "task",
          text: "Backfill",
          ticket: "APP-101",
          pr: "web#4165",
          done: true,
        },
      },
      6: {
        entry: {
          day: "2026-11-02",
          kind: "task",
          text: "",
          ticket: "APP-101",
          pr: "mobile-app#1",
          done: true,
        },
      },
      7: {
        entry: {
          day: "2026-11-02",
          kind: "task",
          text: "",
          ticket: "APP-102",
          pr: null,
          done: true,
        },
      },
      8: {
        entry: {
          day: "2026-11-02",
          kind: "task",
          text: "Send every source",
          ticket: null,
          pr: "web#4166",
          done: true,
        },
      },
      10: {
        entry: {
          day: "2026-11-02",
          kind: "task",
          text: "Abandoned",
          ticket: null,
          pr: "web#4168",
          done: true,
        },
      },
    });
    assert.deepEqual(links.pullRequests.get("web#4165"), {
      ref: "web#4165",
      repo: "web",
      number: 4165,
      url: "https://github.com/Acme/acme-web/pull/4165",
      title: "Backfill",
      ticket: "APP-101",
      state: "merged",
    });
    assert.equal(links.tickets.get("APP-101")?.title, "Recipe list missing");
  });

  test.each([
    [
      "a PR whose link text is not its URL's ref",
      "- 🟣 [#4165](https://github.com/Acme/acme-web/pull/4165): x",
    ],
    [
      "a PR with an unknown state",
      "- 🔵 [web#4165](https://github.com/Acme/acme-web/pull/4165): x",
    ],
    [
      "a PR indented at the top level",
      "    - 🟣 [web#4165](https://github.com/Acme/acme-web/pull/4165): x",
    ],
    [
      "a Ticket whose URL changed",
      "- [APP-1](https://a.atlassian.net/browse/APP-1): a\n- [APP-1](https://b.atlassian.net/browse/APP-1): b",
    ],
    [
      "a PR whose URL changed",
      "- 🟣 [web#1](https://github.com/Acme/acme-web/pull/1): a\n- 🟣 [web#1](https://github.com/acme/acme-web/pull/1): b",
    ],
  ])("%s is left for the extraction", (_, items) => {
    const md = `#### Mon, Nov 2\n\n${items}\n`;
    const lines = md.split("\n");
    const { parsed } = parse("2026-W45", md);

    assert.equal(parsed.has(lines.length - 2), false);
  });

  test("Code reviews parse in their section, once per PR and day; Meetings and Plan lines don't", () => {
    const md = [
      "#### Wed, Nov 4",
      "**Code reviews**",
      "",
      review(1),
      review(1),
      "- Reviewed Bruno's PR",
      review(2),
      "**Meetings**",
      "- [APP-1](https://acme.atlassian.net/browse/APP-1): standup",
      "**Plan — Thu, Nov 5**",
      "- [APP-2](https://acme.atlassian.net/browse/APP-2): planned",
      "#### Thu, Nov 5",
      review(1),
      "**Code reviews**",
      review(1),
    ].join("\n");

    const { parsed } = parse("2026-W45", md);

    assert.deepEqual(Object.fromEntries(parsed), {
      3: { review: { day: "2026-11-04", pr: "web#1", author: "Ada", title: "Tests" } },
      6: { review: { day: "2026-11-04", pr: "web#2", author: "Ada", title: "Tests" } },
      14: { review: { day: "2026-11-05", pr: "web#1", author: "Ada", title: "Tests" } },
    });
  });

  test.each([
    [
      "names a day outside the week",
      "#### Mon, Nov 9\n",
      '2026-W45 has no day for "#### Mon, Nov 9"',
    ],
    [
      "repeats a day",
      "#### Mon, Nov 2\n#### Mon, Nov 2\n",
      "2026-W45 has two headings for 2026-11-02",
    ],
  ])("a heading that %s throws", (_, md, message) => {
    assert.throws(() => parse("2026-W45", md), { message });
  });
});

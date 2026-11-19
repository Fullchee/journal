import assert from "node:assert/strict";
import { reminders } from "@/core/storm-to-sun-reminders";

const BODY = [
  "Intro.",
  "",
  "## 🌩 Storm — survive",
  "",
  "### Reach for",
  "",
  "- **Call someone** — the crisis line.",
  "",
  "---",
  "",
  "## 🌧 Rain — cope",
  "",
  "**Job:** Keep functioning.",
  "",
  "### Am I here?",
  "",
  "- [ ] Ran on willpower?",
  "",
  "### Reach for",
  "",
  "*Cope-level moves.*",
  "",
  "- **Contain the doom-scroll** — Leechblock.",
  "- **Protect the base** — bedtime meditation.",
  "",
  "### Climb up → ⛅ Cloud",
  "",
  "- [ ] Wanted to do something?",
  "",
  "---",
  "",
  "## ⛅ Cloud — heal-root",
  "",
  "### Reach for",
  "",
  "- **Root emotional work** — RAIN Meditation.",
  "- **Let in the good** — in the forest.",
  "",
  "## ☀️ Sun — thrive",
  "",
  "### Am I here?",
  "",
  "- [ ] Rested?",
  "",
  "## How progress works",
].join("\n");

test("Rain shows its Reach for list, intro included, and stops at the next heading", () => {
  assert.equal(
    reminders(BODY, "Rain"),
    [
      "*Cope-level moves.*",
      "",
      "- **Contain the doom-scroll** — Leechblock.",
      "- **Protect the base** — bedtime meditation.",
    ].join("\n"),
  );
});

test("Cloud shows its Reach for list and stops at the next zone", () => {
  assert.equal(
    reminders(BODY, "Cloud"),
    ["- **Root emotional work** — RAIN Meditation.", "- **Let in the good** — in the forest."].join(
      "\n",
    ),
  );
});

test("Storm and Sun show nothing, since only Rain and Cloud plan around reminders", () => {
  assert.equal(reminders(BODY, "Storm"), "");
  assert.equal(reminders(BODY, "Sun"), "");
});

test("the last section of the body shows its list to the end", () => {
  assert.equal(
    reminders("## ⛅ Cloud — heal-root\n\n### Reach for\n\n- **Walk**", "Cloud"),
    "- **Walk**",
  );
});

test("a zone section with no Reach for list shows nothing", () => {
  assert.equal(reminders(BODY.replace("### Reach for\n\n- **Root", "- **Root"), "Cloud"), "");
});

test("a missing zone section shows nothing", () => {
  assert.equal(reminders(BODY.replace("## 🌧 Rain — cope", "## Rainy"), "Rain"), "");
});

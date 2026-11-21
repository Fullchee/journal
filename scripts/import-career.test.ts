import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type TestContext, test } from "node:test";
import * as z from "zod/mini";

import {
  attachmentUrl,
  importCareer,
  readCareer,
  resolveImage,
  rewriteLinks,
  type Api,
} from "./import-career.ts";

const NewNote = z.object({ title: z.string(), body: z.string() });

const NoteBody = z.object({ body: z.string() });

const ATTACHMENT_LINK = /\]\((\/api\/attachments\/[^)]+)\)/g;

const IMAGES = [
  "stories/images/launch day.png",
  "stories/Acme/image.png",
  "interviewing/image.png",
  "skills/diagram.jpg",
];

const rewrite = (md: string) => rewriteLinks(md, "stories/Acme/Launch.md", IMAGES);

test("an attachment URL encodes each segment, keeping the slashes", () => {
  assert.equal(
    attachmentUrl("stories/images/launch day.png"),
    "/api/attachments/career/stories/images/launch%20day.png",
  );
});

test("an image resolves beside the note, then from career/, then by name nearest the note", () => {
  assert.equal(resolveImage("image.png", "stories/Acme", IMAGES), "stories/Acme/image.png");
  assert.equal(resolveImage("skills/diagram.jpg", "stories/Acme", IMAGES), "skills/diagram.jpg");
  assert.equal(resolveImage("image.png", "interviewing/deep", IMAGES), "interviewing/image.png");
  assert.equal(resolveImage("diagram.jpg", "stories", IMAGES), "skills/diagram.jpg");
  assert.equal(resolveImage("missing.png", "stories", IMAGES), null);
});

test("an Obsidian image embed becomes a Markdown image; a width is not alt text", () => {
  assert.deepEqual(rewrite("See ![[launch day.png|300]] and ![[image.png|Team photo]]"), {
    body: "See ![](/api/attachments/career/stories/images/launch%20day.png) and ![Team photo](/api/attachments/career/stories/Acme/image.png)",
    unresolved: [],
  });
});

test("an Obsidian link to an image becomes a Markdown link named by its file or alias", () => {
  assert.equal(
    rewrite("[[skills/diagram.jpg]] or [[diagram.jpg|the diagram]]").body,
    "[diagram.jpg](/api/attachments/career/skills/diagram.jpg) or [the diagram](/api/attachments/career/skills/diagram.jpg)",
  );
});

test("a relative Markdown image resolves from the note, encoded or in angle brackets", () => {
  const { body } = rewrite(
    '![a](../images/launch%20day.png "Launch") ![b](<../images/launch day.png>) [c](image.png)',
  );

  const url = "/api/attachments/career/stories/images/launch%20day.png";

  assert.equal(
    body,
    `![a](${url} "Launch") ![b](${url}) [c](/api/attachments/career/stories/Acme/image.png)`,
  );
});

test("an Obsidian note link becomes its alias, or its note's name", () => {
  assert.deepEqual(
    rewrite("See [[0 - Acme story|the story]], [[skills/Promotions]] and [[Summary#Launch]]."),
    {
      body: "See the story, Promotions and Summary#Launch.",
      unresolved: [],
    },
  );
});

test("an Obsidian embed of anything but an image stays as written and is reported", () => {
  const md = "![[Summary#Launch]] ![[Plan builder.canvas]] ![[chart.png#crop]]";

  assert.deepEqual(rewrite(md), {
    body: md,
    unresolved: [
      "stories/Acme/Launch.md: ![[Summary#Launch]]",
      "stories/Acme/Launch.md: ![[Plan builder.canvas]]",
      "stories/Acme/Launch.md: ![[chart.png#crop]]",
    ],
  });
});

test("Markdown links that are not vault images stay as written", () => {
  const md = [
    "![remote](https://example.com/a.png)",
    "![done](/api/attachments/career/a.png)",
    "[doc](notes.md)",
  ].join("\n");

  assert.deepEqual(rewrite(md), { body: md, unresolved: [] });
});

test("a link to an image the vault lacks stays as written and is reported", () => {
  assert.deepEqual(rewrite("![[gone.png|300]] ![x](bad%E0%A4%A.png)"), {
    body: "![[gone.png|300]] ![x](bad%E0%A4%A.png)",
    unresolved: [
      "stories/Acme/Launch.md: ![[gone.png|300]]",
      "stories/Acme/Launch.md: ![x](bad%E0%A4%A.png)",
    ],
  });
});

/** A work-log checkout holding `files`, by path under career/. */
function vault(t: TestContext, files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "career-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  for (const [file, text] of Object.entries(files)) {
    const full = path.join(root, "career", file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }

  return root;
}

const VAULT = {
  "Career.md": "# Career\n\n![[portrait.png|200]]\n",
  "stories/Launch.md": "Shipped it.\n\n![[image.png]]\n",
  "stories/images/image.png": "png-bytes",
  "portrait.png": "png-bytes",
  "stories/board.canvas": "{}",
};

test("readCareer reads every note and image, and skips other files", (t) => {
  const { notes, images, skipped } = readCareer(vault(t, VAULT));

  assert.deepEqual(
    notes.map(({ title }) => title),
    ["Career", "stories/Launch"],
  );
  assert.deepEqual(images, ["portrait.png", "stories/images/image.png"]);
  assert.deepEqual(skipped, ["stories/board.canvas"]);
});

interface Call {
  method: string;
  route: string;
  payload?: string | undefined;
}

/** An in-memory API: Career notes by id, and attachments by URL. */
function fakeApi() {
  const notes = new Map<number, { title: string; body: string }>();
  const attachments = new Map<string, string>();
  const calls: Call[] = [];

  const api: Api = (method, route, payload) => {
    calls.push({ method, route, payload });
    const id = Number(route.split("/").at(-1));

    if (route.startsWith("/api/attachments/")) {
      attachments.set(route, payload ?? "");

      return JSON.stringify({ url: route });
    }

    if (method === "GET" && route === "/api/notes/career") {
      return JSON.stringify({
        items: [...notes].map(([key, { title }]) => ({ id: key, title })),
      });
    }

    if (method === "GET") return JSON.stringify({ item: notes.get(id) });

    if (method === "POST") {
      notes.set(notes.size + 1, NewNote.parse(JSON.parse(payload ?? "")));

      return JSON.stringify({ id: notes.size });
    }

    const note = notes.get(id);
    assert.ok(note);
    note.body = NoteBody.parse(JSON.parse(payload ?? "")).body;

    return "{}";
  };

  return { api, notes, attachments, calls };
}

const run = (root: string, api: Api, mode: "import" | "dry-run" = "import") => {
  const lines: string[] = [];
  importCareer(root, mode, api, (line) => {
    lines.push(line);
  });

  return lines;
};

const writes = (calls: Call[]) =>
  calls.filter(({ method, route }) => method !== "GET" && route.startsWith("/api/notes"));

test("every career file gets one note row, and every image link resolves to an upload", (t) => {
  const root = vault(t, VAULT);
  const { api, notes, attachments } = fakeApi();

  const lines = run(root, api);

  assert.deepEqual(
    [...notes.values()].map(({ title }) => title),
    ["Career", "stories/Launch"],
  );
  assert.equal(
    attachments.get("/api/attachments/career/stories/images/image.png"),
    `@${path.join(root, "career", "stories/images/image.png")}`,
  );

  const links = [...notes.values()].flatMap(({ body }) =>
    [...body.matchAll(ATTACHMENT_LINK)].map(([, url = ""]) => url),
  );

  assert.equal(links.length, 2);

  for (const url of links) assert.ok(attachments.has(url), url);
  assert.deepEqual(lines, [
    "Skipped stories/board.canvas: neither a note nor an image",
    "Images: 2 uploaded.",
    "Career notes: 2 created, 0 updated, 0 unchanged.",
  ]);
});

test("a re-run is an idempotent upsert", (t) => {
  const root = vault(t, VAULT);
  const { api, notes, calls } = fakeApi();
  run(root, api);
  const before = structuredClone([...notes]);
  calls.length = 0;

  const lines = run(root, api);

  assert.deepEqual([...notes], before);
  assert.deepEqual(writes(calls), []);
  assert.equal(lines.at(-1), "Career notes: 0 created, 0 updated, 2 unchanged.");
});

test("a note edited in the vault replaces its body; a note gone from the vault is reported", (t) => {
  const root = vault(t, VAULT);
  const { api, notes } = fakeApi();
  run(root, api);
  notes.set(9, { title: "Retired", body: "" });
  writeFileSync(path.join(root, "career", "Career.md"), "# Career\n\nNew line\n");

  const lines = run(root, api);

  assert.equal(notes.get(1)?.body, "# Career\n\nNew line\n");
  assert.deepEqual(lines.slice(-2), [
    "Only in D1: Retired",
    "Career notes: 0 created, 1 updated, 1 unchanged.",
  ]);
});

test("an image link the vault can't resolve is printed", (t) => {
  const root = vault(t, { "Career.md": "![[gone.png]]" });

  assert.deepEqual(run(root, fakeApi().api, "dry-run"), [
    "Unresolved link in Career.md: ![[gone.png]]",
    "Career: 13 characters",
  ]);
});

test("a dry run prints the uploads and notes and calls nothing", (t) => {
  const { api, calls } = fakeApi();

  const lines = run(vault(t, VAULT), api, "dry-run");

  assert.deepEqual(calls, []);
  assert.deepEqual(lines, [
    "Skipped stories/board.canvas: neither a note nor an image",
    "PUT /api/attachments/career/portrait.png",
    "PUT /api/attachments/career/stories/images/image.png",
    "Career: 52 characters",
    "stories/Launch: 67 characters",
  ]);
});

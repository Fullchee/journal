// Imports work-log's career/ notes into D1 as Career notes, and their images into R2 under career/, as the owner.
// Usage: node scripts/import-career.ts <work-log path> [--dry-run]
//   --dry-run  prints what it would send
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as z from "zod/mini";

/** Sends one request and returns the response body's JSON text; `payload` is JSON, or `@<file>` for raw bytes. */
export type Api = (method: "GET" | "POST" | "PUT", route: string, payload?: string) => string;

/** The image types /api/attachments stores under career/. */
const IMAGE = /\.(?:png|jpe?g|gif|webp)$/i;

const NOTE = /\.md$/;

// A URL with a scheme, or one already rooted at the API, is never a vault file.
const NOT_A_VAULT_PATH = /^(?:[a-z][a-z\d+.-]*:|\/)/i;

/** An Obsidian link, `[[target|alias]]`, embedded when it starts with `!`. */
const WIKI_LINK = /!?\[\[[^[\]\n]+\]\]/g;

/** A Markdown link or image, `[text](target "title")`; the target may sit in angle brackets. */
const MARKDOWN_LINK = /!?\[[^[\]\n]*\]\([^()\n]+\)/g;

const WIDTH = /^\d+(?:x\d+)?$/;

export interface CareerNote {
  title: string;
  body: string;
  unresolved: string[];
}

export interface Career {
  notes: CareerNote[];
  images: string[];
  skipped: string[];
}

/** Where /api/attachments serves a career/ image, each segment percent-encoded so spaces survive Markdown. */
export const attachmentUrl = (image: string) => {
  const segments = image.split("/").map((segment) => encodeURIComponent(segment));

  return `/api/attachments/career/${segments.join("/")}`;
};

const decoded = (target: string) => {
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
};

const sharedPrefix = (a: string, b: string) => {
  let length = 0;

  while (length < a.length && a[length] === b[length]) length += 1;

  return length;
};

/**
 * Finds a link's image the way Obsidian does: beside the note, then from the career/ root, then by file name
 * anywhere, preferring the copy nearest the note when several share the name.
 */
export function resolveImage(target: string, noteDir: string, images: string[]): string | null {
  const known = new Set(images);

  const direct = [path.posix.join(noteDir, target), path.posix.normalize(target)].find(
    (candidate) => known.has(candidate),
  );

  if (direct !== undefined) return direct;

  let nearest: string | null = null;

  for (const image of images) {
    const closer =
      nearest === null || sharedPrefix(image, noteDir) > sharedPrefix(nearest, noteDir);

    if (closer && image.endsWith(`/${target}`)) nearest = image;
  }

  return nearest;
}

/** `[[target|alias]]` split into its parts; a `#` heading in the target makes it a note link, never an image. */
function wikiParts(link: string) {
  const embedded = link.startsWith("!");
  const inner = link.slice(embedded ? 3 : 2, -2);
  const bar = inner.indexOf("|");
  const target = (bar === -1 ? inner : inner.slice(0, bar)).trim();
  const alias = bar === -1 ? "" : inner.slice(bar + 1);

  return { embedded, target, text: WIDTH.test(alias) ? "" : alias };
}

/** `[text](target "title")` split into its parts, with the target decoded and out of any angle brackets. */
function markdownParts(link: string) {
  const embedded = link.startsWith("!");
  const close = link.indexOf("](");
  const text = link.slice(embedded ? 2 : 1, close);
  const inside = link.slice(close + 2, -1).trim();
  const angled = inside.startsWith("<") ? inside.indexOf(">") : -1;
  const space = inside.indexOf(" ");
  const bareEnd = space === -1 ? inside.length : space;
  const end = angled === -1 ? bareEnd : angled + 1;
  const raw = inside.slice(0, end).replaceAll(/^<|>$/g, "");

  return { embedded, text, target: decoded(raw), title: inside.slice(end) };
}

/**
 * Points each image link at its attachment URL and turns each note link into its text. A link to an image the
 * vault lacks, and an embed of anything but an image, stays as written and is reported.
 */
export function rewriteLinks(md: string, notePath: string, images: string[]) {
  const noteDir = path.posix.dirname(notePath);
  const unresolved: string[] = [];

  const urlFor = (link: string, target: string) => {
    const image = resolveImage(target, noteDir, images);

    if (image === null) unresolved.push(`${notePath}: ${link}`);

    return image === null ? null : attachmentUrl(image);
  };

  const fromWikiImage = (link: string, embedded: boolean, target: string, text: string) => {
    const url = urlFor(link, target);

    if (url === null) return link;

    if (embedded) return `![${text}](${url})`;

    return `[${text === "" ? path.posix.basename(target) : text}](${url})`;
  };

  // The app renders no wiki links, so a note link keeps only its words and an embed of a skipped file is reported.
  const fromWiki = (link: string) => {
    const { embedded, target, text } = wikiParts(link);

    if (IMAGE.test(target) && !target.includes("#"))
      return fromWikiImage(link, embedded, target, text);

    if (!embedded) return text === "" ? path.posix.basename(target) : text;

    unresolved.push(`${notePath}: ${link}`);

    return link;
  };

  const fromMarkdown = (link: string) => {
    const { embedded, text, target, title } = markdownParts(link);
    const isVaultImage = IMAGE.test(target) && !NOT_A_VAULT_PATH.test(target);
    const url = isVaultImage ? urlFor(link, target) : null;

    const bang = embedded ? "!" : "";

    return url === null ? link : `${bang}[${text}](${url}${title})`;
  };

  const body = md
    .replaceAll(WIKI_LINK, (link) => fromWiki(link))
    .replaceAll(MARKDOWN_LINK, (link) => fromMarkdown(link));

  return { body, unresolved };
}

/** Reads every note and image under `<root>/career`; anything else is skipped. Paths are relative to career/. */
export function readCareer(root: string): Career {
  const folder = path.join(root, "career");
  const entries = readdirSync(folder, { recursive: true, encoding: "utf8" });

  const files = entries
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => statSync(path.join(folder, file)).isFile());

  files.sort((a, b) => a.localeCompare(b));

  const images = files.filter((file) => IMAGE.test(file));

  const readNote = (file: string): CareerNote => {
    const md = readFileSync(path.join(folder, file), "utf8");

    return { title: file.replace(NOTE, ""), ...rewriteLinks(md, file, images) };
  };

  const notes = files.filter((file) => file.endsWith(".md")).map((file) => readNote(file));
  const skipped = files.filter((file) => !IMAGE.test(file) && !file.endsWith(".md"));

  return { notes, images, skipped };
}

const ListedNote = z.object({ id: z.int(), title: z.string() });

const Listed = z.object({ items: z.array(ListedNote) });

const Detail = z.object({ item: z.object({ body: z.string() }) });

function storedBody(api: Api, id: number) {
  const text = api("GET", `/api/notes/career/${id}`);

  return Detail.parse(JSON.parse(text)).item.body;
}

/** Creates each missing note and saves each changed body, so a re-run sends nothing new. */
function upsertNotes(notes: CareerNote[], api: Api, print: (line: string) => void) {
  const { items } = Listed.parse(JSON.parse(api("GET", "/api/notes/career")));
  const stored = new Map(items.map(({ id, title }) => [title, id]));
  const counts = { created: 0, updated: 0, unchanged: 0 };

  for (const { title, body } of notes) {
    const id = stored.get(title);
    stored.delete(title);

    if (id === undefined) {
      api("POST", "/api/notes/career", JSON.stringify({ title, body }));
      counts.created += 1;
    } else if (storedBody(api, id) === body) {
      counts.unchanged += 1;
    } else {
      api("PUT", `/api/notes/career/${id}`, JSON.stringify({ body }));
      counts.updated += 1;
    }
  }

  for (const title of stored.keys()) print(`Only in D1: ${title}`);
  print(
    `Career notes: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged.`,
  );
}

export function importCareer(
  root: string,
  mode: "import" | "dry-run",
  api: Api,
  print: (line: string) => void,
) {
  const { notes, images, skipped } = readCareer(root);
  const folder = path.join(root, "career");
  const unresolved = notes.flatMap((note) => note.unresolved);

  for (const file of skipped) print(`Skipped ${file}: neither a note nor an image`);

  for (const line of unresolved) print(`Unresolved link in ${line}`);

  if (mode === "dry-run") {
    for (const image of images) print(`PUT ${attachmentUrl(image)}`);

    for (const { title, body } of notes) print(`${title}: ${body.length} characters`);

    return;
  }

  // Images first, so no saved note links to an image R2 lacks.
  for (const image of images) api("PUT", attachmentUrl(image), `@${path.join(folder, image)}`);
  print(`Images: ${images.length} uploaded.`);
  upsertNotes(notes, api, print);
}

const API_SCRIPT = path.join(
  import.meta.dirname,
  "../.claude/skills/journal/scripts/journal-api.sh",
);

/** Calls the live API through the journal skill's script, which logs in through Cloudflare Access. */
const journalApi: Api = (method, route, payload) => {
  const args = [method, route, ...(payload === undefined ? [] : [payload])];

  const result = spawnSync(API_SCRIPT, args, {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });

  if (result.status !== 0) throw new Error(`${method} ${route} failed:\n${result.stdout}`);

  // The script prints `HTTP <status>` above the JSON payload.
  return result.stdout.slice(result.stdout.indexOf("\n") + 1);
};

const Args = z.tuple([z.string(), z.optional(z.literal("--dry-run"))]);

if (import.meta.main) {
  const args = Args.safeParse(process.argv.slice(2));

  if (!args.success)
    throw new Error("Usage: node scripts/import-career.ts <work-log path> [--dry-run]");

  const [root, flag] = args.data;

  importCareer(root, flag === undefined ? "import" : "dry-run", journalApi, (line) =>
    process.stdout.write(`${line}\n`),
  );
}

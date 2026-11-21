import assert from "node:assert/strict";
import type { Env } from "@worker/lib/env";
import { onRequestGet, onRequestPost, onRequestPut } from "@worker/api/attachments";
import { accessHeaders, makeEnv, OWNER } from "./helpers/env";

const ETAG = '"abc"';

interface Put {
  key: string;
  bytes: ArrayBuffer;
  contentType: string;
}

const bucket = (objects: Record<string, string>, puts: Put[] = []): Env["ATTACHMENTS"] => ({
  put: (key, bytes, options) => {
    puts.push({ key, bytes, contentType: options.httpMetadata.contentType });
    objects[key] = new TextDecoder().decode(bytes);

    return Promise.resolve();
  },
  get: (key, options) => {
    const content = objects[key];

    if (content === undefined) return Promise.resolve(null);
    const meta = { httpEtag: ETAG, httpMetadata: { contentType: "image/png" } };

    return Promise.resolve(
      options?.onlyIf.get("if-none-match") === ETAG
        ? meta
        : { ...meta, body: new Blob([content]).stream() },
    );
  },
});

const get = (
  path: string[],
  {
    email = OWNER,
    objects = {},
    ifNoneMatch,
  }: { email?: string | null; objects?: Record<string, string>; ifNoneMatch?: string } = {},
) => {
  const headers = accessHeaders(email);

  if (ifNoneMatch !== undefined) headers["if-none-match"] = ifNoneMatch;

  return onRequestGet({
    env: { ...makeEnv(), ATTACHMENTS: bucket(objects) },
    params: { path },
    request: new Request(`https://x/api/attachments/${path.join("/")}`, { headers }),
  });
};

test("an attachment streams from R2 with its content type", async () => {
  const res = await get(["Wind down", "Untitled.png"], {
    objects: { "Wind down/Untitled.png": "png-bytes" },
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(await res.text(), "png-bytes");
});

test("an attachment is revalidated by ETag, not cached blindly", async () => {
  const res = await get(["a.png"], { objects: { "a.png": "x" } });

  assert.equal(res.headers.get("etag"), ETAG);
  assert.equal(res.headers.get("cache-control"), "private, no-cache");
});

test("an unchanged attachment is a 304 with no body", async () => {
  const res = await get(["a.png"], { objects: { "a.png": "x" }, ifNoneMatch: ETAG });

  assert.equal(res.status, 304);
  assert.equal(res.headers.get("etag"), ETAG);
  assert.equal(await res.text(), "");
});

test("a missing attachment is a 404", async () => {
  assert.equal((await get(["nope.png"])).status, 404);
});

test("a request that bypassed Access is refused", async () => {
  assert.equal((await get(["a.png"], { email: null, objects: { "a.png": "x" } })).status, 401);
});

test("a path that climbs out of its folder is refused", async () => {
  assert.equal((await get(["..", "secret"], { objects: { "../secret": "x" } })).status, 400);
});

const post = (
  folder: string,
  {
    email = OWNER,
    type = "image/png",
    body = "png-bytes",
    objects = {},
    puts = [],
    contentLength,
  }: {
    email?: string | null;
    type?: string;
    body?: BodyInit;
    objects?: Record<string, string>;
    puts?: Put[];
    contentLength?: string;
  } = {},
) => {
  const headers = new Headers({ ...accessHeaders(email), "content-type": type });

  if (contentLength !== undefined) headers.set("content-length", contentLength);

  return onRequestPost({
    env: { ...makeEnv(), ATTACHMENTS: bucket(objects, puts) },
    params: { path: [folder] },
    request: new Request(`https://x/api/attachments/${folder}`, {
      method: "POST",
      headers,
      body,
    }),
  });
};

const urlOf = async (res: Response) => {
  const body: { url: string } = await res.json();

  return body.url;
};

test("an owner upload is stored under habits/<uuid>.png and returns its url", async () => {
  const puts: Put[] = [];
  const res = await post("habits", { puts });
  const url = await urlOf(res);

  assert.equal(res.status, 201);
  assert.match(url, /^\/api\/attachments\/habits\/[0-9a-f-]{36}\.png$/);
  assert.equal(puts[0]!.key, url.replace("/api/attachments/", ""));
  assert.equal(puts[0]!.contentType, "image/png");
  assert.equal(new TextDecoder().decode(puts[0]?.bytes), "png-bytes");
});

for (const { type, ext } of [
  { type: "image/jpeg", ext: "jpg" },
  { type: "image/gif", ext: "gif" },
  { type: "image/webp", ext: "webp" },
]) {
  test(`a ${type} upload gets a .${ext} key`, async () => {
    const url = await urlOf(await post("habits", { type }));

    assert.ok(url.endsWith(`.${ext}`), url);
  });
}

test("an upload from a non-owner is refused", async () => {
  assert.equal((await post("habits", { email: "other@example.com" })).status, 403);
});

test("an upload that bypassed Access is refused", async () => {
  assert.equal((await post("habits", { email: null })).status, 401);
});

test("an upload to an unknown folder is a 400", async () => {
  assert.equal((await post("notes")).status, 400);
});

test("a request with no path is not found", async () => {
  const res = await onRequestGet({
    env: { ...makeEnv(), ATTACHMENTS: bucket({}) },
    params: {},
    request: new Request("https://x/api/attachments", { headers: accessHeaders(OWNER) }),
  });

  assert.equal(res.status, 404);
});

test("an object without stored metadata streams as octet-stream", async () => {
  const res = await onRequestGet({
    env: {
      ...makeEnv(),
      ATTACHMENTS: {
        ...bucket({}),
        get: () => Promise.resolve({ httpEtag: ETAG, body: new Blob(["x"]).stream() }),
      },
    },
    params: { path: ["a.bin"] },
    request: new Request("https://x/api/attachments/a.bin", { headers: accessHeaders(OWNER) }),
  });

  assert.equal(res.headers.get("content-type"), "application/octet-stream");
});

test("an upload without a content type is a 415", async () => {
  const res = await onRequestPost({
    env: { ...makeEnv(), ATTACHMENTS: bucket({}) },
    params: { path: ["habits"] },
    request: new Request("https://x/api/attachments/habits", {
      method: "POST",
      headers: accessHeaders(OWNER),
    }),
  });

  assert.equal(res.status, 415);
});

test("an upload that is not an image is a 415", async () => {
  assert.equal((await post("habits", { type: "text/html" })).status, 415);
});

const TOO_LARGE = new Uint8Array(10 * 1024 * 1024 + 1);

test("an upload over 10 MB is a 413", async () => {
  assert.equal((await post("habits", { body: new Blob([TOO_LARGE]) })).status, 413);
});

test("an upload declaring over 10 MB is a 413 before the body is read", async () => {
  assert.equal((await post("habits", { contentLength: String(10 * 1024 * 1024 + 1) })).status, 413);
});

test("an uploaded url round-trips through the GET handler", async () => {
  const objects: Record<string, string> = {};
  const url = await urlOf(await post("habits", { objects }));
  const res = await get(url.replace("/api/attachments/", "").split("/"), { objects });

  assert.equal(await res.text(), "png-bytes");
});

test("an encoded path is read from its decoded key", async () => {
  const res = await get(["Wind%20down", "Untitled.png"], {
    objects: { "Wind down/Untitled.png": "png-bytes" },
  });

  assert.equal(await res.text(), "png-bytes");
});

test("an encoded segment that climbs out of its folder is refused", async () => {
  assert.equal((await get(["%2E%2E", "secret"], { objects: { "../secret": "x" } })).status, 400);
});

test("an encoded slash inside a segment is refused", async () => {
  assert.equal((await get(["a%2Fb.png"], { objects: { "a/b.png": "x" } })).status, 400);
});

test("a malformed escape is refused", async () => {
  assert.equal((await get(["%E0%A4%A.png"])).status, 400);
});

const putCareer = (
  path: string[],
  {
    email = OWNER,
    body = "png-bytes",
    objects = {},
    puts = [],
  }: {
    email?: string | null;
    body?: BodyInit;
    objects?: Record<string, string>;
    puts?: Put[];
  } = {},
) =>
  onRequestPut({
    env: { ...makeEnv(), ATTACHMENTS: bucket(objects, puts) },
    params: { path },
    request: new Request(`https://x/api/attachments/${path.join("/")}`, {
      method: "PUT",
      headers: { ...accessHeaders(email), "content-type": "application/json" },
      body,
    }),
  });

test("a career image is stored at its own path, typed by its extension", async () => {
  const puts: Put[] = [];
  const res = await putCareer(["career", "stories", "Launch%20day.PNG"], { puts });

  assert.equal(res.status, 200);
  assert.equal(await urlOf(res), "/api/attachments/career/stories/Launch%20day.PNG");
  assert.deepEqual(
    puts.map(({ key, contentType }) => ({ key, contentType })),
    [{ key: "career/stories/Launch day.PNG", contentType: "image/png" }],
  );
});

test("putting a career image again overwrites the same key", async () => {
  const objects: Record<string, string> = {};
  await putCareer(["career", "a.jpg"], { objects, body: "old" });
  await putCareer(["career", "a.jpg"], { objects, body: "new" });

  assert.deepEqual(objects, { "career/a.jpg": "new" });
});

for (const { ext, type } of [
  { ext: "jpeg", type: "image/jpeg" },
  { ext: "gif", type: "image/gif" },
  { ext: "webp", type: "image/webp" },
]) {
  test(`a career .${ext} is stored as ${type}`, async () => {
    const puts: Put[] = [];
    await putCareer(["career", `a.${ext}`], { puts });

    assert.equal(puts[0]?.contentType, type);
  });
}

test("a put outside career/ is refused", async () => {
  assert.equal((await putCareer(["habits", "a.png"])).status, 400);
  assert.equal((await putCareer(["career"])).status, 400);
  assert.equal((await putCareer(["career", "..", "a.png"])).status, 400);
});

test("a career file that is not an image is a 415", async () => {
  assert.equal((await putCareer(["career", "review.html"])).status, 415);
});

test("a career image over 10 MB is a 413", async () => {
  assert.equal((await putCareer(["career", "a.png"], { body: new Blob([TOO_LARGE]) })).status, 413);
});

test("a career put from a non-owner is refused", async () => {
  assert.equal((await putCareer(["career", "a.png"], { email: "other@example.com" })).status, 403);
});

test("a career put that bypassed Access is refused", async () => {
  assert.equal((await putCareer(["career", "a.png"], { email: null })).status, 401);
});

test("a put career image round-trips through the GET handler", async () => {
  const objects: Record<string, string> = {};
  const url = await urlOf(await putCareer(["career", "My%20photo.png"], { objects }));
  const res = await get(url.replace("/api/attachments/", "").split("/"), { objects });

  assert.equal(await res.text(), "png-bytes");
});

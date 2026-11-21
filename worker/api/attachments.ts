import { authorize } from "@worker/lib/auth";
import { json } from "@worker/lib/json";
import type { PagesContext } from "@worker/lib/env";

const decodeSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

// The router passes the URL's segments still percent-encoded; R2 keys hold the decoded names, spaces and all.
// Null when a segment is malformed or would climb out of the folder.
function keyOf(params: PagesContext<"path">["params"]) {
  const segments = [params.path ?? []].flat().map((segment) => decodeSegment(segment));

  return segments.some((s) => s === null || s === ".." || s === "." || s.includes("/"))
    ? null
    : segments.join("/");
}

/** Tool notes embed images and PDFs as /api/attachments/<folder>/<file>; the bytes live in R2 under "<folder>/<file>". */
export async function onRequestGet({ request, env, params }: PagesContext<"path">) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const key = keyOf(params);

  if (key === null) return new Response("bad path", { status: 400 });
  const object = await env.ATTACHMENTS.get(key, { onlyIf: request.headers });

  if (!object) return new Response("not found", { status: 404 });

  // A key can be re-uploaded with new bytes, so the browser revalidates by ETag instead of caching blindly.
  const headers = {
    "cache-control": "private, no-cache",
    "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
    etag: object.httpEtag,
  };

  return new Response(object.body ?? null, { status: object.body ? 200 : 304, headers });
}

const IMAGE_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The request's bytes, or null when they are over the upload limit. */
async function uploadBytes(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES) return null;
  const bytes = await request.arrayBuffer();

  return bytes.byteLength > MAX_UPLOAD_BYTES ? null : bytes;
}

/** Only habit images upload for now; the key is a fresh UUID so an upload never overwrites an object. */
export async function onRequestPost({ request, env, params }: PagesContext<"path">) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;

  if (keyOf(params) !== "habits") return new Response("bad folder", { status: 400 });
  const contentType = request.headers.get("content-type") ?? "";
  const extension = IMAGE_EXTENSIONS.get(contentType);

  if (extension === undefined) return new Response("unsupported type", { status: 415 });
  const bytes = await uploadBytes(request);

  if (bytes === null) return new Response("too large", { status: 413 });
  const key = `habits/${crypto.randomUUID()}.${extension}`;

  await env.ATTACHMENTS.put(key, bytes, { httpMetadata: { contentType } });

  return json({ url: `/api/attachments/${key}` }, 201);
}

const CONTENT_TYPES = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
]);

const extensionOf = (key: string) => key.slice(key.lastIndexOf(".") + 1).toLowerCase();

/**
 * The career import puts each vault image at its own path under career/, so a re-run overwrites the same key.
 * The extension sets the stored type: the import's client labels every body as JSON.
 */
export async function onRequestPut({ request, env, params }: PagesContext<"path">) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const key = keyOf(params);

  if (key === null || !key.startsWith("career/")) return new Response("bad path", { status: 400 });
  const contentType = CONTENT_TYPES.get(extensionOf(key));

  if (contentType === undefined) return new Response("unsupported type", { status: 415 });
  const bytes = await uploadBytes(request);

  if (bytes === null) return new Response("too large", { status: 413 });

  await env.ATTACHMENTS.put(key, bytes, { httpMetadata: { contentType } });

  const url = key.split("/").map((segment) => encodeURIComponent(segment));

  return json({ url: `/api/attachments/${url.join("/")}` });
}

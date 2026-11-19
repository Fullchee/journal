import { authorize } from "@worker/lib/auth";
import { json } from "@worker/lib/json";
import type { PagesContext } from "@worker/lib/env";

// Null when a segment would climb out of the folder.
function keyOf(params: PagesContext<"path">["params"]) {
  const segments = [params.path ?? []].flat();

  return segments.some((s) => s === ".." || s === ".") ? null : segments.join("/");
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

/** Only habit images upload for now; the key is a fresh UUID so an upload never overwrites an object. */
export async function onRequestPost({ request, env, params }: PagesContext<"path">) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;

  if (keyOf(params) !== "habits") return new Response("bad folder", { status: 400 });
  const contentType = request.headers.get("content-type") ?? "";
  const extension = IMAGE_EXTENSIONS.get(contentType);

  if (extension === undefined) return new Response("unsupported type", { status: 415 });

  if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES)
    return new Response("too large", { status: 413 });
  const bytes = await request.arrayBuffer();

  if (bytes.byteLength > MAX_UPLOAD_BYTES) return new Response("too large", { status: 413 });
  const key = `habits/${crypto.randomUUID()}.${extension}`;

  await env.ATTACHMENTS.put(key, bytes, { httpMetadata: { contentType } });

  return json({ url: `/api/attachments/${key}` }, 201);
}

import * as z from "zod/mini";
import type { Env, Viewer } from "./env";
import { expectJson, json, readJson } from "./json";

// Access signs this JWT on every request it lets through; without a valid one the request bypassed Access, so fail closed.
const JWT_HEADER = "Cf-Access-Jwt-Assertion";

const JwtHeader = z.object({ alg: z.string(), kid: z.string() });

// A user's token carries `email`; a service token's carries `common_name` (its client id) instead.
const Audience = z.union([z.string(), z.array(z.string())]);

const AccessClaims = z.object({
  email: z.optional(z.string()),
  common_name: z.optional(z.string()),
  iss: z.optional(z.string()),
  aud: z.optional(Audience),
  exp: z.optional(z.number()),
});

type AccessClaims = z.infer<typeof AccessClaims>;

const KeyId = z.object({ kid: z.string() });

// importKey checks the rest of each JWK.
const AccessCerts = z.object({
  keys: z.array(z.custom<JsonWebKey & { kid: string }>((key) => KeyId.safeParse(key).success)),
});

interface ParsedJwt {
  alg: string;
  kid: string;
  claims: AccessClaims;
  signed: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
}

const base64urlBytes = (part: string) =>
  Uint8Array.from(atob(part.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    Number(c.codePointAt(0)),
  );

const decodePart = <Schema extends z.ZodMiniType>(
  part: string,
  schema: Schema,
): z.infer<Schema> => {
  const text = new TextDecoder().decode(base64urlBytes(part));

  return schema.parse(JSON.parse(text));
};

function parseJwt(token: string): ParsedJwt | null {
  const [header, payload, signature, ...extra] = token.split(".");

  if (header === undefined || payload === undefined || signature === undefined || extra.length > 0)
    return null;

  try {
    const { alg, kid } = decodePart(header, JwtHeader);

    return {
      alg,
      kid,
      claims: decodePart(payload, AccessClaims),
      signed: new TextEncoder().encode(`${header}.${payload}`),
      signature: base64urlBytes(signature),
    };
  } catch {
    return null;
  }
}

type SigningKeys = Map<string, CryptoKey>;

const RS256 = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
const keySets = new Map<string, Promise<SigningKeys>>();

async function fetchSigningKeys(teamDomain: string): Promise<SigningKeys> {
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);

  if (!response.ok) throw new Error(`Access certs returned HTTP ${response.status}`);
  const { keys } = await expectJson(response, AccessCerts);

  const entries = await Promise.all(
    keys.map(
      async (jwk) =>
        [jwk.kid, await crypto.subtle.importKey("jwk", jwk, RS256, false, ["verify"])] as const,
    ),
  );

  return new Map(entries);
}

async function forgetOnFailure(teamDomain: string, keys: Promise<SigningKeys>) {
  try {
    await keys;
  } catch {
    keySets.delete(teamDomain);
  }
}

function signingKeys(teamDomain: string, refresh: boolean) {
  const cached = keySets.get(teamDomain);

  if (cached && !refresh) return cached;
  const keys = fetchSigningKeys(teamDomain);
  keySets.set(teamDomain, keys);
  // A failed fetch must not stay cached, or every later request would fail too.
  void forgetOnFailure(teamDomain, keys);

  return keys;
}

// Access rotates its signing keys, so a kid missing from the cached set triggers one refetch.
async function signingKey(teamDomain: string, kid: string) {
  const cached = await signingKeys(teamDomain, false);
  const key = cached.get(kid);

  if (key) return key;
  const refreshed = await signingKeys(teamDomain, true);

  return refreshed.get(kid) ?? null;
}

const isLive = (exp: number | undefined) => exp !== undefined && exp * 1000 > Date.now();

async function verifiedClaims(token: string, env: Env): Promise<AccessClaims | null> {
  const jwt = parseJwt(token);

  if (jwt?.alg !== "RS256") return null;
  const { iss, aud, exp } = jwt.claims;
  const audiences = Array.isArray(aud) ? aud : [aud];
  const trusted = new Set(env.POLICY_AUD.split(",").map((tag) => tag.trim()));
  const isTrusted = audiences.some((tag) => tag !== undefined && tag !== "" && trusted.has(tag));

  if (!isTrusted || iss !== `https://${env.TEAM_DOMAIN}` || !isLive(exp)) return null;
  const key = await signingKey(env.TEAM_DOMAIN, jwt.kid);

  return key && (await crypto.subtle.verify(RS256, key, jwt.signature, jwt.signed))
    ? jwt.claims
    : null;
}

async function accessClaims(request: Request, env: Env): Promise<AccessClaims | null> {
  const token = request.headers.get(JWT_HEADER);

  // DEV_EMAIL exists only in the git-ignored .dev.vars, so production still fails closed.
  if (token === null || token === "")
    return env.DEV_EMAIL === undefined ? null : { email: env.DEV_EMAIL };

  return verifiedClaims(token, env);
}

// Access admits any email with a one-time PIN, so the API lets in only the owner.
function viewerOf(claims: AccessClaims | null, env: Env): Response | Viewer {
  const email = claims?.email;

  if (email === undefined || email === "") return json({ error: "unauthenticated" }, 401);

  return email.toLowerCase() === env.OWNER_EMAIL.toLowerCase()
    ? { email }
    : json({ error: "forbidden" }, 403);
}

export async function authorize(request: Request, env: Env): Promise<Response | Viewer> {
  return viewerOf(await accessClaims(request, env), env);
}

/** Like authorize, but a machine caller (a GitHub Action) may write with an Access service token; the Access policy decides which tokens get in. */
export async function authorizeWriter(request: Request, env: Env): Promise<Response | Viewer> {
  const claims = await accessClaims(request, env);
  const serviceToken = claims?.common_name;

  return serviceToken === undefined || serviceToken === ""
    ? viewerOf(claims, env)
    : { email: null };
}

/** Authorizes with `auth`, then parses the body with `schema`; either failure is the Response to send, a bad body a 400 with `invalid`. */
export async function authorizedBody<Schema extends z.ZodMiniType>(
  { request, env }: { request: Request; env: Env },
  schema: Schema,
  invalid: string,
  auth = authorize,
): Promise<Response | z.infer<Schema>> {
  const viewer = await auth(request, env);

  if (viewer instanceof Response) return viewer;
  const body = await readJson(request, schema);

  return body ?? json({ error: invalid }, 400);
}

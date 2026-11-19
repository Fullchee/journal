import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import type { Env, Json } from "@worker/lib/env";
import { makeD1 } from "./d1";
import { urlOf } from "./fetch";

export const OWNER = "me@example.com";
export const STRANGER = "stranger@example.com";

/** Only the attachments tests read R2, so every other test gets an empty bucket. */
export const makeEnv = (): Env => ({
  OWNER_EMAIL: OWNER,
  TEAM_DOMAIN,
  POLICY_AUD,
  TODOIST_TOKEN: "test-todoist-token",
  DB: makeD1(),
  AI: { run: () => Promise.resolve({ response: "" }) },
  ATTACHMENTS: { get: () => Promise.resolve(null), put: () => Promise.resolve() },
});

export const TEAM_DOMAIN = "test.cloudflareaccess.com";
export const POLICY_AUD = "test-aud";
export const ACCESS_KID = "test-kid";

const accessKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const certsUrl = `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`;
const certs = { keys: [{ ...accessKey.publicKey.export({ format: "jwk" }), kid: ACCESS_KID }] };
const realFetch = fetch;

// auth.ts fetches Access's signing keys over the network; every suite that builds a request needs the test key served.
// oxlint-disable-next-line unicorn-js/no-top-level-side-effects, unicorn-js/no-global-object-property-assignment -- see above
globalThis.fetch = (input, init) =>
  urlOf(input) === certsUrl ? Promise.resolve(Response.json(certs)) : realFetch(input, init);

const base64url = (value: Json) => Buffer.from(JSON.stringify(value)).toString("base64url");

interface SignOptions {
  header?: Json;
  key?: KeyObject;
}

/** Signs any header and claims, so tests can build forged or malformed tokens too. */
export function signJwt(
  claims: Json,
  { header = { alg: "RS256", kid: ACCESS_KID }, key = accessKey.privateKey }: SignOptions = {},
) {
  const signed = `${base64url(header)}.${base64url(claims)}`;

  return `${signed}.${sign("sha256", Buffer.from(signed), key).toString("base64url")}`;
}

/** A token as Access issues it: valid for an hour, for this app. */
export const accessJwt = (claims: Record<string, Json>) =>
  signJwt({
    iss: `https://${TEAM_DOMAIN}`,
    aud: [POLICY_AUD],
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  });

export const accessHeaders = (email: string | null): Record<string, string> =>
  email === null ? {} : { "Cf-Access-Jwt-Assertion": accessJwt({ email }) };

export type RequestBody = Json;

interface RequestOptions {
  email?: string | null;
  headers?: Record<string, string>;
  body?: RequestBody | undefined;
}

/** A string body is sent as-is so tests can post malformed JSON; `email: null` sends no Access token. */
const bodyText = (body: RequestBody | undefined) => {
  if (body === undefined) return null;

  return body instanceof Object ? JSON.stringify(body) : String(body);
};

export const apiRequest = (
  method: string,
  url: string,
  { email = null, headers = accessHeaders(email), body }: RequestOptions = {},
) => new Request(url, { method, headers, body: bodyText(body) });

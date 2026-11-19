import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { authorize, authorizeWriter } from "@worker/lib/auth";
import type { Env, Json } from "@worker/lib/env";
import {
  ACCESS_KID,
  accessHeaders,
  accessJwt,
  makeEnv,
  POLICY_AUD,
  signJwt,
  TEAM_DOMAIN,
} from "./helpers/env";

const env = makeEnv();

const request = (method: string, headers: Record<string, string>) =>
  new Request("https://x/api/anything", { method, headers });

const withJwt = (token: string) => request("GET", { "Cf-Access-Jwt-Assertion": token });

const rejection = async (req: Request, authorizer = authorize) => {
  const result = await authorizer(req, env);
  assert.ok(result instanceof Response);

  return result;
};

const viewer = async (method: string, email: string | null, withEnv: Env = env) => {
  const result = await authorize(request(method, accessHeaders(email)), withEnv);
  assert.ok(!(result instanceof Response));

  return result;
};

const OWNER_CLAIMS = { iss: `https://${TEAM_DOMAIN}`, aud: [POLICY_AUD], email: "me@example.com" };
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

test("a request without the Access JWT is rejected", async () => {
  assert.equal((await rejection(request("GET", {}))).status, 401);
});

test("the Access email header alone is not trusted", async () => {
  const forged = request("POST", { "Cf-Access-Authenticated-User-Email": "me@example.com" });
  assert.equal((await rejection(forged)).status, 401);
});

const forgeries: [string, () => string][] = [
  [
    "a token signed by another key",
    () => {
      const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

      return signJwt({ ...OWNER_CLAIMS, exp: inAnHour() }, { key: privateKey });
    },
  ],
  [
    "an unsigned token",
    () => {
      const [header, payload] = accessJwt({ email: "me@example.com" }).split(".", 2);

      return `${header}.${payload}.`;
    },
  ],
  [
    "an alg none token",
    () => {
      const header = { alg: "none", kid: ACCESS_KID };
      const [, payload] = accessJwt({ email: "me@example.com" }).split(".", 2);

      return `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${payload}.`;
    },
  ],
  [
    "a token whose claims were edited after signing",
    () => {
      const [header, , signature] = accessJwt({ email: "stranger@example.com" }).split(".", 3);
      const claims: Json = { ...OWNER_CLAIMS, exp: inAnHour() };

      return `${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;
    },
  ],
  [
    "a token from an unknown key id",
    () => signJwt({ ...OWNER_CLAIMS, exp: inAnHour() }, { header: { alg: "RS256", kid: "other" } }),
  ],
  [
    "a token for another Access app",
    () => accessJwt({ email: "me@example.com", aud: ["other-aud"] }),
  ],
  [
    "a token from another Access team",
    () => accessJwt({ email: "me@example.com", iss: "https://other.cloudflareaccess.com" }),
  ],
  [
    "an expired token",
    () => accessJwt({ email: "me@example.com", exp: Math.floor(Date.now() / 1000) - 1 }),
  ],
  ["a token without an expiry", () => signJwt(OWNER_CLAIMS)],
  ["a token that is not a JWT", () => "garbage"],
  ["a token with too many parts", () => `${accessJwt({ email: "me@example.com" })}.x`],
  ["a token whose parts are not base64", () => "a.b.c"],
];

for (const [name, token] of forgeries) {
  test(`${name} is rejected`, async () => {
    const result = await rejection(withJwt(token()));

    assert.equal(result.status, 401);
  });

  test(`${name} is rejected for writers too`, async () => {
    const result = await rejection(withJwt(token()), authorizeWriter);

    assert.equal(result.status, 401);
  });
}

test("a failed fetch of the signing keys is not cached", async () => {
  const domain = "flaky.cloudflareaccess.com";
  const flaky = { ...env, TEAM_DOMAIN: domain };

  const token = signJwt({
    iss: `https://${domain}`,
    aud: [POLICY_AUD],
    email: "me@example.com",
    exp: inAnHour(),
  });

  const served = fetch;
  let calls = 0;

  jest.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    calls += 1;

    // The test key is served for TEAM_DOMAIN only.
    return calls === 1
      ? Promise.resolve(new Response("down", { status: 500 }))
      : served(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`, init);
  });

  await assert.rejects(authorize(withJwt(token), flaky), /HTTP 500/);
  assert.ok(!((await authorize(withJwt(token), flaky)) instanceof Response));
  jest.restoreAllMocks();
});

test("a service token is a writer but not a viewer", async () => {
  const token = accessJwt({ common_name: "abc123.access" });

  assert.deepEqual(await authorizeWriter(withJwt(token), env), { email: null });
  assert.equal((await rejection(withJwt(token))).status, 401);
});

test("an aud given as a string is accepted", async () => {
  const result = await authorize(
    withJwt(accessJwt({ email: "me@example.com", aud: POLICY_AUD })),
    env,
  );

  assert.ok(!(result instanceof Response));
});

test("a token for any app listed in POLICY_AUD is accepted", async () => {
  const twoApps = { ...env, POLICY_AUD: `first-aud, ${POLICY_AUD}` };
  const result = await authorize(withJwt(accessJwt({ email: "me@example.com" })), twoApps);

  assert.ok(!(result instanceof Response));
});

test("DEV_EMAIL stands in when the Access JWT is missing", async () => {
  const result = await viewer("GET", null, { ...env, DEV_EMAIL: "me@example.com" });
  assert.deepEqual(result, { email: "me@example.com" });
});

// The status and body a refused request gets.
const refusal = async (req: Request, withEnv: Env = env) => {
  const result = await authorize(req, withEnv);
  assert.ok(result instanceof Response);

  return { status: result.status, body: await result.json() };
};

const FORBIDDEN = { status: 403, body: { error: "forbidden" } };

const STRANGER = accessHeaders("stranger@example.com");

test("the Access JWT wins over DEV_EMAIL", async () => {
  const withDev = { ...env, DEV_EMAIL: "me@example.com" };

  assert.deepEqual(await refusal(request("GET", STRANGER), withDev), FORBIDDEN);
});

test("an Access user other than the owner is forbidden", async () => {
  assert.deepEqual(await refusal(request("GET", STRANGER)), FORBIDDEN);
});

test("a stranger's POST is forbidden", async () => {
  assert.deepEqual(await refusal(request("POST", STRANGER)), FORBIDDEN);
});

test("the owner is matched case-insensitively", async () => {
  assert.deepEqual(await viewer("GET", "ME@example.com"), { email: "ME@example.com" });
});

test("the owner can write", async () => {
  assert.deepEqual(await viewer("POST", "me@example.com"), { email: "me@example.com" });
});

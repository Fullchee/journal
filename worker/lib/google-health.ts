import * as z from "zod/mini";
import { expectJson, readJson } from "./json";

/**
 * The Google Health API (Fitbit's replacement) over REST with a refresh token.
 * Its OAuth client lives in its own Cloud project, apart from Calendar's (docs/research/fitbit-data.md).
 */
export interface GoogleHealthEnv {
  GOOGLE_HEALTH_CLIENT_ID?: string;
  GOOGLE_HEALTH_CLIENT_SECRET?: string;
  GOOGLE_HEALTH_REFRESH_TOKEN?: string;
}

const DATA_TYPES = "https://health.googleapis.com/v4/users/me/dataTypes";

/** Sessions the watch itself recorded; manual logs and other apps' writes come from other families. */
export const WATCH_ONLY = "users/me/dataSourceFamilies/google-wearables";

const RECONNECT_HELP =
  "Mint a new Google Health refresh token and run `wrangler secret put GOOGLE_HEALTH_REFRESH_TOKEN`.";

const Granted = z.object({ access_token: z.string() });

const OAuthError = z.object({ error: z.optional(z.string()) });

/** Lists every data point of `dataType` matching `query`, following `nextPageToken`, each parsed with `point`. */
export type ListDataPoints = <Point extends z.ZodMiniType>(
  dataType: string,
  query: Record<string, string>,
  point: Point,
) => Promise<z.infer<Point>[]>;

async function accessToken(env: GoogleHealthEnv, fetcher: typeof fetch): Promise<string | null> {
  const { GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET, GOOGLE_HEALTH_REFRESH_TOKEN } = env;

  if (
    GOOGLE_HEALTH_CLIENT_ID === undefined ||
    GOOGLE_HEALTH_CLIENT_SECRET === undefined ||
    GOOGLE_HEALTH_REFRESH_TOKEN === undefined
  ) {
    console.error(`Google Health skipped: its secrets are not set. ${RECONNECT_HELP}`);

    return null;
  }

  const res = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: GOOGLE_HEALTH_CLIENT_ID,
      client_secret: GOOGLE_HEALTH_CLIENT_SECRET,
      refresh_token: GOOGLE_HEALTH_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (res.ok) {
    const granted = await expectJson(res, Granted);

    return granted.access_token;
  }

  const body = await readJson(res, OAuthError);
  const reason = body?.error === undefined ? "" : ` (${body.error})`;

  console.error(
    `Google Health sign-in failed: the token endpoint answered ${res.status}${reason}. ${RECONNECT_HELP}`,
  );

  return null;
}

/** A data point lister holding a fresh access token; null after logging why sign-in failed. */
export async function connectGoogleHealth(
  env: GoogleHealthEnv,
  fetcher: typeof fetch,
): Promise<ListDataPoints | null> {
  const token = await accessToken(env, fetcher);

  if (token === null) return null;

  return async (dataType, query, point) => {
    const Page = z.object({
      dataPoints: z.optional(z.array(point)),
      nextPageToken: z.optional(z.string()),
    });

    const points: z.infer<typeof point>[] = [];
    let pageToken = "";

    do {
      const params = new URLSearchParams(pageToken === "" ? query : { ...query, pageToken });
      const url = `${DATA_TYPES}/${dataType}/dataPoints?${params.toString()}`;
      const res = await fetcher(url, { headers: { authorization: `Bearer ${token}` } });

      if (!res.ok) throw new Error(`${dataType} dataPoints answered ${res.status}`);
      const page = await expectJson(res, Page);

      points.push(...(page.dataPoints ?? []));
      pageToken = page.nextPageToken ?? "";
    } while (pageToken !== "");

    return points;
  };
}

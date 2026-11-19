import type { ImageSource } from "expo-image";

import { API_BASE_URL } from "@/lib/api/config";
import { authorize } from "@/lib/auth/auth";

async function authHeaders(): Promise<HeadersInit | undefined> {
  try {
    const { headers } = await authorize({});

    return headers;
  } catch {
    return undefined;
  }
}

/** Attachments are API paths behind Access; any other host must never see the token. */
export async function resolveImageSource(url: string): Promise<ImageSource> {
  if (!url.startsWith("/")) return { uri: url };

  // Offline the token can't refresh; the disk cache is keyed by URL alone, so a seen image still loads without it.
  const sent: Record<string, string> = {};

  new Headers(await authHeaders()).forEach((value, name) => {
    sent[name] = value;
  });

  return { uri: `${API_BASE_URL}${url}`, headers: sent };
}

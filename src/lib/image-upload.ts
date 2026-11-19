import { fitWithin, needsCompression } from "@/core";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { launchImageLibraryAsync, type ImagePickerAsset } from "expo-image-picker";
import * as z from "zod/mini";

import { apiFetch } from "@/lib/api/api-fetch";

interface Upload {
  blob: Blob;
  type: string;
}

const WEBP_QUALITY = 0.85;

export async function pickImage(): Promise<ImagePickerAsset | null> {
  const result = await launchImageLibraryAsync({ mediaTypes: "images", quality: 1 });

  return result.canceled ? null : (result.assets[0] ?? null);
}

async function readBlob(uri: string) {
  const response = await fetch(uri);

  return response.blob();
}

// A re-encode can grow a small image; keep the original then.
async function compress(asset: ImagePickerAsset, original: Upload): Promise<Upload> {
  if (!needsCompression(original.type, original.blob.size)) return original;

  const image = await ImageManipulator.manipulate(asset.uri)
    .resize(fitWithin(asset.width, asset.height))
    .renderAsync();

  const saved = await image.saveAsync({ format: SaveFormat.WEBP, compress: WEBP_QUALITY });
  const blob = await readBlob(saved.uri);

  return blob.size < original.blob.size ? { blob, type: "image/webp" } : original;
}

/** Returns the image's markdown-ready url, or null when compressing or uploading fails. */
export async function uploadImage(asset: ImagePickerAsset): Promise<string | null> {
  try {
    const blob = await readBlob(asset.uri);
    const file = await compress(asset, { blob, type: asset.mimeType ?? blob.type });

    const { url } = await apiFetch(
      "/api/attachments/habits",
      { method: "POST", file },
      z.object({ url: z.string() }),
    );

    return url;
  } catch {
    return null;
  }
}

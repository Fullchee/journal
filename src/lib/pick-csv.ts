import { getDocumentAsync } from "expo-document-picker";

// Android offers a CSV under several types, and some file managers label it plain text.
const CSV_TYPES = ["text/csv", "text/comma-separated-values", "text/plain", "application/csv"];

/** Opens the system file picker; resolves to the picked file's text, or null when nothing was picked. */
export async function pickCsvText(): Promise<string | null> {
  const result = await getDocumentAsync({ type: CSV_TYPES });
  // A closed picker has no assets.
  const asset = result.assets?.[0];

  if (asset === undefined) return null;
  // The picker copies the file into the app's cache, which fetch reads like any other uri.
  const response = await fetch(asset.uri);

  return response.text();
}

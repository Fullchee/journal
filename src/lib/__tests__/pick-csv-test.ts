import { getDocumentAsync, type DocumentPickerResult } from "expo-document-picker";

import { pickCsvText } from "@/lib/pick-csv";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

const picked = (uri: string): DocumentPickerResult => ({
  canceled: false,
  assets: [{ uri, name: "workout_data.csv", lastModified: 0 }],
});

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response('"title","start_time"'));
});

afterEach(() => jest.restoreAllMocks());

it("reads the picked file as text", async () => {
  jest.mocked(getDocumentAsync).mockResolvedValue(picked("file:///cache/workout_data.csv"));

  await expect(pickCsvText()).resolves.toBe('"title","start_time"');
  expect(fetch).toHaveBeenCalledWith("file:///cache/workout_data.csv");
});

it("resolves to null when the picker is closed", async () => {
  jest.mocked(getDocumentAsync).mockResolvedValue({ canceled: true, assets: null });

  await expect(pickCsvText()).resolves.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

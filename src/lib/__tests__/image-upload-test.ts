import { launchImageLibraryAsync, type ImagePickerAsset } from "expo-image-picker";

import { apiFetch } from "@/lib/api/api-fetch";
import { NetworkError } from "@/lib/api/errors";
import { pickImage, uploadImage } from "@/lib/image-upload";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));

const mockResize = jest.fn();
const mockManipulate = jest.fn<unknown, unknown[]>();

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { WEBP: "webp" },
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
}));

const asset = (overrides: Partial<ImagePickerAsset> = {}): ImagePickerAsset => ({
  uri: "file:///photo.png",
  width: 3200,
  height: 1600,
  fileName: "photo.png",
  mimeType: "image/png",
  ...overrides,
});

const bytes = (size: number) => new Blob(["x".repeat(size)]);

// Each file:// read answers with the blob registered for that uri.
const files = (byUri: Record<string, Blob>) => {
  jest.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const blob = input instanceof Request ? undefined : byUri[input.toString()];

    if (!blob) throw new Error("fetched a file the test did not register");

    return Promise.resolve(Object.assign(new Response(), { blob: () => Promise.resolve(blob) }));
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(apiFetch).mockResolvedValue({ url: "/api/attachments/habits/u.png" });
  mockManipulate.mockReturnValue({
    resize: mockResize.mockReturnThis(),
    renderAsync: () =>
      Promise.resolve({ saveAsync: () => Promise.resolve({ uri: "file:///small.webp" }) }),
  });
});

describe("pickImage", () => {
  it("returns the picked photo", async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [asset()] });

    await expect(pickImage()).resolves.toEqual(asset());
    expect(launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: "images", quality: 1 });
  });

  it("returns null when the pick is cancelled", async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });

    await expect(pickImage()).resolves.toBeNull();
  });

  it("returns null when the picker answers with no photo", async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [] });

    await expect(pickImage()).resolves.toBeNull();
  });
});

describe("uploadImage", () => {
  it("uploads a small image as it is", async () => {
    const original = bytes(1000);
    files({ "file:///photo.png": original });

    await expect(uploadImage(asset())).resolves.toBe("/api/attachments/habits/u.png");
    expect(mockManipulate).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/attachments/habits",
      {
        method: "POST",
        file: { blob: original, type: "image/png" },
      },
      expect.anything(),
    );
  });

  it("scales a large image to 1600 px and sends it as WebP", async () => {
    const small = bytes(1000);
    files({ "file:///photo.png": bytes(400_000), "file:///small.webp": small });

    await uploadImage(asset());

    expect(mockResize).toHaveBeenCalledWith({ width: 1600, height: 800 });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/attachments/habits",
      {
        method: "POST",
        file: { blob: small, type: "image/webp" },
      },
      expect.anything(),
    );
  });

  it("keeps the original when the WebP comes out bigger", async () => {
    const original = bytes(400_000);
    files({ "file:///photo.png": original, "file:///small.webp": bytes(500_000) });

    await uploadImage(asset());

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/attachments/habits",
      {
        method: "POST",
        file: { blob: original, type: "image/png" },
      },
      expect.anything(),
    );
  });

  it("reads the type from the file when the picker doesn't say", async () => {
    const original = new Blob(["x"], { type: "image/jpeg" });
    files({ "file:///photo.png": original });

    const { mimeType: _, ...untyped } = asset();
    await uploadImage(untyped);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/attachments/habits",
      {
        method: "POST",
        file: { blob: original, type: "image/jpeg" },
      },
      expect.anything(),
    );
  });

  it("never re-encodes a GIF", async () => {
    files({ "file:///photo.png": bytes(400_000) });

    await uploadImage(asset({ mimeType: "image/gif" }));

    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it("returns null when the upload fails", async () => {
    files({ "file:///photo.png": bytes(1000) });
    jest.mocked(apiFetch).mockRejectedValue(new NetworkError(null));

    await expect(uploadImage(asset())).resolves.toBeNull();
  });
});

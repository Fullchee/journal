import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ImagePickerAsset } from "expo-image-picker";
import { useState } from "react";
import { TextInput } from "react-native";

import { AddImageButton, OFFLINE_IMAGES, useAddImage } from "@/components/add-image";
import { pickImage, uploadImage } from "@/lib/image-upload";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { resetRouteMocks, setOnline } from "../../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../../jest/route-mocks";

jest.mock("@/lib/data/data-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../../jest/route-mocks").mockDataProvider(),
);

jest.mock("@/lib/image-upload", () => ({ pickImage: jest.fn(), uploadImage: jest.fn() }));

const asset = (fileName: string | null): ImagePickerAsset => ({
  uri: "file:///a.png",
  width: 100,
  height: 100,
  fileName,
  mimeType: "image/png",
});

function Field({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const images = useAddImage(text, setText);

  return (
    <>
      <TextInput
        aria-label="Markdown"
        value={text}
        onChangeText={setText}
        onSelectionChange={images.onSelectionChange}
      />
      <AddImageButton images={images} />
    </>
  );
}

// Resolves the upload when the test says so, to look at the placeholder in between.
const pendingUpload = () => {
  const upload = Promise.withResolvers<string | null>();

  jest.mocked(uploadImage).mockReturnValue(upload.promise);

  return upload.resolve;
};

const markdown = () => String(screen.getByLabelText("Markdown").props["value"]);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(pickImage).mockResolvedValue(asset("shot.png"));
});

afterEach(resetRouteMocks);

describe("useAddImage", () => {
  it("shows a placeholder at the cursor, then swaps in the image", async () => {
    const finish = pendingUpload();

    await render(<Field initial="ab" />);
    await fireEvent(screen.getByLabelText("Markdown"), "selectionChange", {
      nativeEvent: { selection: { start: 1, end: 1 } },
    });
    await userEvent.press(screen.getByText("Add image"));

    expect(markdown()).toBe("a\n![Uploading shot.png…]()\nb");

    finish("/api/attachments/habits/u.png");

    await waitFor(() => expect(markdown()).toBe("a\n![shot](/api/attachments/habits/u.png)\nb"));
  });

  it("keeps text typed during the upload", async () => {
    const finish = pendingUpload();

    await render(<Field initial="" />);
    await userEvent.press(screen.getByText("Add image"));
    await userEvent.paste(screen.getByLabelText("Markdown"), `${markdown()} more`);
    finish("/u.png");

    await waitFor(() => expect(markdown()).toBe("![shot](/u.png) more"));
  });

  it("removes the placeholder and says so when the upload fails", async () => {
    const finish = pendingUpload();
    jest.mocked(pickImage).mockResolvedValue(asset(null));

    await render(<Field initial="x" />);
    await userEvent.press(screen.getByText("Add image"));
    finish(null);

    await waitFor(() => expect(markdown()).toBe("x"));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't upload image.");
  });

  it("leaves the text alone when the pick is cancelled", async () => {
    jest.mocked(pickImage).mockResolvedValue(null);

    await render(<Field initial="x" />);
    await userEvent.press(screen.getByText("Add image"));

    expect(markdown()).toBe("x");
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("is disabled offline, with the reason", async () => {
    setOnline(false);

    await render(<Field initial="" />);

    expect(screen.getByRole("button", { name: "Add image" })).toBeDisabled();
    expect(screen.getByText(OFFLINE_IMAGES)).toBeOnTheScreen();
  });
});

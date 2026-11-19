import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import {
  Contact,
  PermissionStatus,
  getPermissionsAsync,
  requestPermissionsAsync,
} from "expo-contacts";
import type { ReactNode } from "react";

import { useContactPhoto } from "@/lib/contacts/contact-photo.android";
import { createQueryClient } from "@/lib/data/query-client";

const mockGetImage = jest.fn<Promise<string | null>, []>();

jest.mock("expo-contacts", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied" },
  Contact: jest.fn().mockImplementation(() => ({ getImage: mockGetImage })),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

const allow = (granted: boolean) =>
  jest.mocked(getPermissionsAsync).mockResolvedValue({
    granted,
    status: granted ? PermissionStatus.GRANTED : PermissionStatus.DENIED,
    canAskAgain: true,
    expires: "never",
  });

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

const photoOf = async (contactId: string | null) => {
  const { result } = await renderHook(() => useContactPhoto(contactId), { wrapper: Wrapper });

  return result;
};

it("reads the linked contact's photo from the phone", async () => {
  allow(true);
  mockGetImage.mockResolvedValue("content://contacts/42/photo");

  const result = await photoOf("42");

  await waitFor(() => expect(result.current).toBe("content://contacts/42/photo"));
  expect(Contact).toHaveBeenCalledWith("42");
});

it("shows no photo when the contact is gone", async () => {
  allow(true);
  mockGetImage.mockRejectedValue(new Error("contact not found"));

  const result = await photoOf("42");

  await waitFor(() => expect(mockGetImage).toHaveBeenCalled());
  expect(result.current).toBeNull();
});

it("shows no photo without contacts permission, and never asks for it", async () => {
  allow(false);

  const result = await photoOf("42");

  await waitFor(() => expect(getPermissionsAsync).toHaveBeenCalled());
  expect(result.current).toBeNull();
  expect(requestPermissionsAsync).not.toHaveBeenCalled();
  expect(mockGetImage).not.toHaveBeenCalled();
});

it("reads nothing for a person typed in by hand", async () => {
  const result = await photoOf(null);

  expect(result.current).toBeNull();
  expect(getPermissionsAsync).not.toHaveBeenCalled();
});

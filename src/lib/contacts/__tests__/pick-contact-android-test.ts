import { Contact, PermissionStatus, requestPermissionsAsync } from "expo-contacts";

import { pickContact } from "@/lib/contacts/pick-contact.android";

const mockGetDetails = jest.fn();

jest.mock("expo-contacts", () => ({
  ContactField: { FULL_NAME: "fullName", DATES: "dates" },
  PermissionStatus: { GRANTED: "granted", DENIED: "denied" },
  Contact: class {
    static readonly presentPicker = jest.fn();

    readonly id = "42";

    getDetails = mockGetDetails;
  },
  requestPermissionsAsync: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

const allow = (granted: boolean) =>
  jest.mocked(requestPermissionsAsync).mockResolvedValue({
    granted,
    status: granted ? PermissionStatus.GRANTED : PermissionStatus.DENIED,
    canAskAgain: true,
    expires: "never",
  });

it("returns null without opening the picker when contacts permission is denied", async () => {
  allow(false);

  await expect(pickContact()).resolves.toBeNull();
  expect(Contact.presentPicker).not.toHaveBeenCalled();
});

it("returns null when the picker is cancelled", async () => {
  allow(true);
  jest.mocked(Contact.presentPicker).mockResolvedValue(null);

  await expect(pickContact()).resolves.toBeNull();
});

it("returns null when the picker fails to open", async () => {
  allow(true);
  jest.mocked(Contact.presentPicker).mockRejectedValue(new Error("No picker activity"));

  await expect(pickContact()).resolves.toBeNull();
});

it("returns null when the picked contact is deleted before its details are read", async () => {
  allow(true);
  jest.mocked(Contact.presentPicker).mockResolvedValue(new Contact("42"));
  mockGetDetails.mockRejectedValue(new Error("Contact not found"));

  await expect(pickContact()).resolves.toBeNull();
});

it("fills a new person from the picked contact's name and birthday", async () => {
  allow(true);
  jest.mocked(Contact.presentPicker).mockResolvedValue(new Contact("42"));
  mockGetDetails.mockResolvedValue({
    id: "42",
    fullName: "Priya",
    dates: [{ id: "1", label: "birthday", date: { year: 1990, month: 3, day: 9 } }],
  });

  await expect(pickContact()).resolves.toEqual({
    name: "Priya",
    dates: [{ label: "Birthday", date: "1990-03-09", yearly: true }],
    contactId: "42",
  });
  expect(mockGetDetails).toHaveBeenCalledWith(["fullName", "dates"]);
});

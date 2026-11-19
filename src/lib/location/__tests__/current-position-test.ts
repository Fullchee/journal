import {
  Accuracy,
  PermissionStatus,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  requestForegroundPermissionsAsync,
  type LocationObject,
  type LocationPermissionResponse,
} from "expo-location";

import type * as CurrentPosition from "@/lib/location/current-position.android";

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  PermissionStatus: { GRANTED: "granted", DENIED: "denied" },
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}));

const HOME = { latitude: 43.65, longitude: -79.38 };

const OFFICE = { latitude: 43.66, longitude: -79.39 };

const fix = (
  { latitude, longitude }: typeof HOME,
  accuracy: number | null = 20,
): LocationObject => ({
  coords: {
    latitude,
    longitude,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 0,
});

const permission = (
  granted: boolean,
  accuracy: "fine" | "coarse" | "none" = granted ? "fine" : "none",
): LocationPermissionResponse => ({
  granted,
  status: granted ? PermissionStatus.GRANTED : PermissionStatus.DENIED,
  canAskAgain: true,
  expires: "never",
  android: { accuracy },
});

// A denial lasts for the session, so each test loads a fresh module.
function currentPosition() {
  const loaded: (typeof CurrentPosition)[] = [];

  jest.isolateModules(() => {
    loaded.push(
      jest.requireActual<typeof CurrentPosition>("@/lib/location/current-position.android"),
    );
  });

  const [fresh] = loaded;

  if (!fresh) throw new Error("current-position.android did not load");

  return fresh.currentPosition;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requestForegroundPermissionsAsync).mockResolvedValue(permission(true));
});

afterEach(() => jest.useRealTimers());

it("returns the last known fix when it is under 10 minutes old", async () => {
  jest.mocked(getLastKnownPositionAsync).mockResolvedValue(fix(HOME));

  const read = currentPosition();

  await expect(read()).resolves.toEqual(HOME);
  expect(getLastKnownPositionAsync).toHaveBeenCalledWith({
    maxAge: 600_000,
    requiredAccuracy: 150,
  });
  expect(getCurrentPositionAsync).not.toHaveBeenCalled();
});

it("takes a Balanced fix when no recent one is known, without asking to turn location on", async () => {
  jest.mocked(getLastKnownPositionAsync).mockResolvedValue(null);
  jest.mocked(getCurrentPositionAsync).mockResolvedValue(fix(HOME));

  const read = currentPosition();

  await expect(read()).resolves.toEqual(HOME);
  expect(getCurrentPositionAsync).toHaveBeenCalledWith({
    accuracy: Accuracy.Balanced,
    mayShowUserSettingsDialog: false,
  });
});

it("gives up on a fix after 5 seconds", async () => {
  jest.useFakeTimers();
  jest.mocked(getLastKnownPositionAsync).mockResolvedValue(null);
  jest.mocked(getCurrentPositionAsync).mockReturnValue(new Promise(jest.fn()));

  const read = currentPosition();
  const position = read();

  await jest.advanceTimersByTimeAsync(5000);

  await expect(position).resolves.toBeNull();
});

it("returns null when reading the position fails", async () => {
  jest.mocked(getLastKnownPositionAsync).mockRejectedValue(new Error("location off"));

  const read = currentPosition();

  await expect(read()).resolves.toBeNull();
});

it("returns null on denial and asks only once that session", async () => {
  jest.mocked(requestForegroundPermissionsAsync).mockResolvedValue(permission(false));

  const read = currentPosition();

  await expect(read()).resolves.toBeNull();
  await expect(read()).resolves.toBeNull();
  expect(requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(getLastKnownPositionAsync).not.toHaveBeenCalled();
});

it("returns null when the owner grants only Approximate location", async () => {
  jest.mocked(requestForegroundPermissionsAsync).mockResolvedValue(permission(true, "coarse"));

  const read = currentPosition();

  await expect(read()).resolves.toBeNull();
  expect(getLastKnownPositionAsync).not.toHaveBeenCalled();
});

it("takes a fresh fix when the last known one is over 150 m off", async () => {
  jest.mocked(getLastKnownPositionAsync).mockResolvedValue(fix(OFFICE, 800));
  jest.mocked(getCurrentPositionAsync).mockResolvedValue(fix(HOME));

  const read = currentPosition();

  await expect(read()).resolves.toEqual(HOME);
});

it("returns null when the fresh fix is over 150 m off", async () => {
  jest.mocked(getLastKnownPositionAsync).mockResolvedValue(null);
  jest.mocked(getCurrentPositionAsync).mockResolvedValue(fix(HOME, 151));

  const read = currentPosition();

  await expect(read()).resolves.toBeNull();
});

it("returns null when the fix has no accuracy", async () => {
  jest.mocked(getLastKnownPositionAsync).mockResolvedValue(null);
  jest.mocked(getCurrentPositionAsync).mockResolvedValue(fix(HOME, null));

  const read = currentPosition();

  await expect(read()).resolves.toBeNull();
});

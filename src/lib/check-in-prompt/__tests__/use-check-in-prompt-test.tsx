import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { isoAt, shiftDay, torontoDay, type CheckIn, type RestPeriod } from "@/core";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import notifee, {
  AlarmType,
  AuthorizationStatus,
  EventType,
  TriggerType,
  type Event,
} from "react-native-notify-kit";

import { NetworkError } from "@/lib/api/errors";
import { useCheckInPrompt } from "@/lib/check-in-prompt/use-check-in-prompt.android";
import { checkInsQuery } from "@/lib/data/check-ins";
import { STREAKS_KEY } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, reply } from "../../../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn } from "../../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const mockNavigate = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: mockNavigate }) }));

const mockCreateTrigger = jest.spyOn(notifee, "createTriggerNotification");
const mockCancelTriggers = jest.spyOn(notifee, "cancelTriggerNotifications");
const mockCreateChannel = jest.spyOn(notifee, "createChannel");
const mockInitial = jest.spyOn(notifee, "getInitialNotification");
const mockOnForegroundEvent = jest.spyOn(notifee, "onForegroundEvent");
const mockGetNotificationSettings = jest.spyOn(notifee, "getNotificationSettings");
const mockRequestPermission = jest.spyOn(notifee, "requestPermission");
const mockAddAppStateListener = jest.spyOn(AppState, "addEventListener");

const TODAY = "2026-11-14";
const TOMORROW = shiftDay(TODAY, 1);

interface Answers {
  checkIns?: CheckIn[] | Error;
  restPeriods?: RestPeriod[];
}

function serve({ checkIns = [], restPeriods = [] }: Answers) {
  fakeApi({
    "/api/check-ins": reply(checkIns instanceof Error ? checkIns : { checkIns }),
    "/api/streaks": reply({ counts: {}, durations: {}, skips: {}, restPeriods }),
  });
}

async function mount(answers: Answers = {}) {
  serve(answers);
  const client = createQueryClient();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const hook = await renderHook(useCheckInPrompt, { wrapper });

  return { client, hook };
}

const scheduled = () => mockCreateTrigger.mock.calls.map(([n, trigger]) => ({ n, trigger }));

const scheduledDays = () => scheduled().map(({ n }) => n.data?.["checkInPrompt"]);

beforeEach(() => {
  jest.clearAllMocks();
  mockInitial.mockResolvedValue(null);
  // A Saturday morning in Toronto, before the 12:30 prompt.
  jest.useFakeTimers({ now: new Date(isoAt(TODAY, 9 * 60)), advanceTimers: true });
});

afterEach(() => jest.useRealTimers());

describe("planning", () => {
  test("a morning with no Check-in schedules today's 12:30 prompt and tomorrow's", async () => {
    await mount();

    await waitFor(() => expect(scheduled()).toHaveLength(2));

    expect(mockCreateChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "check-in-prompt", name: "Check-in prompt" }),
    );
    expect(mockCancelTriggers).toHaveBeenCalledWith(["2140000000", "2140000001"]);

    const [today, tomorrow] = scheduled();

    expect(today?.n).toMatchObject({
      id: "2140000000",
      title: "Check-in",
      body: "How's the weather?",
      data: { checkInPrompt: TODAY },
      android: {
        channelId: "check-in-prompt",
        autoCancel: true,
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Rain", pressAction: { id: "Rain", launchActivity: "default" } },
          { title: "Cloud", pressAction: { id: "Cloud", launchActivity: "default" } },
          { title: "Sun", pressAction: { id: "Sun", launchActivity: "default" } },
        ],
      },
    });
    expect(today?.trigger).toEqual({
      type: TriggerType.TIMESTAMP,
      timestamp: Date.parse(isoAt(TODAY, 750)),
      alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
    });
    expect(tomorrow?.n).toMatchObject({ id: "2140000001", data: { checkInPrompt: TOMORROW } });
  });

  test("saving a Check-in today drops today's prompt and keeps tomorrow's", async () => {
    const { client } = await mount();

    await waitFor(() => expect(scheduled()).toHaveLength(2));
    mockCreateTrigger.mockClear();

    await act(() =>
      client.setQueryData(checkInsQuery.queryKey, {
        checkIns: [checkIn({ checkedInAt: isoAt(TODAY, 10 * 60), zone: "Storm" })],
      }),
    );

    await waitFor(() => expect(scheduledDays()).toEqual([TOMORROW]));
    expect(scheduled()[0]?.n.android?.actions?.map((a) => a.title)).toEqual([
      "Storm",
      "Rain",
      "Cloud",
    ]);
  });

  test("the buttons name the last Check-in's zone and its neighbours", async () => {
    await mount({
      checkIns: [
        checkIn({ id: 1, checkedInAt: isoAt("2026-11-12", 600), zone: "Storm" }),
        checkIn({ id: 2, checkedInAt: isoAt("2026-11-13", 600), zone: "Sun" }),
      ],
    });

    await waitFor(() => expect(scheduled()).toHaveLength(2));

    expect(scheduled()[0]?.n.android?.actions?.map((a) => a.title)).toEqual([
      "Rain",
      "Cloud",
      "Sun",
    ]);
  });

  test("Rest mode Days get no prompt", async () => {
    const { client } = await mount({ restPeriods: [{ start: TODAY, end: TOMORROW }] });

    await waitFor(() => expect(client.getQueryState(STREAKS_KEY)?.status).toBe("success"));
    await waitFor(() => expect(mockCancelTriggers).toHaveBeenCalled());

    // Before the Rest periods load, a first plan may schedule both; the plan that knows them cancels both.
    const lastCancel = Math.max(...mockCancelTriggers.mock.invocationCallOrder);

    expect(mockCreateTrigger.mock.invocationCallOrder.filter((at) => at > lastCancel)).toEqual([]);
  });

  test("asks for notification permission before its first prompt, when Android hasn't asked yet", async () => {
    const answered = await notifee.getNotificationSettings();

    mockGetNotificationSettings.mockResolvedValue({
      ...answered,
      authorizationStatus: AuthorizationStatus.NOT_DETERMINED,
    });

    try {
      await mount();

      await waitFor(() => expect(scheduled()).toHaveLength(2));

      const [asked] = mockRequestPermission.mock.invocationCallOrder;

      expect(asked).toBeLessThan(Math.min(...mockCreateTrigger.mock.invocationCallOrder));
    } finally {
      mockGetNotificationSettings.mockResolvedValue(answered);
    }
  });

  test("a failed Check-ins load keeps the last plan", async () => {
    const { client } = await mount({ checkIns: new NetworkError("offline") });

    await waitFor(() =>
      expect(client.getQueryState(checkInsQuery.queryKey)?.fetchFailureCount).toBeGreaterThan(0),
    );
    await waitFor(() => expect(client.getQueryState(STREAKS_KEY)?.status).toBe("success"));

    expect(mockCancelTriggers).not.toHaveBeenCalled();
  });

  test("past 12:30, only tomorrow's prompt is scheduled", async () => {
    jest.setSystemTime(new Date(isoAt(TODAY, 13 * 60)));
    await mount();

    await waitFor(() => expect(scheduledDays()).toEqual([TOMORROW]));
    expect(torontoDay(new Date())).toBe(TODAY);
  });
});

const promptPress = (
  day: string,
  pressId: string,
  type: EventType = EventType.ACTION_PRESS,
): Event => ({
  type,
  detail: {
    pressAction: { id: pressId },
    notification: { id: "2140000000", data: { checkInPrompt: day } },
  },
});

const initialTap = (day: string, pressId: string) => ({
  pressAction: { id: pressId },
  notification: { id: "2140000000", data: { checkInPrompt: day } },
});

function foregroundHandler() {
  const handler = mockOnForegroundEvent.mock.calls.at(-1)?.[0];

  if (!handler) throw new Error("no foreground handler");

  return handler;
}

function appStateHandler() {
  const handler = mockAddAppStateListener.mock.calls.at(-1)?.[1];

  if (!handler) throw new Error("no AppState handler");

  return handler;
}

describe("presses", () => {
  test("a zone button opens Today's Check-in in that zone, once per tap", async () => {
    await mount();

    await act(() => foregroundHandler()(promptPress("2026-11-01", "Cloud")));
    await act(() => foregroundHandler()(promptPress("2026-11-01", "Cloud")));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: "/", params: { zone: "Cloud" } });
  });

  test("a press on the body opens Today", async () => {
    await mount();

    await act(() => foregroundHandler()(promptPress("2026-11-02", "default", EventType.PRESS)));

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  test("other notifications and events are left to their own handlers", async () => {
    await mount();

    await act(() =>
      foregroundHandler()({
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: "done" },
          notification: { id: "42", data: { habit: "walk" } },
        },
      }),
    );
    await act(() => foregroundHandler()(promptPress("2026-11-03", "Cloud", EventType.DELIVERED)));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("a tap that opened the app routes once it starts", async () => {
    mockInitial.mockResolvedValueOnce(initialTap("2026-11-04", "Storm"));
    await mount();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({ pathname: "/", params: { zone: "Storm" } }),
    );
  });

  test("a tap with the app in the background routes when the app comes back", async () => {
    await mount();
    await waitFor(() => expect(mockInitial).toHaveBeenCalledTimes(1));

    mockInitial.mockResolvedValueOnce(initialTap("2026-11-05", "Rain"));
    await act(() => appStateHandler()("background"));
    expect(mockInitial).toHaveBeenCalledTimes(1);

    await act(() => appStateHandler()("active"));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({ pathname: "/", params: { zone: "Rain" } }),
    );
  });

  test("unmounting stops listening", async () => {
    const unsubscribe = jest.fn();

    mockOnForegroundEvent.mockReturnValueOnce(unsubscribe);
    const { hook } = await mount();
    const remove = jest.spyOn(mockAddAppStateListener.mock.results.at(-1)?.value, "remove");

    await hook.unmount();

    expect(unsubscribe).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });
});

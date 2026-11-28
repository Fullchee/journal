import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { checksSince, MISSED, shiftDay, torontoDay } from "@/core";
import type { ReactNode } from "react";
import notifee, {
  AlarmType,
  EventType,
  RepeatFrequency,
  TriggerType,
  type Event,
  type Trigger,
} from "react-native-notify-kit";

import { registerAlarmActions, useAlarmActions } from "@/lib/alarms/alarm-actions.android";
import { useSilencedAlarms } from "@/lib/alarms/silenced-alarms.android";
import { apiFetch } from "@/lib/api/api-fetch";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../../modules/journal-android";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("@/lib/alarms/silenced-alarms", () =>
  jest.requireActual<object>("@/lib/alarms/silenced-alarms.android"),
);

jest.mock("expo-sqlite/kv-store", () => {
  const items = new Map<string, string>();

  return {
    __esModule: true,
    default: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => items.set(key, value),
    },
  };
});

jest.mock("@tanstack/react-query-persist-client", () => ({
  ...jest.requireActual<object>("@tanstack/react-query-persist-client"),
  persistQueryClientRestore: jest.fn().mockResolvedValue(undefined),
  persistQueryClientSave: jest.fn().mockResolvedValue(undefined),
}));

const mockOnForegroundEvent = jest.spyOn(notifee, "onForegroundEvent");
const mockOnBackgroundEvent = jest.spyOn(notifee, "onBackgroundEvent");
const mockCancelDisplayed = jest.spyOn(notifee, "cancelDisplayedNotification");
const mockCancelTrigger = jest.spyOn(notifee, "cancelTriggerNotification");
const mockCreateTrigger = jest.spyOn(notifee, "createTriggerNotification");

const press = (action: string, type = EventType.ACTION_PRESS): Event => ({
  type,
  detail: {
    pressAction: { id: action },
    notification: { id: "42", data: { habit: "walk" } },
  },
});

const today = () => torontoDay(new Date());

function mountIn(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return renderHook(useAlarmActions, { wrapper });
}

const foregroundHandler = () => {
  const handler = mockOnForegroundEvent.mock.calls.at(-1)?.[0];

  if (!handler) throw new Error("no foreground handler");

  return handler;
};

function backgroundHandler() {
  registerAlarmActions();
  const handler = mockOnBackgroundEvent.mock.calls.at(-1)?.[0];

  if (!handler) throw new Error("no background handler");

  return handler;
}

beforeEach(() => jest.clearAllMocks());

test("Done on a notification marks today done and clears the notification", async () => {
  const api = fakeApi();
  await mountIn(createQueryClient());

  await act(() => foregroundHandler()(press("done")));

  await waitFor(() =>
    expect(api.writes).toEqual([
      {
        path: "/api/habits",
        method: "POST",
        body: { type: "check", date: today(), habit: "walk", on: true, count: 1 },
      },
    ]),
  );
  expect(mockCancelDisplayed).toHaveBeenCalledWith("42");
});

test.each(["done", "skip"])(
  "%s on a notification stops a postponed reminder of that Habit",
  async (action) => {
    fakeApi();
    await mountIn(createQueryClient());

    await act(() => foregroundHandler()(press(action)));

    expect(mockCancelTrigger).toHaveBeenCalledWith("postponed-walk");
  },
);

const ringing = {
  id: "42",
  title: "Walk",
  data: { habit: "walk", habitId: "walk" },
  android: { channelId: "alarms-sound", loopSound: true },
};

const postpone = (): Event => ({
  type: EventType.ACTION_PRESS,
  detail: { pressAction: { id: "postpone" }, notification: ringing },
});

test("Postpone shows the same reminder again in 10 minutes and logs nothing", async () => {
  const api = fakeApi();
  await mountIn(createQueryClient());
  const now = Date.now();

  await act(() => foregroundHandler()(postpone()));

  expect(mockCreateTrigger).toHaveBeenCalledWith(
    { ...ringing, id: "postponed-walk" },
    expect.objectContaining({ timestamp: now + 10 * 60_000 }),
  );
  expect(mockCancelDisplayed).toHaveBeenCalledWith("42");
  expect(api.writes).toEqual([]);
});

test("with the app closed, Postpone needs no stored queue", async () => {
  fakeApi();

  await backgroundHandler()(postpone());

  expect(mockCreateTrigger).toHaveBeenCalledTimes(1);
  expect(persistQueryClientRestore).not.toHaveBeenCalled();
});

test("Skip records an outside Skip for today", async () => {
  const api = fakeApi();
  await mountIn(createQueryClient());

  await act(() => foregroundHandler()(press("skip")));

  await waitFor(() =>
    expect(api.writes[0]?.body).toEqual({
      type: "check",
      date: today(),
      habit: "walk",
      on: true,
      count: MISSED,
      cause: "outside",
      note: "",
    }),
  );
});

const listed = (counts: Record<string, Record<string, number>>) => ({
  habits: [],
  counts,
});

test("a count Habit's Done adds one to today's count from the alarm schedule's Habit list", async () => {
  const api = fakeApi();
  const client = createQueryClient();
  client.setQueryData(
    ["habits", "list", "home", checksSince()],
    listed({ [today()]: { walk: 2 } }),
  );
  await mountIn(client);

  await act(() => foregroundHandler()(press("add-one")));

  await waitFor(() => expect(api.writes[0]?.body).toMatchObject({ count: 3 }));
});

test("after midnight, a count Habit's Done reads the tracker still keyed by yesterday's window", async () => {
  const api = fakeApi();
  const client = createQueryClient();
  const yesterdaysSince = shiftDay(checksSince(), -1);
  // A list the schedule asked for but never got: it holds no data.
  client.getQueryCache().build(client, { queryKey: ["habits", "list", "home", checksSince()] });
  client.setQueryData(["habits", "list", "library", null], { habits: [] });
  client.setQueryData(
    ["habits", "list", "tracker", yesterdaysSince],
    listed({ [today()]: { walk: 2 } }),
  );
  await mountIn(client);

  await act(() => foregroundHandler()(press("add-one")));

  await waitFor(() => expect(api.writes[0]?.body).toMatchObject({ count: 3 }));
});

test.each([
  ["no check that day", {}],
  ["checks of other Habits only", { [today()]: { read: 1 } }],
])("a count Habit's Done counts from 0 when the freshest Habit list has %s", async (_, counts) => {
  const api = fakeApi();
  const client = createQueryClient();
  client.setQueryData(["habits", "list", "home", checksSince()], listed(counts));
  await mountIn(client);

  await act(() => foregroundHandler()(press("add-one")));

  await waitFor(() => expect(api.writes[0]?.body).toMatchObject({ count: 1 }));
});

test("with no Habit list cached, a count Habit's Done fetches today's count before it writes", async () => {
  const api = fakeApi({
    "/api/habits?view=home": () => listed({ [today()]: { walk: 2, read: 1 } }),
  });

  await mountIn(createQueryClient());

  await act(() => foregroundHandler()(press("add-one")));

  await waitFor(() => expect(api.writes[0]?.body).toMatchObject({ count: 3 }));
});

test("a fetched Habit list with no checks counts from 0", async () => {
  const api = fakeApi({ "/api/habits?view=home": () => ({ habits: [] }) });
  await mountIn(createQueryClient());

  await act(() => foregroundHandler()(press("add-one")));

  await waitFor(() => expect(api.writes[0]?.body).toMatchObject({ count: 1 }));
});

test("offline with no Habit list cached, a count Habit's Done stops waiting for the count and queues 1", async () => {
  jest.useFakeTimers();
  const api = fakeApi();
  jest.mocked(apiFetch).mockImplementationOnce(() => new Promise(jest.fn()));
  await mountIn(createQueryClient());

  foregroundHandler()(press("add-one"));
  await act(() => jest.advanceTimersByTimeAsync(5000));

  expect(api.writes[0]?.body).toMatchObject({ count: 1 });
  jest.useRealTimers();
});

test("the notification clears only once the check is queued", async () => {
  fakeApi();
  const client = createQueryClient();
  await mountIn(client);
  let queued = -1;
  mockCancelDisplayed.mockImplementationOnce(() => {
    queued = client.getMutationCache().getAll().length;

    return Promise.resolve();
  });

  await act(() => foregroundHandler()(press("done")));

  expect(queued).toBe(1);
});

test("a plain tap or an unknown button saves nothing", async () => {
  const api = fakeApi();
  await mountIn(createQueryClient());

  await act(() => foregroundHandler()(press("default", EventType.PRESS)));
  await act(() => foregroundHandler()(press("snooze")));

  expect(api.writes).toEqual([]);
  expect(mockCancelDisplayed).not.toHaveBeenCalled();
});

test("with the app in the background, a tap joins the running app's queue", async () => {
  const api = fakeApi();
  await mountIn(createQueryClient());

  await backgroundHandler()(press("done"));

  expect(api.writes).toHaveLength(1);
  expect(persistQueryClientRestore).not.toHaveBeenCalled();
});

test("with the app closed, a tap restores the stored queue, saves and stores it again", async () => {
  const api = fakeApi();
  const { unmount } = await mountIn(createQueryClient());
  await unmount();

  await backgroundHandler()(press("done"));

  expect(persistQueryClientRestore).toHaveBeenCalled();
  expect(api.writes).toHaveLength(1);
  expect(persistQueryClientSave).toHaveBeenCalled();
});

test("with the app closed and the count's fetch failing, a count Habit's Done still queues 1 and stores it", async () => {
  const api = fakeApi();

  await backgroundHandler()(press("add-one"));

  expect(api.writes[0]?.body).toMatchObject({ count: 1 });
  expect(persistQueryClientSave).toHaveBeenCalled();
});

test("with the app closed, the queue is stored even when clearing the notification fails", async () => {
  fakeApi();
  mockCancelDisplayed.mockRejectedValueOnce(new Error("no notification"));

  await expect(backgroundHandler()(press("done"))).rejects.toThrow("no notification");

  expect(persistQueryClientSave).toHaveBeenCalled();
});

test("a background event that isn't a button tap does nothing", async () => {
  const api = fakeApi();

  await backgroundHandler()(press("done", EventType.DELIVERED));

  expect(api.writes).toEqual([]);
  expect(persistQueryClientRestore).not.toHaveBeenCalled();
});

const delivered = (data: Record<string, string>): Event => ({
  type: EventType.DELIVERED,
  detail: { notification: { id: "42", data } },
});

test("an alarm that rings with the app on screen opens the alarm screen", async () => {
  await mountIn(createQueryClient());

  await act(() => foregroundHandler()(delivered({ habit: "walk", habitId: "walk" })));

  expect(JournalAndroid.showAlarmScreen).toHaveBeenCalledTimes(1);
});

test.each([
  ["a reminder delivered", delivered({ habit: "walk" })],
  ["a tap on an alarm", { ...delivered({ habitId: "walk" }), type: EventType.PRESS }],
])("%s with the app on screen opens no alarm screen", async (_, event) => {
  await mountIn(createQueryClient());

  await act(() => foregroundHandler()(event));

  expect(JournalAndroid.showAlarmScreen).not.toHaveBeenCalled();
});

const NOTICE_DATA = { habit: "walk", ring: "70" };

const notice = (action: string, data: Record<string, string> = NOTICE_DATA): Event => ({
  type: EventType.ACTION_PRESS,
  detail: { pressAction: { id: action }, notification: { id: "upcoming-70", data } },
});

describe("the upcoming-alarm notice", () => {
  // Local noon is the same Day in Toronto and in UTC, where CI runs; an earlier test leaves real timers on.
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 10, 6, 12, 0) }));

  const ring = { id: "70", title: "Walk", data: { habit: "walk", habitId: "walk" } };
  const sixPm = new Date(2026, 10, 6, 18, 0).getTime();

  const ringTrigger = (repeatFrequency?: RepeatFrequency): Trigger => ({
    type: TriggerType.TIMESTAMP,
    timestamp: sixPm,
    ...(repeatFrequency !== undefined && { repeatFrequency }),
    alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
  });

  const scheduledRing = (trigger: Trigger) =>
    jest
      .spyOn(notifee, "getTriggerNotifications")
      .mockResolvedValueOnce([{ notification: ring, trigger }]);

  test("Dismiss silences today's ring, keeps tomorrow's and logs nothing", async () => {
    const api = fakeApi();
    scheduledRing(ringTrigger(RepeatFrequency.DAILY));

    await backgroundHandler()(notice("dismiss-ring"));

    expect(mockCreateTrigger).toHaveBeenCalledWith(
      ring,
      expect.objectContaining({
        timestamp: new Date(2026, 10, 7, 18, 0).getTime(),
        repeatFrequency: RepeatFrequency.DAILY,
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      }),
    );
    expect(mockCancelDisplayed).toHaveBeenCalledWith("upcoming-70");
    const { result } = await renderHook(useSilencedAlarms);

    expect(result.current).toContain("walk");
    expect(api.writes).toEqual([]);
    expect(persistQueryClientRestore).not.toHaveBeenCalled();
  });

  test("Dismiss on a weekly ring moves it a week", async () => {
    scheduledRing(ringTrigger(RepeatFrequency.WEEKLY));

    await backgroundHandler()(notice("dismiss-ring"));

    expect(mockCreateTrigger).toHaveBeenCalledWith(
      ring,
      expect.objectContaining({ timestamp: new Date(2026, 10, 13, 18, 0).getTime() }),
    );
  });

  test.each([
    ["a ring that never repeats", ringTrigger()],
    ["a ring on an interval trigger", { type: TriggerType.INTERVAL, interval: 60 } as const],
  ])("Dismiss cancels %s", async (_name, trigger) => {
    scheduledRing(trigger);

    await backgroundHandler()(notice("dismiss-ring"));

    expect(mockCancelTrigger).toHaveBeenCalledWith("70");
    expect(mockCreateTrigger).not.toHaveBeenCalled();
  });

  test("Dismiss after the ring is gone clears only the notice", async () => {
    jest.spyOn(notifee, "getTriggerNotifications").mockResolvedValueOnce([]);

    await backgroundHandler()(notice("dismiss-ring"));

    expect(mockCancelDisplayed).toHaveBeenCalledWith("upcoming-70");
    expect(mockCancelTrigger).not.toHaveBeenCalled();
  });

  test("Dismiss without a ring or as a plain tap does nothing", async () => {
    const handler = backgroundHandler();

    await handler(notice("dismiss-ring", { habit: "walk" }));
    await handler({ ...notice("dismiss-ring"), type: EventType.PRESS });

    expect(mockCancelDisplayed).not.toHaveBeenCalled();
  });

  test("Done logs the Day and skips today's ring", async () => {
    const api = fakeApi();
    await mountIn(createQueryClient());
    scheduledRing(ringTrigger(RepeatFrequency.DAILY));

    await act(() => foregroundHandler()(notice("done")));

    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(mockCreateTrigger).toHaveBeenCalledWith(
      ring,
      expect.objectContaining({ timestamp: new Date(2026, 10, 7, 18, 0).getTime() }),
    );
  });

  test("a count Habit's Done adds one and keeps the ring, since the count may fall short", async () => {
    const api = fakeApi();
    await mountIn(createQueryClient());
    const getTriggers = jest.spyOn(notifee, "getTriggerNotifications");

    await act(() => foregroundHandler()(notice("add-one")));

    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(getTriggers).not.toHaveBeenCalled();
  });
});

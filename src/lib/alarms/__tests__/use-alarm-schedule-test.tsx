import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  CHECK_IN_PROMPT_IDS,
  daysFrom,
  notificationId,
  shiftDay,
  torontoDay,
  type Connection,
  type Counts,
  type Habit,
  type RestPeriod,
} from "@/core";
import type { ReactNode } from "react";
import notifee, {
  AlarmType,
  AuthorizationStatus,
  RepeatFrequency,
  TriggerType,
} from "react-native-notify-kit";

import { NetworkError } from "@/lib/api/errors";
import { pickAlarmSound } from "@/lib/alarms/alarm-sound.android";
import { toggleSilenced } from "@/lib/alarms/silenced-alarms.android";
import { isUpcomingId } from "@/lib/alarms/upcoming";
import { useAlarmSchedule } from "@/lib/alarms/use-alarm-schedule.android";
import { invalidateHabits } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../../modules/journal-android";
import type * as AlarmSound from "@/lib/alarms/alarm-sound.android";
import type * as SilencedAlarms from "@/lib/alarms/silenced-alarms.android";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, reply } from "../../../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { connection, habit as fixtureHabit } from "../../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("@/lib/alarms/alarm-sound", () =>
  jest.requireActual<typeof AlarmSound>("@/lib/alarms/alarm-sound.android"),
);

jest.mock("@/lib/alarms/silenced-alarms", () =>
  jest.requireActual<typeof SilencedAlarms>("@/lib/alarms/silenced-alarms.android"),
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

const habit = (over: Partial<Habit> = {}) =>
  fixtureHabit({
    id: "out-of-bed",
    name: "Out of bed",
    startDate: "",
    alarm: { time: "07:15", kind: "alarm" },
    ...over,
  });

const priya = connection({
  id: 1,
  name: "Priya",
  closeness: "",
  circles: [],
  cadenceDays: null,
  lastContactedOn: null,
  meetups: [{ label: "Dragon boat", days: [2], time: "18:30" }],
});

interface Answers {
  habits: Habit[] | Error;
  counts?: Counts;
  connections: Connection[] | Error;
  restPeriods?: RestPeriod[];
  /** Every Habit's older Days, as the history serves them. */
  history?: Counts;
}

function serve({ habits, counts = {}, connections, restPeriods = [], history = {} }: Answers) {
  fakeApi({
    "/api/habits": reply(habits instanceof Error ? habits : { habits, counts }),
    "/api/connections": reply(connections instanceof Error ? connections : { connections }),
    "/api/streaks": reply({ counts: history, durations: {}, skips: {}, restPeriods }),
  });
}

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

async function mount(answers: Answers) {
  serve(answers);
  const client = createQueryClient();

  await renderHook(useAlarmSchedule, { wrapper: wrapperFor(client) });

  return client;
}

// spyOn hands back notify-kit's existing mocks, typed as standalone functions.
const mockCreateTriggerNotification = jest.spyOn(notifee, "createTriggerNotification");
const mockCancelTriggerNotifications = jest.spyOn(notifee, "cancelTriggerNotifications");
const mockGetNotificationSettings = jest.spyOn(notifee, "getNotificationSettings");
const mockRequestPermission = jest.spyOn(notifee, "requestPermission");
const mockDisplayNotification = jest.spyOn(notifee, "displayNotification");
const mockCancelDisplayed = jest.spyOn(notifee, "cancelDisplayedNotification");

const isNotice = ([notification]: Parameters<typeof notifee.createTriggerNotification>) =>
  isUpcomingId(notification.id ?? "");

// Rings and reminders; the upcoming-alarm notices before them are `notices()`.
const scheduled = () => mockCreateTriggerNotification.mock.calls.filter((call) => !isNotice(call));

const notices = () => mockCreateTriggerNotification.mock.calls.filter((call) => isNotice(call));

beforeEach(() => jest.clearAllMocks());

test("an alarm Habit rings over the lock screen on an alarm-clock trigger, daily", async () => {
  await mount({ habits: [habit()], connections: [] });

  await waitFor(() => expect(JournalAndroid.setAlarms).toHaveBeenCalled());

  const [notification, trigger] = scheduled()[0] ?? [];

  expect(notification).toMatchObject({
    id: String(notificationId("out-of-bed")),
    title: "Out of bed",
    data: { habitId: "out-of-bed" },
    android: {
      channelId: "alarms-sound",
      ongoing: true,
      loopSound: true,
      category: "alarm",
      fullScreenAction: { launchActivity: "expo.modules.journalandroid.AlarmActivity" },
    },
  });
  expect(trigger).toMatchObject({
    repeatFrequency: RepeatFrequency.DAILY,
    alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
  });
});

test("a persistent Habit stays on screen quietly, without looping or a ring screen", async () => {
  await mount({
    habits: [habit({ alarm: { time: "07:15", kind: "persistent" } })],
    connections: [],
  });

  await waitFor(() => expect(scheduled()).toHaveLength(1));

  const [notification] = scheduled()[0] ?? [];

  expect(notification?.android).toMatchObject({ channelId: "persistent", ongoing: true });
  expect(notification?.android).not.toHaveProperty("loopSound");
  expect(notification?.android).not.toHaveProperty("fullScreenAction");
});

test("a Habit's notification carries Done, Skip and Postpone buttons that run in the background", async () => {
  await mount({ habits: [habit()], connections: [priya] });

  await waitFor(() => expect(scheduled()).toHaveLength(2));

  const [alarm, meetup] = scheduled().map(([notification]) => notification);

  expect(alarm?.data).toEqual({ habit: "out-of-bed", habitId: "out-of-bed" });
  expect(alarm?.android?.actions).toEqual([
    { title: "Done", pressAction: { id: "done" } },
    { title: "Skip", pressAction: { id: "skip" } },
    { title: "Postpone", pressAction: { id: "postpone" } },
  ]);
  expect(meetup?.android).not.toHaveProperty("actions");
});

test("a meetup reminder repeats weekly beside the Habit alarms", async () => {
  await mount({ habits: [habit()], connections: [priya] });

  await waitFor(() => expect(scheduled()).toHaveLength(2));

  expect(scheduled()[1]?.[0].title).toBe("Seeing Priya at Dragon boat");
  expect(scheduled()[1]?.[1]).toMatchObject({ repeatFrequency: RepeatFrequency.WEEKLY });
});

test("each reschedule replaces the old schedule and hands the widget its rows", async () => {
  await mount({ habits: [habit()], connections: [] });

  await waitFor(() => expect(JournalAndroid.setAlarms).toHaveBeenCalled());

  expect(mockCancelTriggerNotifications).toHaveBeenCalledWith(["trigger1", "trigger2"]);
  expect(JSON.parse(jest.mocked(JournalAndroid.setAlarms).mock.calls[0]![0])).toEqual([
    { id: "out-of-bed", name: "Out of bed", time: "07:15", days: [0, 1, 2, 3, 4, 5, 6] },
  ]);
});

test("a reschedule keeps the Check-in prompt's triggers", async () => {
  jest
    .spyOn(notifee, "getTriggerNotificationIds")
    .mockResolvedValueOnce(["7", String(CHECK_IN_PROMPT_IDS[0]), String(CHECK_IN_PROMPT_IDS[1])]);
  await mount({ habits: [habit()], connections: [] });

  await waitFor(() => expect(mockCancelTriggerNotifications).toHaveBeenCalledWith(["7"]));
});

test("a reschedule keeps a postponed reminder while its Habit's Day is open", async () => {
  jest
    .spyOn(notifee, "getTriggerNotificationIds")
    .mockResolvedValueOnce(["7", "postponed-out-of-bed", "postponed-gone"]);
  await mount({ habits: [habit()], connections: [] });

  await waitFor(() =>
    expect(mockCancelTriggerNotifications).toHaveBeenCalledWith(["7", "postponed-gone"]),
  );
});

test("a reschedule drops a postponed reminder once its Habit's Day is logged", async () => {
  jest.spyOn(notifee, "getTriggerNotificationIds").mockResolvedValueOnce(["postponed-out-of-bed"]);
  await mount({
    habits: [habit()],
    counts: { [torontoDay(new Date())]: { "out-of-bed": 1 } },
    connections: [],
  });

  await waitFor(() =>
    expect(mockCancelTriggerNotifications).toHaveBeenCalledWith(["postponed-out-of-bed"]),
  );
});

test("silencing a Habit drops its postponed reminder", async () => {
  await mount({ habits: [habit()], connections: [] });
  await waitFor(() => expect(JournalAndroid.setAlarms).toHaveBeenCalled());
  jest.spyOn(notifee, "getTriggerNotificationIds").mockResolvedValueOnce(["postponed-out-of-bed"]);

  await act(() => toggleSilenced("out-of-bed"));

  await waitFor(() =>
    expect(mockCancelTriggerNotifications).toHaveBeenLastCalledWith(["postponed-out-of-bed"]),
  );
  await act(() => toggleSilenced("out-of-bed"));
});

test("a failed Habits load keeps the last schedule", async () => {
  const client = await mount({ habits: new NetworkError("offline"), connections: [priya] });

  await waitFor(() => expect(client.getQueryState(["connections"])?.status).toBe("success"));

  expect(mockCancelTriggerNotifications).not.toHaveBeenCalled();
});

test("a failed Connections load drops only their reminders", async () => {
  await mount({ habits: [habit()], connections: new NetworkError("offline") });

  await waitFor(() => expect(scheduled()).toHaveLength(1));

  expect(scheduled()[0]?.[0].title).toBe("Out of bed");
});

test("a Habit save reschedules with the new alarm", async () => {
  const client = await mount({ habits: [habit()], connections: [] });

  await waitFor(() => expect(scheduled()).toHaveLength(1));
  serve({ habits: [habit({ alarm: { time: "06:00", kind: "alarm" } })], connections: [] });
  await invalidateHabits(client);

  await waitFor(() => expect(JournalAndroid.setAlarms).toHaveBeenCalledTimes(2));
});

test("picking a new alarm sound moves every alarm onto its channel", async () => {
  await mount({ habits: [habit()], connections: [] });

  await waitFor(() => expect(scheduled()).toHaveLength(1));
  jest.mocked(JournalAndroid.pickAlarmSound).mockResolvedValueOnce({ title: "Here Comes the Sun" });
  jest.mocked(JournalAndroid.createAlarmChannel).mockReturnValueOnce("alarms-song");
  await pickAlarmSound();

  await waitFor(() => expect(scheduled()).toHaveLength(2));
  expect(scheduled()[1]?.[0].android?.channelId).toBe("alarms-song");
});

test("backing out of the sound picker keeps the schedule", async () => {
  await mount({ habits: [habit()], connections: [] });

  await waitFor(() => expect(scheduled()).toHaveLength(1));
  await pickAlarmSound();

  expect(JournalAndroid.createAlarmChannel).toHaveBeenCalledTimes(1);
});

describe("before Android has asked", () => {
  const restoreAnswered = jest.fn<undefined, []>();

  beforeEach(async () => {
    const answered = await notifee.getNotificationSettings();
    // Every reschedule reads the settings: Habits and Connections load separately.
    mockGetNotificationSettings.mockResolvedValue({
      ...answered,
      authorizationStatus: AuthorizationStatus.NOT_DETERMINED,
    });
    restoreAnswered.mockImplementation(() => {
      mockGetNotificationSettings.mockResolvedValue(answered);
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    restoreAnswered();
  });

  test("asks for notification permission with the first Alarm, before scheduling it", async () => {
    await mount({ habits: [habit()], connections: [] });

    await waitFor(() => expect(scheduled()).toHaveLength(1));
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  test("doesn't ask at launch while there is no Alarm or reminder to show", async () => {
    await mount({ habits: [], connections: [] });

    await waitFor(() => expect(JournalAndroid.setAlarms).toHaveBeenCalled());
    expect(mockGetNotificationSettings).not.toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});

test("doesn't ask again once the owner has answered", async () => {
  await mount({ habits: [habit()], connections: [] });

  await waitFor(() => expect(mockGetNotificationSettings).toHaveBeenCalled());

  expect(mockRequestPermission).not.toHaveBeenCalled();
});

test("Rest mode keeps Habit alarms quiet until the morning after it ends; meetup reminders still ring", async () => {
  const today = torontoDay(new Date());
  const end = shiftDay(today, 2);

  await mount({ habits: [habit()], connections: [priya], restPeriods: [{ start: today, end }] });

  await waitFor(() =>
    expect(
      scheduled().find(([notification]) => notification.title === "Out of bed")?.[1],
    ).toMatchObject({
      timestamp: new Date(`${shiftDay(end, 1)}T07:15`).getTime(),
    }),
  );
  expect(
    scheduled().some(([notification]) => notification.title === "Seeing Priya at Dragon boat"),
  ).toBe(true);
});

const ringAt = () => scheduled().at(-1)?.[1];

describe("today's ring", () => {
  // Local noon is the same Day in Toronto and in UTC, where CI runs.
  beforeEach(() => jest.setSystemTime(new Date(2026, 10, 6, 12, 0)));

  const evening = habit({ alarm: { time: "18:00", kind: "alarm" } });
  const today = { timestamp: new Date(2026, 10, 6, 18, 0).getTime() };
  const tomorrow = { timestamp: new Date(2026, 10, 7, 18, 0).getTime() };

  test("rings later today while the Day is open", async () => {
    await mount({ habits: [evening], connections: [] });

    await waitFor(() => expect(ringAt()).toMatchObject(today));
  });

  test("waits for tomorrow once today's Day is logged", async () => {
    await mount({
      habits: [evening],
      counts: { "2026-11-06": { "out-of-bed": 1 } },
      connections: [],
    });

    await waitFor(() => expect(ringAt()).toMatchObject(tomorrow));
  });

  test("silenced by hand waits for tomorrow, and comes back when unsilenced", async () => {
    await mount({ habits: [evening], connections: [] });
    await waitFor(() => expect(ringAt()).toMatchObject(today));

    await act(() => toggleSilenced("out-of-bed"));
    await waitFor(() => expect(ringAt()).toMatchObject(tomorrow));

    await act(() => toggleSilenced("out-of-bed"));
    await waitFor(() => expect(ringAt()).toMatchObject(today));
  });

  test("a plant that did yesterday holds back today's ring once its history loads", async () => {
    const history = Object.fromEntries(
      daysFrom("2026-09-01", "2026-11-05").map((day) => [day, { "out-of-bed": 1 }]),
    );

    await mount({
      habits: [{ ...evening, startDate: "2026-09-01" }],
      history,
      connections: [],
    });

    await waitFor(() => expect(ringAt()).toMatchObject(tomorrow));
  });
});

describe("the upcoming-alarm notice", () => {
  // Local noon is the same Day in Toronto and in UTC, where CI runs.
  beforeEach(() => jest.setSystemTime(new Date(2026, 10, 6, 12, 0)));

  const ringId = String(notificationId("out-of-bed"));

  test("shows quietly two hours before an alarm, with Done, Skip and Dismiss, until the ring", async () => {
    await mount({ habits: [habit({ alarm: { time: "18:00", kind: "alarm" } })], connections: [] });

    await waitFor(() => expect(notices()).toHaveLength(1));
    const [notice, trigger] = notices()[0] ?? [];

    expect(notice).toMatchObject({
      id: `upcoming-${ringId}`,
      title: "Out of bed",
      body: "Rings at 6:00 PM",
      data: { habit: "out-of-bed", ring: ringId },
      android: { channelId: "upcoming", timeoutAfter: 2 * 60 * 60_000, onlyAlertOnce: true },
    });
    expect(notice?.android?.actions?.map(({ title }) => title)).toEqual([
      "Done",
      "Skip",
      "Dismiss",
    ]);
    expect(trigger).toMatchObject({
      timestamp: new Date(2026, 10, 6, 16, 0).getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
      alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
    });
    expect(mockDisplayNotification).not.toHaveBeenCalled();
  });

  test("a quiet reminder gets none", async () => {
    await mount({
      habits: [habit({ alarm: { time: "18:00", kind: "persistent" } })],
      connections: [],
    });

    await waitFor(() => expect(JournalAndroid.setAlarms).toHaveBeenCalled());
    expect(notices()).toEqual([]);
  });

  test("an alarm inside the two hours shows its notice now, until the ring", async () => {
    await mount({ habits: [habit({ alarm: { time: "13:00", kind: "alarm" } })], connections: [] });

    await waitFor(() => expect(mockDisplayNotification).toHaveBeenCalled());
    expect(mockDisplayNotification.mock.calls[0]?.[0]).toMatchObject({
      id: `upcoming-${ringId}`,
      android: { timeoutAfter: 60 * 60_000 },
    });
    expect(notices()[0]?.[1]).toMatchObject({ timestamp: new Date(2026, 10, 7, 11, 0).getTime() });
  });

  test("a One-off inside the two hours shows its notice now and schedules none", async () => {
    await mount({
      habits: [
        habit({
          startDate: "2026-11-06",
          target: { type: "once", count: 1, days: [] },
          alarm: { time: "13:00", kind: "alarm" },
        }),
      ],
      connections: [],
    });

    await waitFor(() => expect(mockDisplayNotification).toHaveBeenCalled());
    expect(notices()).toEqual([]);
  });

  test("a reschedule clears a shown notice whose ring is no longer near", async () => {
    const trigger = { type: TriggerType.TIMESTAMP, timestamp: 0 } as const;
    const shown = (id?: string) => ({ ...(id !== undefined && { id }), notification: {}, trigger });

    jest
      .spyOn(notifee, "getDisplayedNotifications")
      .mockResolvedValueOnce([shown(`upcoming-${ringId}`), shown("42"), shown()]);

    await mount({
      habits: [habit({ alarm: { time: "13:00", kind: "alarm" } })],
      counts: { "2026-11-06": { "out-of-bed": 1 } },
      connections: [],
    });

    await waitFor(() => expect(mockCancelDisplayed).toHaveBeenCalledWith(`upcoming-${ringId}`));
    expect(mockCancelDisplayed).toHaveBeenCalledTimes(1);
    expect(mockDisplayNotification).not.toHaveBeenCalled();
  });
});

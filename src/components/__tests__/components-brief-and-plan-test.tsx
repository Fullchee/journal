import {
  PROSE_MISSING,
  type BriefBody,
  type BriefRow,
  type Connection,
  type PlanTask,
  type PoolPlan,
  type WeekDay,
} from "@/core";
import { render, screen, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";

import { ConnectionsTodaySection } from "@/components/connections-today-section";
import { BlocksView, ProposedDay } from "@/components/plan-day/blocks-view";
import { DayTimeline } from "@/components/plan-day/day-timeline";
import { TriageList } from "@/components/plan-day/triage-list";
import { SessionBriefView } from "@/components/session-brief-view";
import { WeeklyReviewDays } from "@/components/weekly-review-days";
import { useIsWide } from "@/hooks/use-is-wide";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { connection } from "../../../jest/fixtures";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Link: ({ children }: { children: unknown }) => children,
}));

jest.mock("@/hooks/use-is-wide", () => ({ useIsWide: jest.fn() }));

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: () => true }));

interface ConnectionsState {
  data: { connections: Connection[] };
}

const mockConnections: ConnectionsState = { data: { connections: [] } };

jest.mock("@/lib/data/connections", () => ({
  useConnections: () => mockConnections,
  useLogInteraction: () => jest.fn(),
  useUpdateConnection: () => ({ mutate: jest.fn() }),
}));

beforeEach(() => {
  jest.mocked(useIsWide).mockReturnValue(false);
});

const JOB = "6h9ggGQqPMhPGGJJ";

const task = (id: string, projectId = "home"): PlanTask => ({
  id,
  content: `Task ${id}`,
  projectId,
  sectionId: null,
  priority: 1,
  dueDate: null,
  labels: [],
});

const sized = (id: string, projectId = "home") => ({ ...task(id, projectId), minutes: 30 });

const row = (over: Partial<BriefRow> = {}): BriefRow => ({
  day: "2026-11-03",
  time: "9:15 AM",
  zone: "Rain",
  score: 3,
  where: "Home",
  doing: "Work",
  onMyMind: "Deadline",
  note: "",
  tense: "A lot",
  low: "",
  tired: "A lot",
  tiredButWired: false,
  ...over,
});

const brief = (over: Partial<BriefBody["facts"]>, prose: BriefBody["prose"]): BriefBody => ({
  facts: {
    start: "2026-11-01",
    end: "2026-11-07",
    rows: [row({ onMyMind: "", note: "Quiet day" })],
    sleep: [],
    lows: [],
    highs: [row()],
    habits: [],
    oneOffs: [],
    skips: [],
    ...over,
  },
  prose,
});

const weekDay = (over: Partial<WeekDay>): WeekDay => ({
  day: "2026-11-03",
  checkIns: [],
  sleep: null,
  activity: null,
  workouts: [],
  habits: [],
  ...over,
});

describe("SessionBriefView", () => {
  it("says so when the window has no Check-ins", async () => {
    await render(<SessionBriefView brief={brief({ rows: [] }, null)} />);

    expect(screen.getByText("No Check-ins in this window.")).toBeOnTheScreen();
  });

  it("notes that the prose is missing, and falls back to the note for the day", async () => {
    await render(
      <SessionBriefView
        brief={brief({ sleep: [{ date: "2026-11-02", durationMin: 480, sleepScore: null }] }, null)}
      />,
    );

    expect(screen.getByText(/The summary couldn.t be written/)).toBeOnTheScreen();
    expect(screen.getAllByText(PROSE_MISSING)).toHaveLength(2);
    expect(screen.getByText("Quiet day")).toBeOnTheScreen();
  });

  it("lists the Highs", async () => {
    await render(
      <SessionBriefView brief={brief({}, { summary: "Fine.", patterns: [], toRaise: "Sleep." })} />,
    );

    expect(screen.getByText(/2026-11-03 9:15 AM, Rain, Home, Work: Deadline/)).toBeOnTheScreen();
  });

  it("pairs a Low with the night before it, without the sleep score", async () => {
    const storm = row({ day: "2026-11-10", zone: "Storm", score: 1, onMyMind: "" });

    await render(
      <SessionBriefView
        brief={brief(
          {
            lows: [storm],
            sleep: [{ date: "2026-11-10", durationMin: 310, sleepScore: 41 }],
          },
          null,
        )}
      />,
    );

    expect(
      screen.getByText("• 2026-11-10 9:15 AM, Storm, Home, Work · after 5.2h sleep"),
    ).toBeOnTheScreen();
    expect(screen.getByText("• 2026-11-03 9:15 AM, Rain, Home, Work: Deadline")).toBeOnTheScreen();
    expect(screen.queryByText(/41/)).not.toBeOnTheScreen();
  });
});

describe("WeeklyReviewDays", () => {
  it("quotes a note, and leaves out a missing sleep score and stress", async () => {
    await render(
      <WeeklyReviewDays
        days={[
          weekDay({
            checkIns: [row({ note: "Slow start" }), row({ note: "" })],
            sleep: { date: "2026-11-03", durationMin: 420, sleepScore: null },
            activity: {
              date: "2026-11-03",
              steps: 8000,
              moderateMin: null,
              vigorousMin: null,
              restingHr: null,
              avgStress: null,
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText(/“Slow start”/)).toBeOnTheScreen();
    expect(screen.getByText("Sleep: 7.0h")).toBeOnTheScreen();
    expect(screen.getByText("Activity: 8,000 steps")).toBeOnTheScreen();
  });
});

describe("ConnectionsTodaySection", () => {
  it("opens a person from Today", async () => {
    mockConnections.data = { connections: [connection({ id: 3, name: "Mom", cadenceDays: 7 })] };

    await render(<ConnectionsTodaySection />);
    await userEvent.press(screen.getByText("Mom"));

    expect(router.push).toHaveBeenCalledWith("/connections/3");
  });
});

describe("BlocksView", () => {
  it("lays the tasks beside the calendar on a wide screen, with blank minutes by default", async () => {
    jest.mocked(useIsWide).mockReturnValue(true);

    await render(
      <BlocksView tasks={[task("a")]} minutes={{}} onMinutes={jest.fn()} calendar={null} />,
    );

    expect(screen.getByLabelText("Minutes for Task a")).toHaveDisplayValue("");
  });
});

describe("ProposedDay", () => {
  it("names what fits nowhere in each pool, and the job hours for a job task", async () => {
    const pools: PoolPlan[] = [
      { pool: "personal", placed: [], unplaced: [{ tasks: [sized("p")], minutes: 30 }], over: 30 },
      { pool: "job", placed: [], unplaced: [], over: 15 },
    ];

    await render(<ProposedDay pools={pools} busy={[]} />);

    const alerts = screen.getAllByRole("alert");

    expect(alerts[0]).toHaveTextContent(/Personal: 30m over: Task p fit nowhere\./);
    expect(alerts[0]).not.toHaveTextContent(/Job hours/);
    expect(alerts[1]).toHaveTextContent(/Job: 15m over/);
  });

  it("adds the job hours when a job task fits nowhere", async () => {
    const pools: PoolPlan[] = [
      { pool: "job", placed: [], unplaced: [{ tasks: [sized("j", JOB)], minutes: 30 }], over: 30 },
    ];

    await render(<ProposedDay pools={pools} busy={[]} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/Job hours are 09:00–17:00 on weekdays\./);
  });
});

describe("DayTimeline", () => {
  it("draws busy time inside the day and skips what falls outside it", async () => {
    const block = { tasks: [sized("a")], minutes: 30 };

    await render(
      <DayTimeline
        pools={[
          { pool: "job", placed: [{ start: 540, end: 570, block }], unplaced: [], over: 0 },
          { pool: "personal", placed: [{ start: 600, end: 630, block }], unplaced: [], over: 0 },
        ]}
        busy={[
          { start: 0, end: 400 },
          { start: 600, end: 660 },
          { start: 1330, end: 1400 },
        ]}
      />,
    );

    expect(screen.getByLabelText("Day timeline")).toBeOnTheScreen();
  });
});

describe("TriageList", () => {
  it("shows no date for an undated task", async () => {
    await render(
      <TriageList tasks={[task("a")]} proposals={null} choices={{}} onChoose={jest.fn()} />,
    );

    expect(screen.getByText("no date")).toBeOnTheScreen();
  });
});

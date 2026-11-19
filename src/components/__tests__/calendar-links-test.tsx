import type { CalendarLink, CalendarLinksBody, CalendarSeries } from "@/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";

import { CalendarLinks } from "@/components/habits/calendar-links";
import { EveningReviewRow } from "@/components/today/evening-review-row";
import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, pendingApi, reply, type Respond } from "../../../jest/fake-api";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const GYM_LINK: CalendarLink = {
  habit: "gym",
  calendarId: "fuyi@group",
  seriesId: "parl",
  summary: "120 Parl workout",
  assumeDone: true,
  ownCalendar: true,
};

const OTHER_LINK: CalendarLink = { ...GYM_LINK, habit: "sit", seriesId: "zoom", summary: "Zoom" };

const SIT: CalendarSeries = {
  calendarId: "me@x",
  calendarName: "Me",
  seriesId: "sit",
  summary: "Pape Meditation",
  ownCalendar: false,
  count: 5,
};

const PARL: CalendarSeries = {
  ...SIT,
  calendarId: "fuyi@group",
  seriesId: "parl",
  summary: "120 Parl workout",
};

const body = (links: CalendarLink[], series?: CalendarLinksBody["series"]): CalendarLinksBody =>
  series === undefined ? { links } : { links, series };

const serve = (links: Respond, series: Respond = reply(body([]))) =>
  fakeApi({ "/api/calendar-links": links, "/api/calendar-links?series=1": series });

const show = (node: React.ReactNode) =>
  render(<QueryClientProvider client={createQueryClient()}>{node}</QueryClientProvider>);

describe("CalendarLinks", () => {
  it("lists only this Habit's links and changes a link's default", async () => {
    const { writes } = serve(reply(body([GYM_LINK, OTHER_LINK])));

    await show(<CalendarLinks habit="gym" />);

    expect(await screen.findByText("120 Parl workout")).toBeOnTheScreen();
    expect(screen.queryByText("Zoom")).toBeNull();

    await userEvent.press(screen.getByRole("radio", { name: "Ask" }));

    await waitFor(() =>
      expect(writes).toEqual([
        {
          path: "/api/calendar-links",
          method: "POST",
          body: { type: "link", ...GYM_LINK, assumeDone: false },
        },
      ]),
    );
  });

  it("unlinks a series", async () => {
    const { writes } = serve(reply(body([GYM_LINK])));

    await show(<CalendarLinks habit="gym" />);
    await userEvent.press(await screen.findByRole("button", { name: "Unlink" }));

    await waitFor(() =>
      expect(writes[0]?.body).toEqual({
        type: "unlink",
        calendarId: "fuyi@group",
        seriesId: "parl",
      }),
    );
  });

  it("links a picked series as Ask, leaving out ones already linked here", async () => {
    const { writes } = serve(
      reply(body([GYM_LINK])),
      reply(body([GYM_LINK], { status: "ok", value: [PARL, SIT] })),
    );

    await show(<CalendarLinks habit="gym" />);
    await userEvent.press(await screen.findByRole("button", { name: "Link a recurring event" }));

    expect(await screen.findByText("Pape Meditation · Me · 5×")).toBeOnTheScreen();
    expect(screen.queryByText(/^120 Parl workout ·/)).toBeNull();

    await userEvent.press(await screen.findByText("Pape Meditation · Me · 5×"));

    await waitFor(() =>
      expect(writes[0]?.body).toEqual({
        type: "link",
        habit: "gym",
        calendarId: "me@x",
        seriesId: "sit",
        summary: "Pape Meditation",
        assumeDone: false,
        ownCalendar: false,
      }),
    );
    expect(await screen.findByRole("button", { name: "Link a recurring event" })).toBeOnTheScreen();
  });

  it("says when there is nothing left to link", async () => {
    serve(reply(body([])), reply(body([], { status: "ok", value: [] })));

    await show(<CalendarLinks habit="gym" />);
    expect(await screen.findByText("Not linked to any calendar event.")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Link a recurring event" }));

    expect(
      await screen.findByText("No other recurring events in the last 30 days."),
    ).toBeOnTheScreen();
  });

  it.each([
    [
      reply(body([], { status: "not-connected" })),
      "Google Calendar isn't connected. Run scripts/setup-google-calendar.sh.",
    ],
    [reply(body([], { status: "unreachable" })), "Couldn't reach Google Calendar."],
    [reply(body([])), "Couldn't load your calendars."],
    [reply(new ApiError(400, null)), "Couldn't load your calendars."],
  ])("explains a picker that can't list series (%#)", async (series, text) => {
    serve(reply(body([])), series);

    await show(<CalendarLinks habit="gym" />);
    await userEvent.press(await screen.findByRole("button", { name: "Link a recurring event" }));

    expect(await screen.findByText(text)).toBeOnTheScreen();
  });

  it("says so when a link can't be saved", async () => {
    fakeApi({
      "/api/calendar-links": reply(body([GYM_LINK])),
      "POST /api/calendar-links": reply(new ApiError(400, { error: "no such habit" })),
    });

    await show(<CalendarLinks habit="gym" />);
    await userEvent.press(await screen.findByRole("button", { name: "Unlink" }));

    expect(await screen.findByText("Couldn't save the link. Try again.")).toBeOnTheScreen();
  });

  it("ignores a default tap while a change is saving", async () => {
    serve(reply(body([GYM_LINK])));

    await show(<CalendarLinks habit="gym" />);
    const unlink = await screen.findByRole("button", { name: "Unlink" });

    pendingApi();
    jest.mocked(apiFetch).mockClear();
    await userEvent.press(unlink);
    await waitFor(() => expect(unlink).toBeDisabled());
    await userEvent.press(screen.getByRole("radio", { name: "Ask" }));

    const posts = jest.mocked(apiFetch).mock.calls.filter(([, init]) => init.method === "POST");

    expect(posts).toHaveLength(1);
  });
});

describe("EveningReviewRow", () => {
  const EVENING = new Date("2026-11-12T22:30:00Z");
  const AFTERNOON = new Date("2026-11-12T20:00:00Z");

  it("opens the Evening review in the evening once a Habit is linked", async () => {
    serve(reply(body([GYM_LINK])));

    await show(<EveningReviewRow now={EVENING} />);

    expect(await screen.findByRole("link", { name: /Evening review/ })).toBeOnTheScreen();
  });

  it.each([
    ["before 5 PM", [GYM_LINK], AFTERNOON],
    ["with no links", [], EVENING],
  ])("stays hidden %s", async (_when, links, now) => {
    serve(reply(body(links)));

    await show(<EveningReviewRow now={now} />);

    await waitFor(() => expect(screen.toJSON()).toBeNull());
  });
});

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";

import { WorkAnchor } from "@/components/today/work-anchor";
import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, reply, type Respond } from "../../../jest/fake-api";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

// Thursday 2026-11-12 in EST (UTC-5).
const DAY = "2026-11-12";
const WORK_HOURS = new Date(`${DAY}T10:00:00-05:00`);

const serve = (days: Respond, save: Respond = reply(undefined)) =>
  fakeApi({ [`/api/work/days?day=${DAY}`]: days, "POST /api/work/days": save });

const show = (now = WORK_HOURS) =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <WorkAnchor now={now} />
    </QueryClientProvider>,
  );

beforeEach(() => jest.mocked(apiFetch).mockClear());

describe("WorkAnchor", () => {
  it("shows the Work day's Anchor during job hours", async () => {
    serve(reply({ days: [{ day: DAY, anchor: "Review APP-101" }] }));

    await show();

    expect(await screen.findByText("Review APP-101")).toBeOnTheScreen();
    expect(screen.getByRole("heading", { name: "Anchor" })).toBeOnTheScreen();
  });

  it("reads the clock when given no time", async () => {
    jest.setSystemTime(WORK_HOURS);
    serve(reply({ days: [{ day: DAY, anchor: "Review APP-101" }] }));

    await render(
      <QueryClientProvider client={createQueryClient()}>
        <WorkAnchor />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Review APP-101")).toBeOnTheScreen();
  });

  it.each([
    ["before 09:00", new Date(`${DAY}T08:59:00-05:00`)],
    ["from 17:00", new Date(`${DAY}T17:00:00-05:00`)],
    ["on a weekend", new Date("2026-11-14T10:00:00-05:00")],
  ])("stays hidden and reads nothing %s", async (_when, now) => {
    serve(reply({ days: [{ day: DAY, anchor: "Review APP-101" }] }));

    await show(now);

    expect(screen.toJSON()).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty Anchor", { days: [{ day: DAY, anchor: "" }] }],
    ["no Work day row", { days: [] }],
  ])("offers to set the Anchor when the day has %s", async (_case, days) => {
    serve(reply(days));

    await show();

    expect(await screen.findByText("No Anchor yet.")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Set Anchor" }));
    expect(screen.getByLabelText("Anchor")).toHaveDisplayValue("");
  });

  it("saves an edited Anchor, trimmed, on the Work day", async () => {
    const { writes } = serve(reply({ days: [{ day: DAY, anchor: "" }] }));

    await show();
    await userEvent.press(await screen.findByRole("button", { name: "Set Anchor" }));
    await userEvent.paste(screen.getByLabelText("Anchor"), "  Fix the import job  ");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Fix the import job")).toBeOnTheScreen();
    expect(screen.getByText("Saved.")).toBeOnTheScreen();
    expect(writes).toEqual([
      {
        path: "/api/work/days",
        method: "POST",
        body: { rows: [{ day: DAY, anchor: "Fix the import job" }] },
      },
    ]);
  });

  it("saves from the keyboard's submit key", async () => {
    const { writes } = serve(reply({ days: [] }));

    await show();
    await userEvent.press(await screen.findByRole("button", { name: "Set Anchor" }));
    await userEvent.type(screen.getByLabelText("Anchor"), "Merge", { submitEditing: true });

    expect(await screen.findByText("Saved.")).toBeOnTheScreen();
    expect(screen.getByText("Merge")).toBeOnTheScreen();
    expect(writes).toHaveLength(1);
  });

  it("keeps the draft and says so when the save fails", async () => {
    serve(
      reply({ days: [{ day: DAY, anchor: "Review APP-101" }] }),
      reply(new ApiError(500, null)),
    );

    await show();
    await userEvent.press(await screen.findByRole("button", { name: "Change Anchor" }));
    await userEvent.type(screen.getByLabelText("Anchor"), " now");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't save/);
    expect(screen.getByLabelText("Anchor")).toHaveDisplayValue("Review APP-101 now");
  });

  it("drops the draft on Cancel", async () => {
    const { writes } = serve(reply({ days: [{ day: DAY, anchor: "Review APP-101" }] }));

    await show();
    await userEvent.press(await screen.findByRole("button", { name: "Change Anchor" }));
    await userEvent.paste(screen.getByLabelText("Anchor"), " later");
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Review APP-101")).toBeOnTheScreen();
    expect(writes).toEqual([]);
  });

  it("says when the Anchor doesn't load", async () => {
    serve(reply(new ApiError(400, null)));

    await show();

    await waitFor(() =>
      expect(screen.getByText("Couldn't load the Anchor. Pull to refresh.")).toBeOnTheScreen(),
    );
  });
});

import { render, screen, userEvent } from "@testing-library/react-native";
import { useState } from "react";

import { ConnectionForm } from "@/components/connection-form";
import type { ConnectionDraft } from "@/lib/data/connections";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../../jest/android-picker";

const DRAFT: ConnectionDraft = {
  name: "Mom",
  closeness: "",
  circles: [],
  cadenceDays: null,
  followUps: "",
  howWeMet: "",
  growCloser: false,
  contactId: null,
  metThroughId: null,
  links: [],
  meetups: [
    { label: "Dragon boat", days: [], time: "18:00" },
    { label: "Gym", days: [1] },
  ],
  dates: [
    { label: "Birthday", date: "--06-02", yearly: true },
    { label: "Moved", date: "2020-03-04", yearly: false },
  ],
};

const changes: ConnectionDraft[] = [];

const latest = () => changes.at(-1) ?? DRAFT;

function Harness() {
  const [draft, setDraft] = useState(DRAFT);

  return (
    <ConnectionForm
      draft={draft}
      knownCircles={[]}
      people={[]}
      canSave
      onChange={(next) => {
        changes.push(next);
        setDraft(next);
      }}
      onSave={jest.fn()}
      onCancel={jest.fn()}
    />
  );
}

afterEach(() => {
  changes.length = 0;
  pickOnAndroid().mockRestore();
});

describe("ConnectionForm", () => {
  it("edits the name, Grow closer and what to ask next time", async () => {
    await render(<Harness />);
    await userEvent.paste(screen.getByLabelText("Name"), "Mum");
    await userEvent.press(screen.getByLabelText("Grow closer"));
    await userEvent.paste(screen.getByLabelText("Ask about next time"), "- Her move");

    expect(latest()).toMatchObject({ name: "Mum", growCloser: true, followUps: "- Her move" });
  });

  it("edits one meetup and leaves the other as it was", async () => {
    await render(<Harness />);
    await userEvent.paste(screen.getAllByLabelText("Where you see them")[1]!, "Climbing");
    await userEvent.press(screen.getAllByRole("button", { name: "Tue" })[1]!);

    expect(latest().meetups).toEqual([DRAFT.meetups[0], { label: "Climbing", days: [1, 2] }]);
  });

  it("explains that a meetup with no weekdays has no reminder", async () => {
    await render(<Harness />);

    expect(screen.getByText("Pick weekdays to get a reminder before it.")).toBeOnTheScreen();
  });

  it("adds and removes meetups", async () => {
    await render(<Harness />);
    await userEvent.press(screen.getByRole("button", { name: "Add where you see them" }));

    expect(latest().meetups).toHaveLength(3);

    await userEvent.press(screen.getAllByRole("button", { name: "Remove" })[0]!);

    expect(latest().meetups.map((m) => m.label)).toEqual(["Gym", ""]);
  });

  it("edits dates: a yearless one keeps its year unknown, a one-off one keeps its year", async () => {
    pickOnAndroid(new Date(2026, 8, 9));
    await render(<Harness />);
    await userEvent.paste(screen.getAllByLabelText("What's the date")[0]!, "Mum's birthday");
    await userEvent.press(screen.getAllByLabelText(/^Date: /)[0]!);

    expect(latest().dates[0]).toEqual({ label: "Mum's birthday", date: "--09-09", yearly: true });

    await userEvent.press(screen.getAllByLabelText(/^Date: /)[1]!);

    expect(latest().dates[1]?.date).toBe("2026-09-09");
  });

  it("repeating a one-off date yearly keeps its year", async () => {
    await render(<Harness />);
    await userEvent.press(screen.getAllByLabelText("Every year")[1]!);

    expect(latest().dates[1]).toEqual({ label: "Moved", date: "2020-03-04", yearly: true });
  });

  it("removes a date", async () => {
    await render(<Harness />);
    await userEvent.press(screen.getAllByRole("button", { name: "Remove" })[2]!);

    expect(latest().dates.map((d) => d.label)).toEqual(["Moved"]);
  });
});

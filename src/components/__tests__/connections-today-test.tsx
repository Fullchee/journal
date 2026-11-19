import type { Connection } from "@/core";
import { ConnectionsToday, ReachedOut } from "@/ui";
import { render, screen, userEvent } from "@testing-library/react-native";

// A Wednesday.
// 10:00 in Toronto.
const NOW = new Date("2026-11-11T10:00:00-05:00");

const person = (overrides: Partial<Connection> & Pick<Connection, "id" | "name">): Connection => ({
  closeness: "",
  circles: [],
  cadenceDays: null,
  lastContactedOn: null,
  followUps: "",
  howWeMet: "",
  metThrough: null,
  introduced: [],
  links: [],
  meetups: [],
  dates: [],
  growCloser: false,
  planCheckedAt: null,
  contactId: null,
  ...overrides,
});

const SAM = person({
  id: 2,
  name: "Sam",
  cadenceDays: 14,
  lastContactedOn: "2026-10-01",
  followUps: "- Her move",
});

const handlers = () => ({ onOpen: jest.fn(), onReachedOut: jest.fn(), onPlanAnswered: jest.fn() });

const show = async (connections: Connection[], isOnline = true) => {
  const props = { connections, isOnline, now: NOW, ...handlers() };
  const { rerender } = await render(<ConnectionsToday {...props} />);

  return { rerender, props };
};

describe("ConnectionsToday", () => {
  it("renders nothing on a quiet day", async () => {
    await show([person({ id: 1, name: "Jo" })]);

    expect(screen.queryByText("Connections")).not.toBeOnTheScreen();
  });

  it("shows who I see at a meetup today, with what to ask, and opens them", async () => {
    const { props } = await show([
      person({
        id: 1,
        name: "Priya",
        followUps: "- New job",
        meetups: [{ label: "Dragon boat", days: [3] }],
      }),
    ]);

    expect(screen.getByText("Ask about: New job")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("link", { name: "Priya" }));
    expect(props.onOpen).toHaveBeenCalledWith(1);
  });

  it("lists dates in the next two weeks", async () => {
    await show([
      person({
        id: 5,
        name: "Ana",
        dates: [{ label: "Birthday", date: "1990-11-12", yearly: true }],
      }),
    ]);

    expect(screen.getByText("tomorrow")).toBeOnTheScreen();
  });

  it("logs a reach-out for an overdue person, then drops them", async () => {
    const { props } = await show([SAM]);

    await userEvent.press(screen.getByRole("button", { name: "Reached out" }));
    await userEvent.press(screen.getByRole("radio", { name: "Call" }));
    await userEvent.paste(screen.getByLabelText(/What did you talk about/), "her move");
    await userEvent.press(screen.getByRole("button", { name: "Log" }));

    expect(props.onReachedOut).toHaveBeenCalledWith(2, {
      kind: "call",
      note: "her move",
      minutes: null,
    });
    expect(screen.queryByText("Connections")).not.toBeOnTheScreen();
  });

  it("asks to make a plan and hides once answered", async () => {
    const { props } = await show([person({ id: 4, name: "Lee", growCloser: true })]);

    await userEvent.press(screen.getByRole("button", { name: "Not this week" }));

    expect(props.onPlanAnswered).toHaveBeenCalledWith(4);
    expect(screen.queryByText(/Make a plan/)).not.toBeOnTheScreen();
  });

  it("disables Grow closer answers offline", async () => {
    await show([person({ id: 4, name: "Lee", growCloser: true })], false);

    expect(screen.getByRole("button", { name: "Made a plan" })).toBeDisabled();
    expect(screen.getByText("Editing needs a connection.")).toBeOnTheScreen();
  });
});

const open = async () => {
  const onReachedOut = jest.fn();

  await render(<ReachedOut name="Sam" onReachedOut={onReachedOut} />);
  await userEvent.press(screen.getByRole("button", { name: "Reached out" }));

  return onReachedOut;
};

describe("ReachedOut", () => {
  it("logs a message with no note in one more tap", async () => {
    const onReachedOut = await open();

    await userEvent.press(screen.getByRole("button", { name: "Log" }));

    expect(onReachedOut).toHaveBeenCalledWith({ kind: "message", note: "", minutes: null });
    expect(screen.getByText("Logged. Nice one.")).toBeOnTheScreen();
  });

  it("asks for minutes only in person", async () => {
    const onReachedOut = await open();

    expect(screen.queryByLabelText("Minutes together")).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole("radio", { name: "In person" }));
    await userEvent.paste(screen.getByLabelText("Minutes together"), "90");
    await userEvent.press(screen.getByRole("button", { name: "Log" }));

    expect(onReachedOut).toHaveBeenCalledWith({ kind: "in-person", note: "", minutes: 90 });
  });

  it("drops minutes that are not a whole positive number", async () => {
    const onReachedOut = await open();

    await userEvent.press(screen.getByRole("radio", { name: "In person" }));
    await userEvent.paste(screen.getByLabelText("Minutes together"), "soon");
    await userEvent.press(screen.getByRole("button", { name: "Log" }));

    expect(onReachedOut).toHaveBeenCalledWith({ kind: "in-person", note: "", minutes: null });
  });

  it("logs nothing when cancelled", async () => {
    const onReachedOut = await open();

    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(onReachedOut).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reached out" })).toBeOnTheScreen();
  });
});

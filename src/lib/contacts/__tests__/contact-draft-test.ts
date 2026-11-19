import { contactDraft } from "@/lib/contacts/contact-draft";

const birthday = (date: { year?: number; month: number; day: number }) => ({
  id: "7",
  label: "birthday",
  date,
});

it("fills the name, the birthday as a yearly date and the contact id", () => {
  expect(
    contactDraft({
      id: "42",
      fullName: " Priya Shah ",
      dates: [birthday({ year: 1990, month: 3, day: 9 })],
    }),
  ).toEqual({
    name: "Priya Shah",
    dates: [{ label: "Birthday", date: "1990-03-09", yearly: true }],
    contactId: "42",
  });
});

it("adds no date for a contact without a birthday", () => {
  const anniversary = { id: "8", label: "anniversary", date: { year: 2015, month: 6, day: 1 } };

  expect(contactDraft({ id: "42", fullName: "Sam", dates: [anniversary] }).dates).toEqual([]);
});

it("stores a birthday without a year as --MM-DD", () => {
  expect(
    contactDraft({ id: "42", fullName: "Sam", dates: [birthday({ month: 2, day: 29 })] }).dates,
  ).toEqual([{ label: "Birthday", date: "--02-29", yearly: true }]);
});

it("leaves the name empty for the user to type when the contact has none", () => {
  expect(contactDraft({ id: "42", fullName: null, dates: [] })).toEqual({
    name: "",
    dates: [],
    contactId: "42",
  });
});

it("cuts a name to the 200 characters the API allows", () => {
  expect(contactDraft({ id: "42", fullName: "x".repeat(250), dates: [] }).name).toHaveLength(200);
});

import { withYear, type ConnectionDate } from "@/core";
import type { ContactDate, ContactDetails } from "expo-contacts";

import type { NewConnection } from "@/lib/data/connections";

// The API's name limit.
const MAX_NAME = 200;

const pad = (n: number) => String(n).padStart(2, "0");

// A contact's birthday may have no year; the API takes that as --MM-DD.
const birthdayOf = ({ year, month, day }: ContactDate): ConnectionDate => ({
  label: "Birthday",
  date: withYear(`${pad(month)}-${pad(day)}`, year === undefined ? null : String(year)),
  yearly: true,
});

/** A new person from a picked phone contact: their name, birthday and the contact's id. */
export function contactDraft({
  id,
  fullName,
  dates,
}: Pick<ContactDetails, "fullName" | "dates"> & { id: string }): NewConnection {
  const birthday = dates.find((d) => d.label === "birthday")?.date;

  return {
    name: (fullName ?? "").trim().slice(0, MAX_NAME),
    dates: birthday ? [birthdayOf(birthday)] : [],
    contactId: id,
  };
}

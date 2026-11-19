import { Contact, ContactField, requestPermissionsAsync } from "expo-contacts";

import { contactDraft } from "@/lib/contacts/contact-draft";
import type { NewConnection } from "@/lib/data/connections";

const FIELDS = [ContactField.FULL_NAME, ContactField.DATES] as const;

/** Opens the phone's contact picker; null when contacts permission is denied, nobody is picked or the read fails. */
export async function pickContact(): Promise<NewConnection | null> {
  // A contact deleted mid-pick or a phone with no picker throws; the form stays usable either way.
  try {
    const { granted } = await requestPermissionsAsync();

    if (!granted) return null;
    const contact = await Contact.presentPicker();

    return contact && contactDraft(await contact.getDetails(FIELDS));
  } catch {
    return null;
  }
}

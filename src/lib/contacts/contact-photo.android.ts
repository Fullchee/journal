import { skipToken, useQuery } from "@tanstack/react-query";
import { Contact, getPermissionsAsync } from "expo-contacts";

// A deleted contact or a revoked permission throws; either way the page shows no photo.
async function photoOf(contactId: string) {
  try {
    const { granted } = await getPermissionsAsync();

    return granted ? await new Contact(contactId).getImage() : null;
  } catch {
    return null;
  }
}

/** The linked phone contact's photo URI, read from the phone on each mount and never saved; null when there is none. */
export function useContactPhoto(contactId: string | null): string | null {
  const { data = null } = useQuery({
    queryKey: ["contact-photo", contactId],
    queryFn: contactId === null ? skipToken : () => photoOf(contactId),
  });

  return data;
}

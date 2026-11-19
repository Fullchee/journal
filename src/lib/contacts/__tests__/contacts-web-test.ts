import { useContactPhoto } from "@/lib/contacts/contact-photo";
import { pickContact } from "@/lib/contacts/pick-contact";

it("offers no contact picker and no photo off Android", () => {
  expect([pickContact, useContactPhoto("42")]).toEqual([null, null]);
});

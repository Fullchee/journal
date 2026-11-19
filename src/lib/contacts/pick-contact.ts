import type { NewConnection } from "@/lib/data/connections";

/** Picking from phone contacts is Android only (pick-contact.android.ts); elsewhere the form hides the button. */
export const pickContact: (() => Promise<NewConnection | null>) | null = null;
